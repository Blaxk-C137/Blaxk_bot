// group.js — full group-admin suite (merged from BlaxkBot + Blaxk_TCF)
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');

function jsonStore(file, fallback) {
    const file_ = path.join(DATA_DIR, file);
    const load = () => {
        if (fs.existsSync(file_)) {
            try { return JSON.parse(fs.readFileSync(file_)); } catch { return fallback; }
        }
        return fallback;
    };
    const save = (data) => {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(file_, JSON.stringify(data, null, 2));
    };
    return { load, save };
}

const warnCountsStore = jsonStore('warnCounts.json', {});
const warnLimitsStore = jsonStore('warnLimits.json', {});

function mentionTag(jid) {
    return `@${jid.split('@')[0].split(':')[0]}`;
}

// Target from reply, mention, or raw number arg
function resolveTarget(msg, args) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    if (ctx?.participant) return ctx.participant;
    if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
    const num = (args[0] || '').replace(/[^0-9]/g, '');
    if (num.length >= 10) return `${num}@s.whatsapp.net`;
    return null;
}

const muteTimers = new Map(); // groupJid -> timeout

module.exports = function registerGroup({ registry, config, Permissions }) {
    const reply = (sock, msg, text, mentions) =>
        sock.sendMessage(msg.key.remoteJid, { text, ...(mentions ? { mentions } : {}) });
    const groupJid = (msg) => msg.key.remoteJid;
    const ADMIN = { permission: 'admin', groupOnly: true };

    // === ADD (by phone number) ===
    registry.registerCommand('add', 'Add a member to the group by number', async (sock, msg, args) => {
        const number = (args[0] || '').replace(/[^0-9]/g, '');
        if (!number) return reply(sock, msg, '❌ Provide a valid phone number (with country code, digits only).');
        const userJid = `${number}@s.whatsapp.net`;
        try {
            const res = await sock.groupParticipantsUpdate(groupJid(msg), [userJid], 'add');
            const status = String(res?.[0]?.status);
            if (status === '200') {
                await reply(sock, msg, `✅ Added ${mentionTag(userJid)}`, [userJid]);
            } else if (status === '403') {
                // Privacy blocked — send a group invite for the user to accept manually
                try {
                    const code = await sock.groupInviteCode(groupJid(msg));
                    await reply(sock, msg,
                        `⚠️ ${mentionTag(userJid)}'s privacy settings blocked the direct add. Invite link: https://chat.whatsapp.com/${code}`, [userJid]);
                } catch {
                    await reply(sock, msg, `⚠️ ${mentionTag(userJid)} must be added manually (privacy settings blocked the invite).`, [userJid]);
                }
            } else {
                await reply(sock, msg, `⚠️ Could not add ${mentionTag(userJid)} (status ${status}).`, [userJid]);
            }
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    // === KICK ===
    registry.registerCommand('kick', 'Remove a member from the group (reply/mention/number)', async (sock, msg, args) => {
        const target = resolveTarget(msg, args);
        if (!target) return reply(sock, msg, '❌ Reply to, mention, or provide a number to kick.');
        try {
            await sock.groupParticipantsUpdate(groupJid(msg), [target], 'remove');
            await reply(sock, msg, `👢 Removed ${mentionTag(target)}`, [target]);
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    // === KICKALL ===
    registry.registerCommand('kickall', 'Remove all non-admin members', async (sock, msg) => {
        try {
            const meta = await sock.groupMetadata(groupJid(msg));
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const toKick = meta.participants.filter(p => !p.admin && p.id !== botJid).map(p => p.id);
            if (!toKick.length) return reply(sock, msg, '❌ No non-admin members to remove.');
            await reply(sock, msg, `⏳ Removing ${toKick.length} members...`);
            await sock.groupParticipantsUpdate(groupJid(msg), toKick, 'remove');
            await reply(sock, msg, `✅ Removed ${toKick.length} members`);
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    // === PROMOTE / DEMOTE ===
    registry.registerCommand('promote', 'Promote a member to admin (reply/mention/number)', async (sock, msg, args) => {
        const target = resolveTarget(msg, args);
        if (!target) return reply(sock, msg, '❌ Reply to, mention, or provide a number to promote.');
        try {
            await sock.groupParticipantsUpdate(groupJid(msg), [target], 'promote');
            await reply(sock, msg, `⬆️ Promoted ${mentionTag(target)} to admin.`, [target]);
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    registry.registerCommand('demote', 'Demote an admin to member (reply/mention/number)', async (sock, msg, args) => {
        const target = resolveTarget(msg, args);
        if (!target) return reply(sock, msg, '❌ Reply to, mention, or provide a number to demote.');
        try {
            await sock.groupParticipantsUpdate(groupJid(msg), [target], 'demote');
            await reply(sock, msg, `⬇️ Demoted ${mentionTag(target)} from admin.`, [target]);
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    // === MUTE / UNMUTE (lockchat aliases) ===
    registry.registerCommand('mute', 'Mute the group (optionally for N minutes)', async (sock, msg, args) => {
        const minutes = args[0] ? parseInt(args[0]) : 0;
        if (args[0] && (isNaN(minutes) || minutes <= 0)) {
            return reply(sock, msg, '❌ Provide a valid number of minutes, or omit to mute indefinitely.');
        }
        try {
            await sock.groupSettingUpdate(groupJid(msg), 'announcement');
            if (minutes > 0) {
                if (muteTimers.has(groupJid(msg))) clearTimeout(muteTimers.get(groupJid(msg)));
                const t = setTimeout(async () => {
                    try {
                        await sock.groupSettingUpdate(groupJid(msg), 'not_announcement');
                        await sock.sendMessage(groupJid(msg), { text: '🔊 Group auto-unmuted' });
                    } catch {} finally { muteTimers.delete(groupJid(msg)); }
                }, minutes * 60 * 1000);
                muteTimers.set(groupJid(msg), t);
                await reply(sock, msg, `🔇 Group muted for ${minutes} minute(s)`);
            } else {
                await reply(sock, msg, '🔇 Group muted. Use .unmute to unmute.');
            }
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, { permission: 'admin', groupOnly: true, aliases: ['lockchat'] });

    registry.registerCommand('unmute', 'Unmute the group', async (sock, msg) => {
        try {
            if (muteTimers.has(groupJid(msg))) { clearTimeout(muteTimers.get(groupJid(msg))); muteTimers.delete(groupJid(msg)); }
            await sock.groupSettingUpdate(groupJid(msg), 'not_announcement');
            await reply(sock, msg, '🔊 Group unmuted');
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, { permission: 'admin', groupOnly: true, aliases: ['unlockchat'] });

    // === TAG (message) / TAGALL (list) / BROADCAST ===
    registry.registerCommand('tag', 'Tag all members with a message', async (sock, msg, args) => {
        let tagMessage = args.join(' ').trim() || 'Tagged by admin';
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!args.length && quoted) {
            tagMessage = quoted.conversation || quoted.extendedTextMessage?.text || tagMessage;
        }
        try {
            const meta = await sock.groupMetadata(groupJid(msg));
            const participants = meta.participants.map(p => p.id);
            await reply(sock, msg, `📢 *${tagMessage}*`, participants);
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    registry.registerCommand('tagall', 'List all members with tags', async (sock, msg) => {
        try {
            const meta = await sock.groupMetadata(groupJid(msg));
            const parts = meta.participants;
            let text = '👥 *GROUP MEMBERS*\n\n';
            parts.forEach((p, i) => { text += `${i + 1}. ${mentionTag(p.id)}\n`; });
            text += `\n*Total Members:* ${parts.length}`;
            await reply(sock, msg, text, parts.map(p => p.id));
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    registry.registerCommand('broadcast', 'Broadcast a message mentioning all members', async (sock, msg, args) => {
        const message = args.join(' ').trim();
        if (!message) return reply(sock, msg, 'Usage: .broadcast <your message>');
        try {
            const meta = await sock.groupMetadata(groupJid(msg));
            const mentions = meta.participants.map(p => p.id);
            await reply(sock, msg, `📢 *Broadcast:*\n${message}`, mentions);
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    // === WARN SYSTEM (persistent, configurable limit) ===
    registry.registerCommand('warn', 'Warn a user (limit = kick)', async (sock, msg, args) => {
        const target = resolveTarget(msg, args);
        if (!target) return reply(sock, msg, '❌ Reply to, mention, or provide a number to warn.');
        const limits = warnLimitsStore.load();
        const counts = warnCountsStore.load();
        const limit = limits[groupJid(msg)] || 3;
        if (!counts[groupJid(msg)]) counts[groupJid(msg)] = {};
        const c = (counts[groupJid(msg)][target] || 0) + 1;
        counts[groupJid(msg)][target] = c;
        warnCountsStore.save(counts);
        if (c >= limit) {
            try {
                await sock.groupParticipantsUpdate(groupJid(msg), [target], 'remove');
                delete counts[groupJid(msg)][target];
                warnCountsStore.save(counts);
                await reply(sock, msg, `⛔ Warn limit reached (${limit}). Kicked ${mentionTag(target)}`, [target]);
            } catch (e) { reply(sock, msg, `⚠️ Failed to kick: ${e.message}`); }
        } else {
            await reply(sock, msg, `⚠️ Warned ${mentionTag(target)} (${c}/${limit})`, [target]);
        }
    }, ADMIN);

    registry.registerCommand('resetwarn', 'Reset warnings for a user', async (sock, msg, args) => {
        const target = resolveTarget(msg, args);
        if (!target) return reply(sock, msg, '❌ Reply to, mention, or provide a number to reset warnings.');
        const counts = warnCountsStore.load();
        const prev = counts[groupJid(msg)]?.[target] || 0;
        if (counts[groupJid(msg)]) { delete counts[groupJid(msg)][target]; warnCountsStore.save(counts); }
        await reply(sock, msg, `✅ Reset warnings for ${mentionTag(target)} (had ${prev})`, [target]);
    }, ADMIN);

    registry.registerCommand('warnlimit', 'Set the warn limit for this group', async (sock, msg, args) => {
        const limits = warnLimitsStore.load();
        if (!args[0]) {
            const current = limits[groupJid(msg)] || 3;
            return reply(sock, msg, `📊 Current warn limit: ${current}\n\nUse .warnlimit <number>`);
        }
        const n = parseInt(args[0]);
        if (isNaN(n) || n < 1) return reply(sock, msg, '❌ Provide a valid number (1 or more).');
        limits[groupJid(msg)] = n;
        warnLimitsStore.save(limits);
        await reply(sock, msg, `✅ Warn limit set to ${n}`);
    }, ADMIN);

    // === INVITE / REVOKE / JOIN / GINFO ===
    registry.registerCommand('invite', 'Get group invite link', async (sock, msg) => {
        try {
            const code = await sock.groupInviteCode(groupJid(msg));
            await reply(sock, msg, `🔗 Group invite link:\nhttps://chat.whatsapp.com/${code}`);
        } catch (e) { reply(sock, msg, `❌ Failed to get invite link: ${e.message}`); }
    }, ADMIN);

    registry.registerCommand('revoke', 'Revoke group invite link', async (sock, msg) => {
        try {
            await sock.groupRevokeInvite(groupJid(msg));
            await reply(sock, msg, '♻️ Group invite link revoked.');
        } catch (e) { reply(sock, msg, `❌ Failed to revoke invite link: ${e.message}`); }
    }, ADMIN);

    registry.registerCommand('join', 'Join a group via invite link', async (sock, msg, args) => {
        const text = args.join(' ');
        const match = text.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i);
        if (!match) return reply(sock, msg, '❌ Invalid or missing invite link.');
        try {
            const res = await sock.groupAcceptInvite(match[1]);
            await reply(sock, msg, `✅ Joined or request sent. Group: ${res}`);
        } catch (e) { reply(sock, msg, `❌ Failed to join: ${e.message}`); }
    }, { permission: 'owner' });

    registry.registerCommand('ginfo', 'Show group info from an invite link', async (sock, msg, args) => {
        const text = args.join(' ');
        const match = text.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i);
        if (!match) return reply(sock, msg, '❌ Provide a valid invite link.');
        try {
            if (typeof sock.groupGetInviteInfo !== 'function') {
                return reply(sock, msg, 'ℹ️ Invite info not supported by current API version.');
            }
            const info = await sock.groupGetInviteInfo(match[1]);
            const creator = (info?.creator || '').split('@')[0];
            await reply(sock, msg,
                `📋 *Invite Info*\n\n• Name: ${info?.subject || 'unknown'}\n• ID: ${info?.id || 'unknown'}\n• Creator: ${creator || 'unknown'}\n• Size: ${info?.size || 'unknown'}`);
        } catch (e) { reply(sock, msg, `❌ Failed to get invite info: ${e.message}`); }
    }, { permission: 'all' });

    // === ADMINS / INFO / SETDESC / SETSUBJECT / GPP ===
    registry.registerCommand('admins', 'List all group admins', async (sock, msg) => {
        try {
            const meta = await sock.groupMetadata(groupJid(msg));
            const admins = meta.participants.filter(p => p.admin);
            if (!admins.length) return reply(sock, msg, 'No admins found in this group.');
            await reply(sock, msg, '👑 Group Admins:\n' + admins.map(p => mentionTag(p.id)).join('\n'), admins.map(p => p.id));
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    registry.registerCommand('info', 'Show group info', async (sock, msg) => {
        try {
            const meta = await sock.groupMetadata(groupJid(msg));
            await reply(sock, msg,
                `*Group Info:*\nName: ${meta.subject}\nDescription: ${meta.desc || 'No description'}\nMembers: ${meta.participants.length}\nAdmins: ${meta.participants.filter(p => p.admin).length}`);
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, { permission: 'all', groupOnly: true });

    registry.registerCommand('setdesc', 'Set group description', async (sock, msg, args) => {
        const desc = args.join(' ').trim();
        if (!desc) return reply(sock, msg, 'Usage: .setdesc <description>');
        try {
            await sock.groupUpdateDescription(groupJid(msg), desc);
            await reply(sock, msg, '📝 Group description updated.');
        } catch (e) { reply(sock, msg, `❌ Failed to set description: ${e.message}`); }
    }, ADMIN);

    registry.registerCommand('setsubject', 'Set group name', async (sock, msg, args) => {
        const subject = args.join(' ').trim();
        if (!subject) return reply(sock, msg, 'Usage: .setsubject <name>');
        try {
            await sock.groupUpdateSubject(groupJid(msg), subject);
            await reply(sock, msg, '🏷️ Group name updated.');
        } catch (e) { reply(sock, msg, `❌ Failed to set group name: ${e.message}`); }
    }, ADMIN);

    registry.registerCommand('gpp', 'Change group profile picture (reply to image)', async (sock, msg) => {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const image = quoted?.imageMessage;
        if (!image) return reply(sock, msg, '❌ Reply to an image with .gpp to set the group icon.');
        try {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(image, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            await sock.updateProfilePicture(groupJid(msg), buffer);
            await reply(sock, msg, '🖼️ Group profile picture updated.');
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    // === GHOSTPING ===
    registry.registerCommand('ghostping', 'Send a message and instantly delete it (ghost ping)', async (sock, msg, args) => {
        const text = args.join(' ').trim() || '👻';
        try {
            const sent = await sock.sendMessage(groupJid(msg), { text });
            await sock.sendMessage(groupJid(msg), { delete: sent.key });
        } catch (e) { reply(sock, msg, `❌ Failed: ${e.message}`); }
    }, ADMIN);

    // === ACTIVATOR SYSTEM (BlaxkBot) ===
    registry.registerCommand('activateblaxk', 'Activate BlaxkBot in this group (first caller becomes activator)', async (sock, msg) => {
        const gj = groupJid(msg);
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const { activatorStore } = Permissions.stores;
        activatorStore.load();
        if (activatorStore.data[gj]) return reply(sock, msg, '⚠️ This group has already been activated.');
        activatorStore.data = { ...activatorStore.data, [gj]: senderJid };
        activatorStore.save();
        await sock.sendMessage(gj, {
            text: `👑 BlaxkBot fully belongs to ${mentionTag(senderJid)}`,
            mentions: [senderJid]
        });
    }, { permission: 'all', groupOnly: true });

    registry.registerCommand('deactivateblaxk', 'Deactivate BlaxkBot in this group', async (sock, msg) => {
        const gj = groupJid(msg);
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const { activatorStore } = Permissions.stores;
        activatorStore.load();
        if (!activatorStore.data[gj]) return reply(sock, msg, 'ℹ️ This group has not been activated.');
        const activator = activatorStore.data[gj];
        const isAllowed = Permissions.normalizeNumber(senderJid) === Permissions.normalizeNumber(activator) || Permissions.isOwner(msg);
        if (!isAllowed) return reply(sock, msg, '❌ Only the group activator or bot owner can deactivate BlaxkBot.');
        const next = { ...activatorStore.data };
        delete next[gj];
        activatorStore.data = next;
        activatorStore.save();
        await reply(sock, msg, '✅ BlaxkBot has been deactivated in this group.');
    }, { permission: 'all', groupOnly: true });

    // === ACTIVATOR USER MANAGEMENT (BlaxkBot add/remove basic users) ===
    registry.registerCommand('adduser', 'Grant a user access to basic bot commands', async (sock, msg, args) => {
        const target = resolveTarget(msg, args);
        if (!target) return reply(sock, msg, '❌ Reply to, mention, or provide a number to add.');
        const { addedUsersStore } = Permissions.stores;
        addedUsersStore.load();
        const list = Array.isArray(addedUsersStore.data) ? addedUsersStore.data : [];
        if (!list.includes(target)) { list.push(target); addedUsersStore.data = list; addedUsersStore.save(); }
        await reply(sock, msg, `✅ User ${mentionTag(target)} has been granted access.`, [target]);
    }, { permission: 'activator', groupOnly: true });

    registry.registerCommand('removeuser', 'Revoke a user\'s basic bot access', async (sock, msg, args) => {
        const target = resolveTarget(msg, args);
        if (!target) return reply(sock, msg, '❌ Reply to, mention, or provide a number to remove.');
        const { activatorStore, addedUsersStore } = Permissions.stores;
        const activator = activatorStore.load()[groupJid(msg)];
        if (activator && Permissions.normalizeNumber(target) === Permissions.normalizeNumber(activator)) {
            return reply(sock, msg, '😎 You cannot revoke access from the group activator. The LID is untouchable!');
        }
        addedUsersStore.load();
        const list = Array.isArray(addedUsersStore.data) ? addedUsersStore.data : [];
        const next = list.filter(jid => jid !== target);
        if (next.length === list.length) return reply(sock, msg, `ℹ️ User ${mentionTag(target)} does not have access.`, [target]);
        addedUsersStore.data = next;
        addedUsersStore.save();
        await reply(sock, msg, `✅ User ${mentionTag(target)} access revoked.`, [target]);
    }, { permission: 'activator', groupOnly: true });
};
