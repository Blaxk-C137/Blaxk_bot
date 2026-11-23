// welcome.js — welcome/goodbye messages + activity reports (report, topactive)
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const WELCOME_FILE = path.join(DATA_DIR, 'welcome.json');

function loadDB() {
    try { return JSON.parse(fs.readFileSync(WELCOME_FILE)) || {}; } catch { return {}; }
}
function saveDB(db) {
    fs.writeFileSync(WELCOME_FILE, JSON.stringify(db, null, 2));
}
function enableWelcome(jid) {
    const db = loadDB();
    db[jid] = { ...(db[jid] || {}), enabled: true };
    saveDB(db);
}
function disableWelcome(jid) {
    const db = loadDB();
    if (db[jid]) { delete db[jid]; saveDB(db); }
}
function isWelcomeEnabled(jid) {
    const db = loadDB();
    return !!(db[jid] && db[jid].enabled);
}
function setWelcomeMessage(jid, text) {
    const db = loadDB();
    db[jid] = { ...(db[jid] || {}), enabled: true, message: String(text || '').trim() };
    saveDB(db);
}
function getWelcomeMessage(jid) {
    const db = loadDB();
    const msg = db[jid]?.message;
    return (msg && msg.length > 0) ? msg
        : `Welcome to the group, @user 👋\n\nThank you for joining us. Powered by BlaxkBot.`;
}
function getGoodbyeMessage(jid) {
    const db = loadDB();
    const msg = db[jid]?.goodbye;
    return (msg && msg.length > 0) ? msg
        : `Goodbye @user 👋 — you will be missed. Powered by BlaxkBot.`;
}
function setGoodbyeMessage(jid, text) {
    const db = loadDB();
    db[jid] = { ...(db[jid] || {}), enabled: true, goodbye: String(text || '').trim() };
    saveDB(db);
}
function validateWelcomeTemplate(text) {
    if (typeof text !== 'string' || !text.trim()) return { valid: false, reason: 'Message cannot be empty.' };
    if (!text.includes('@user')) return { valid: false, reason: 'Message must include "@user" to mention the new member.' };
    return { valid: true };
}

function mentionTag(jid) {
    return `@${jid.split('@')[0].split(':')[0]}`;
}

// Called by src/index.js on 'group-participants.update'
async function onParticipantsUpdate(sock, update) {
    const { id, participants, action } = update;
    if (!id || !id.endsWith('@g.us')) return;
    if (action !== 'add' && action !== 'remove') return;
    if (!isWelcomeEnabled(id)) return;

    // BlaxkBot activator-gated: prefer activated groups, but .welcome on still works standalone
    let groupActivators = {};
    try { groupActivators = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'groupActivators.json'))); } catch { }

    for (const user of participants) {
        const userId = typeof user === 'string' ? user : (user?.id || '');
        if (!userId) continue;
        const template = action === 'add' ? getWelcomeMessage(id) : getGoodbyeMessage(id);
        let text = template.replace(/@user/g, mentionTag(userId));
        try {
            const meta = await sock.groupMetadata(id);
            text = text.replace(/{group}/g, meta?.subject || 'this group');
        } catch { }
        await sock.sendMessage(id, { text, mentions: [userId] });
    }
}

module.exports = function registerWelcome({ registry, config, Permissions }) {
    registry = registry.withCategory('welcome');
    const reply = (sock, msg, text, mentions) =>
        sock.sendMessage(msg.key.remoteJid, { text, ...(mentions ? { mentions } : {}) });

    registry.registerCommand('welcome', 'Welcome/goodbye system (on/off/set/goodbye)', async (sock, msg, args) => {
        const gj = msg.key.remoteJid;
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'on') {
            enableWelcome(gj);
            return reply(sock, msg, '✅ Welcome system enabled in this group!');
        }
        if (sub === 'off') {
            disableWelcome(gj);
            return reply(sock, msg, '❌ Welcome system disabled.');
        }
        if (sub === 'set') {
            const text = args.slice(1).join(' ').trim();
            if (!text) return reply(sock, msg, `❌ Provide a message.\n\nFormat:\n.welcome set Welcome to {group}, @user 👋`);
            const v = validateWelcomeTemplate(text);
            if (!v.valid) return reply(sock, msg, `❌ ${v.reason}\n\nFormat:\n.welcome set Welcome to {group}, @user 👋`);
            setWelcomeMessage(gj, text);
            return reply(sock, msg, '✅ Custom welcome message saved for this group!');
        }
        if (sub === 'goodbye') {
            const text = args.slice(1).join(' ').trim();
            if (!text) return reply(sock, msg, `❌ Provide a message.\n\nFormat:\n.welcome goodbye Goodbye @user 👋`);
            setGoodbyeMessage(gj, text);
            return reply(sock, msg, '✅ Custom goodbye message saved for this group!');
        }
        await reply(sock, msg, `Usage:\n.welcome on\n.welcome off\n.welcome set <message with @user and {group}>\n.welcome goodbye <message with @user>`);
    }, { permission: 'admin', groupOnly: true });

    // === ACTIVITY REPORTS (BlaxkBot) ===
    registry.registerCommand('report', 'Report active/inactive members', async (sock, msg) => {
        const gj = msg.key.remoteJid;
        const { activityCounts } = require('../activity');
        const meta = await sock.groupMetadata(gj);
        const groupActivity = activityCounts[gj] || {};
        const active = meta.participants.filter(p => groupActivity[p.id]);
        const inactive = meta.participants.filter(p => !groupActivity[p.id]);

        let text = `📊 *Group Activity Report*\n\n🔥 *Active Members* (${active.length}):\n`;
        text += active.length === 0 ? 'None\n' : active.map(p => mentionTag(p.id)).join(' ') + '\n';
        text += `\n💤 *Inactive Members* (${inactive.length}):\n`;
        text += inactive.length === 0 ? 'None' : inactive.map(p => mentionTag(p.id)).join(' ');
        await sock.sendMessage(gj, {
            text,
            mentions: [...active.map(p => p.id), ...inactive.map(p => p.id)]
        });
    }, { permission: 'admin', groupOnly: true });

    registry.registerCommand('topactive', 'Show top active members in group', async (sock, msg) => {
        const gj = msg.key.remoteJid;
        const { activityCounts } = require('../activity');
        const meta = await sock.groupMetadata(gj);
        const entries = Object.entries(activityCounts[gj] || {})
            .map(([jid, count]) => ({ jid, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);
        let text = `👥 Members: *${meta.participants.length}*\n\n🏆 Top Active Members:\n`;
        if (!entries.length) {
            text += 'No activity recorded yet.';
        } else {
            entries.forEach((u, i) => { text += `${i + 1}. ${mentionTag(u.jid)} - ${u.count} Messages\n`; });
        }
        await sock.sendMessage(gj, { text, mentions: entries.map(u => u.jid) });
    }, { permission: 'admin', groupOnly: true });
};

// Pipeline hook for src/index.js
module.exports.onParticipantsUpdate = onParticipantsUpdate;
