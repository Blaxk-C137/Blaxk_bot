// moderation.js — antilink, antiword, anti-delete, autoviewonce + pipeline hooks
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function store(file, fallback) {
    const file_ = path.join(DATA_DIR, file);
    const load = () => {
        if (fs.existsSync(file_)) {
            try { return JSON.parse(fs.readFileSync(file_)); } catch { return fallback; }
        }
        return fallback;
    };
    return {
        load,
        save(data) { fs.writeFileSync(file_, JSON.stringify(data, null, 2)); }
    };
}

const linkStore = store('linkDeleteGroups.json', {});    // { [groupJid]: { enabled, action } }
const wordStore = store('antiwords.json', {});           // { [groupJid]: { enabled, action, words: [] } }
const settingsStore = store('settings.json', {});        // { antidelete: bool, autoviewonce: bool }

const LINK_REGEX = /https?:\/\/|wa\.me\//i;

// Pure: build a regex testing all banned words (word-boundary match, case-insensitive)
function buildWordRegex(words) {
    if (!words || !words.length) return null;
    const escaped = words.map(w => w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
    if (!escaped.length) return null;
    return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

// Warn helper shared by antilink/antiword — delegates to the group module's persistent warn store
function warnTarget(groupJid, targetJid) {
    const warnStore = store('warnCounts.json', {});
    const limitsStore = store('warnLimits.json', {});
    const counts = warnStore.load();
    const limits = limitsStore.load();
    const limit = limits[groupJid] || 3;
    if (!counts[groupJid]) counts[groupJid] = {};
    counts[groupJid][targetJid] = (counts[groupJid][targetJid] || 0) + 1;
    warnStore.save(counts);
    return { count: counts[groupJid][targetJid], limit };
}

module.exports = function registerModeration({ registry, config, Permissions }) {
    const reply = (sock, msg, text, mentions) =>
        sock.sendMessage(msg.key.remoteJid, { text, ...(mentions ? { mentions } : {}) });

    // === PIPELINE HOOK: antiword (runs on every group message) ===
    async function checkAntiword(sock, chatJid, senderJid, text, msg) {
        if (!chatJid.endsWith('@g.us') || !text) return false;
        const data = wordStore.load();
        const cfg = data[chatJid];
        if (!cfg?.enabled || !cfg.words?.length) return false;
        const regex = buildWordRegex(cfg.words);
        if (!regex || !regex.test(text)) return false;
        try {
            await sock.sendMessage(chatJid, { delete: msg.key });
            if (cfg.action === 'kick') {
                await sock.groupParticipantsUpdate(chatJid, [senderJid], 'remove');
                await sock.sendMessage(chatJid, { text: `🚫 Kicked for using a banned word.` });
            } else if (cfg.action === 'warn') {
                const { count, limit } = warnTarget(chatJid, senderJid);
                await sock.sendMessage(chatJid, {
                    text: `⚠️ Banned word! Warned (${count}/${limit})`,
                    mentions: [senderJid]
                });
                if (count >= limit) {
                    await sock.groupParticipantsUpdate(chatJid, [senderJid], 'remove');
                    await sock.sendMessage(chatJid, { text: '🚫 Kicked after repeated violations.' });
                }
            } else {
                await sock.sendMessage(chatJid, { text: '⚠️ Watch your language — that word is banned here.' });
            }
        } catch (e) { console.error('antiword error:', e.message); }
        return true;
    }

    // === PIPELINE HOOK: antilink (runs on every group message) ===
    async function checkAntilink(sock, chatJid, senderJid, text, msg) {
        if (!chatJid.endsWith('@g.us') || !text) return false;
        const data = linkStore.load();
        const cfg = data[chatJid];
        if (!cfg?.enabled || !LINK_REGEX.test(text)) return false;
        // Admins and activator are exempt
        try {
            if (await Permissions.isGroupAdmin(sock, chatJid, senderJid)) return false;
        } catch { }
        if (Permissions.isActivator(chatJid, senderJid)) return false;
        try {
            await sock.sendMessage(chatJid, { delete: msg.key });
            if (cfg.action === 'kick') {
                await sock.groupParticipantsUpdate(chatJid, [senderJid], 'remove');
                await sock.sendMessage(chatJid, {
                    text: `🚫 Kicked @${senderJid.split('@')[0]} for posting a link.`,
                    mentions: [senderJid]
                });
            } else {
                const { count, limit } = warnTarget(chatJid, senderJid);
                await sock.sendMessage(chatJid, {
                    text: `⚠️ @${senderJid.split('@')[0]} warned for posting a link! (${count}/${limit})`,
                    mentions: [senderJid]
                });
                if (count >= limit) {
                    await sock.groupParticipantsUpdate(chatJid, [senderJid], 'remove');
                    await sock.sendMessage(chatJid, {
                        text: `🚫 @${senderJid.split('@')[0]} was kicked for repeated link violations.`,
                        mentions: [senderJid]
                    });
                }
            }
        } catch (e) { console.error('antilink error:', e.message); }
        return true;
    }

    // === PIPELINE HOOK: anti-delete (messages.update) ===
    // When a message is deleted, repost its content if anti-delete is on.
    async function onMessagesUpdate(sock, updates) {
        const settings = settingsStore.load();
        if (!settings.antidelete) return;
        for (const { key, update } of updates || []) {
            const protocol = update?.protocolMessage;
            if (protocol?.type === 'REVOKE' && key?.remoteJid) {
                try {
                    const text = protocol.revokeText || '';
                    if (text) {
                        await sock.sendMessage(key.remoteJid, {
                            text: `🗑️ *Anti-delete:* a message was deleted:\n\n${text}`
                        });
                    }
                } catch { }
            }
        }
    }

    // === COMMANDS ===
    registry.registerCommand('antilink', 'Toggle anti-link (on [warn|kick] / off)', async (sock, msg, args) => {
        const gj = msg.key.remoteJid;
        const data = linkStore.load();
        const current = data[gj] || { enabled: false, action: 'warn' };
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'on') {
            current.enabled = true;
            current.action = (args[1] || '').toLowerCase() === 'kick' ? 'kick' : 'warn';
            data[gj] = current;
            linkStore.save(data);
            await reply(sock, msg, `✅ Anti-link enabled (${current.action})`);
        } else if (sub === 'off') {
            current.enabled = false;
            data[gj] = current;
            linkStore.save(data);
            await reply(sock, msg, '✅ Anti-link disabled');
        } else {
            await reply(sock, msg, `📊 Anti-link is ${current.enabled ? 'ON' : 'OFF'} (${current.action})\n\nUse .antilink on [warn|kick] or .antilink off`);
        }
    }, { permission: 'admin', groupOnly: true, aliases: ['deletelinks'] });

    registry.registerCommand('antiword', 'Manage the banned-word filter (on/off/add/remove/list/kick/warn)', async (sock, msg, args) => {
        const gj = msg.key.remoteJid;
        const data = wordStore.load();
        const current = data[gj] || { enabled: false, action: 'warn', words: [] };
        const sub = (args[0] || '').toLowerCase();
        const rest = args.slice(1).join(' ').trim();

        if (sub === 'on' || sub === 'off') {
            current.enabled = sub === 'on';
            data[gj] = current;
            wordStore.save(data);
            return reply(sock, msg, `✅ Antiword ${sub === 'on' ? 'activated' : 'deactivated'}.`);
        }
        if (['kick', 'warn'].includes(sub)) {
            current.action = sub;
            data[gj] = current;
            wordStore.save(data);
            return reply(sock, msg, `✅ Antiword action set to *${sub}*.`);
        }
        if (sub === 'add') {
            if (!rest) return reply(sock, msg, '❌ Provide a word to ban. Usage: .antiword add <word>');
            const words = rest.split(/[,|]/).map(w => w.trim().toLowerCase()).filter(Boolean);
            current.words = [...new Set([...(current.words || []), ...words])];
            data[gj] = current;
            wordStore.save(data);
            return reply(sock, msg, `✅ Added ${words.length} word(s) to the ban list.`);
        }
        if (sub === 'remove') {
            if (!rest) return reply(sock, msg, '❌ Provide a word to remove. Usage: .antiword remove <word>');
            current.words = (current.words || []).filter(w => w !== rest.toLowerCase());
            data[gj] = current;
            wordStore.save(data);
            return reply(sock, msg, `✅ Removed "${rest}" from the ban list.`);
        }
        if (sub === 'list' || sub === 'info') {
            const words = current.words || [];
            if (!words.length) return reply(sock, msg, `📊 Antiword: ${current.enabled ? 'ON' : 'OFF'} (action: ${current.action})\nNo banned words yet.`);
            return reply(sock, msg, `📊 Antiword: ${current.enabled ? 'ON' : 'OFF'} (action: ${current.action})\n\n*Banned words (${words.length}):*\n${words.join(', ')}`);
        }
        if (sub === 'clear') {
            current.words = [];
            data[gj] = current;
            wordStore.save(data);
            return reply(sock, msg, '✅ Ban list cleared.');
        }
        await reply(sock, msg, `Usage:\n.antiword on/off\n.antiword kick/warn\n.antiword add <word>\n.antiword remove <word>\n.antiword list\n.antiword clear`);
    }, { permission: 'admin', groupOnly: true });

    registry.registerCommand('antidelete', 'Toggle anti-delete (repost deleted messages)', async (sock, msg, args) => {
        const sub = (args[0] || '').toLowerCase();
        if (sub !== 'on' && sub !== 'off') {
            const settings = settingsStore.load();
            return reply(sock, msg, `📊 Anti-delete is ${settings.antidelete ? 'ON' : 'OFF'}\n\nUse .antidelete on/off`);
        }
        const settings = settingsStore.load();
        settings.antidelete = sub === 'on';
        settingsStore.save(settings);
        await reply(sock, msg, `✅ Anti-delete ${sub === 'on' ? 'enabled' : 'disabled'}.`);
    }, { permission: 'owner' });

    registry.registerCommand('autoviewonce', 'Toggle auto-opening view-once media', async (sock, msg, args) => {
        const sub = (args[0] || '').toLowerCase();
        if (sub !== 'on' && sub !== 'off') {
            const settings = settingsStore.load();
            return reply(sock, msg, `📊 Autoviewonce is ${settings.autoviewonce ? 'ON' : 'OFF'}\n\nUse .autoviewonce on/off`);
        }
        const settings = settingsStore.load();
        settings.autoviewonce = sub === 'on';
        settingsStore.save(settings);
        await reply(sock, msg, `✅ Autoviewonce ${sub === 'on' ? 'enabled' : 'disabled'}.`);
    }, { permission: 'owner' });

    // Expose pipeline hooks for src/index.js
    module.exports.checkAntiword = checkAntiword;
    module.exports.checkAntilink = checkAntilink;
    module.exports.onMessagesUpdate = onMessagesUpdate;
    return { checkAntiword, checkAntilink, onMessagesUpdate };
};

// Default no-op hooks until the module is registered (index.js requires this early)
module.exports.checkAntiword = async () => false;
module.exports.checkAntilink = async () => false;
module.exports.onMessagesUpdate = async () => {};
