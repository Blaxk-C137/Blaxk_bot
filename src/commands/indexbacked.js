const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const jidUtils = require('../jidUtils');
const linkDeleteGroups = new Set();
const userWarns = {}; // { [groupJid]: { [userJid]: warnCount } }
const GREETED_FILE = path.resolve(__dirname, 'greetedUsers.json');
const greetedUsers = new Set();
const { activityCounts } = require('../bot');

// === OWNER JID PERSISTENCE ===
const OWNER_FILE = path.resolve(__dirname, 'owner.json');
let OWNER_JID = null;

function setOwnerJid(jid) {
    OWNER_JID = jid;
    fs.writeFileSync(OWNER_FILE, JSON.stringify({ jid }, null, 2));
}

function getOwnerJid() {
    if (OWNER_JID) return OWNER_JID;
    if (fs.existsSync(OWNER_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(OWNER_FILE));
            OWNER_JID = data.jid;
            return OWNER_JID;
        } catch (e) {
            return null;
        }
    }
    return null;
}

// === GROUP ACTIVATOR (LID) PERSISTENCE ===
const ACTIVATORS_FILE = path.resolve(__dirname, '../groupActivators.json');
let groupActivators = {};
function saveGroupActivators() {
    fs.writeFileSync(ACTIVATORS_FILE, JSON.stringify(groupActivators, null, 2));
}
function loadGroupActivators() {
    if (fs.existsSync(ACTIVATORS_FILE)) {
        try {
            groupActivators = JSON.parse(fs.readFileSync(ACTIVATORS_FILE));
        } catch (e) {
            groupActivators = {};
        }
    }
}
loadGroupActivators();

// === GREETED USERS PERSISTENCE ===
function saveGreetedUsers() {
    fs.writeFileSync(GREETED_FILE, JSON.stringify([...greetedUsers], null, 2));
}
function loadGreetedUsers() {
    if (fs.existsSync(GREETED_FILE)) {
        try {
            const arr = JSON.parse(fs.readFileSync(GREETED_FILE));
            arr.forEach(jid => greetedUsers.add(jid));
        } catch (e) {
            console.error('Failed to load greetedUsers:', e);
        }
    }
}
loadGreetedUsers();

// === ALLOWED USERS PERSISTENCE ===
const ALLOWED_FILE = path.resolve(__dirname, 'allowedUsers.json');
let allowedUsers = new Set();

function saveAllowedUsers() {
    fs.writeFileSync(ALLOWED_FILE, JSON.stringify([...allowedUsers], null, 2));
}
function loadAllowedUsers() {
    if (fs.existsSync(ALLOWED_FILE)) {
        try {
            const arr = JSON.parse(fs.readFileSync(ALLOWED_FILE));
            allowedUsers = new Set(arr);
        } catch (e) {
            console.error('Failed to load allowedUsers:', e);
        }
    }
}
loadAllowedUsers();

// === ADDED USERS PERSISTENCE ===
const ADDEDUSERS_FILE = path.resolve(__dirname, 'addedUsers.json');
let addedUsers = new Set();

function saveAddedUsers() {
    fs.writeFileSync(ADDEDUSERS_FILE, JSON.stringify([...addedUsers], null, 2));
}
function loadAddedUsers() {
    if (fs.existsSync(ADDEDUSERS_FILE)) {
        try {
            const arr = JSON.parse(fs.readFileSync(ADDEDUSERS_FILE));
            addedUsers = new Set(arr);
        } catch (e) {
            addedUsers = new Set();
        }
    }
}
loadAddedUsers();

// === DELETE LINKS PERSISTENCE ===
const LINK_DELETE_FILE = path.resolve(__dirname, 'linkDeleteGroups.json');
function saveLinkDeleteGroups() {
    fs.writeFileSync(LINK_DELETE_FILE, JSON.stringify([...linkDeleteGroups], null, 2));
}
function loadLinkDeleteGroups() {
    if (fs.existsSync(LINK_DELETE_FILE)) {
        try {
            const arr = JSON.parse(fs.readFileSync(LINK_DELETE_FILE));
            arr.forEach(jid => linkDeleteGroups.add(jid));
        } catch (e) {
            console.error('Failed to load linkDeleteGroups:', e);
        }
    }
}
loadLinkDeleteGroups();

// === MESSAGE COUNTS PERSISTENCE ===
const COUNT_FILE = path.resolve(__dirname, 'messageCounts.json');
let messageCounts = {};
function saveMessageCounts() {
    fs.writeFileSync(COUNT_FILE, JSON.stringify(messageCounts, null, 2));
}
function loadMessageCounts() {
    if (fs.existsSync(COUNT_FILE)) {
        try {
            messageCounts = JSON.parse(fs.readFileSync(COUNT_FILE));
        } catch (e) {
            console.error('Failed to load messageCounts:', e);
        }
    }
}
loadMessageCounts();

// === USER WARNINGS PERSISTENCE ===
const WARN_FILE = path.resolve(__dirname, 'userWarns.json');
function saveUserWarns() {
    fs.writeFileSync(WARN_FILE, JSON.stringify(userWarns, null, 2));
}
function loadUserWarns() {
    if (fs.existsSync(WARN_FILE)) {
        try {
            const obj = JSON.parse(fs.readFileSync(WARN_FILE));
            Object.assign(userWarns, obj);
        } catch (e) {
            console.error('Failed to load userWarns:', e);
        }
    }
}
loadUserWarns();

// === WARN SYSTEM ===
function warnUser(groupJid, userJid) {
    if (!userWarns[groupJid]) userWarns[groupJid] = {};
    if (!userWarns[groupJid][userJid]) userWarns[groupJid][userJid] = 0;
    userWarns[groupJid][userJid]++;
    saveUserWarns();
    return userWarns[groupJid][userJid];
}
function resetWarn(groupJid, userJid) {
    if (userWarns[groupJid]) userWarns[groupJid][userJid] = 0;
    saveUserWarns();
}

// === BOT INFO ===
const BOT_OWNER = 'Blaxk999';
const BOT_CREATED = '03 July 2025';
const BOT_QUOTE = 'Wake Up Reality! Blk Bot Conquers All';

// === UPTIME TRACKING ===
let botStartTime = Date.now();
function getUptime() {
    const ms = Date.now() - botStartTime;
    const sec = Math.floor((ms / 1000) % 60);
    const min = Math.floor((ms / (1000 * 60)) % 60);
    const hr = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const day = Math.floor(ms / (1000 * 60 * 60 * 24));
    return `${day}d ${hr}h ${min}m ${sec}s`;
}

// === RANDOM IMAGE PICKER ===
const images = [
    path.resolve(__dirname, '../blaxk1.jpg'),
    path.resolve(__dirname, '../blaxk2.jpg'),
    path.resolve(__dirname, '../blaxk3.jpg'),
    path.resolve(__dirname, '../blaxk4.jpg'),
    path.resolve(__dirname, '../blaxk5.jpg'),
    path.resolve(__dirname, '../blaxk6.jpg')
];
function getRandomImage() {
    const available = images.filter(img => fs.existsSync(img));
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
}

// === EVIL PAYLOADS ===
function generateOverrideAbuse() {
    return 'Normal text \u202e Reordered text \u202c (limited RTL override)';
}
function generateNukePayload() {
    return '🚨 [Simulated Nuke] ' + 'X'.repeat(500);
}
function generateHtmlJunk() {
    return '<div style="font-size: 100px;">' + 'X'.repeat(100) + '</div>';
}

// === GROUP ADMIN HELPER ===
async function isGroupAdmin(sock, groupJid, userJid) {
    try {
        const metadata = await sock.groupMetadata(groupJid);
        return metadata.participants.some(
            p => jidUtils.bareJid(p.id) === jidUtils.bareJid(userJid) && (p.admin === 'admin' || p.admin === 'superadmin')
        );
    } catch (e) {
        return false;
    }
}

// === UNIVERSAL ACCESS CHECK (OWNER in private, group admins in group, group activator in group) ===
async function isAllowedUser(sock, msg) {
    const from = jidUtils.getChatJid(msg);
    const senderJid = jidUtils.getSenderJid(msg, sock);

    // Owner can use bot in private chat
    if (jidUtils.isPrivateJid(from) && jidUtils.bareJid(senderJid) === jidUtils.bareJid(getOwnerJid())) {
        return true;
    }

    // Group activator can use bot in their group
    if (
        jidUtils.isGroupJid(from) &&
        groupActivators[from] &&
        jidUtils.bareJid(senderJid) === groupActivators[from]
    ) {
        return true;
    }

    // Group admins can use bot in their group
    if (jidUtils.isGroupJid(from)) {
        try {
            const metadata = await sock.groupMetadata(from);
            const isAdmin = metadata.participants.some(
                p => jidUtils.bareJid(p.id) === jidUtils.bareJid(senderJid) && (p.admin === 'admin' || p.admin === 'superadmin')
            );
            if (isAdmin) return true;
        } catch (e) { }
    }

    // Otherwise, not allowed
    return false;
}

// === Helper to get target user from reply or mention ===
function getTargetUser(msg) {
    const context = msg.message?.extendedTextMessage?.contextInfo;
    const mentioned = context?.mentionedJid?.[0];
    const replied = context?.participant;
    return mentioned || replied;
}

// === Helper to format all mentions as @number only ===
function mentionTag(jid) {
    // Extract only the number part before any ':' or '@'
    return `@${jid.split('@')[0].split(':')[0]}`;
}

// === Helper: Check if user is in addedUsers ===
function isBasicUser(jid) {
    return addedUsers.has(jid);
}

async function handleCommand(sock, msg, text, version) {
    const from = jidUtils.getChatJid(msg);
    const botJid = sock.user?.id;
    const sender = jidUtils.getSenderJid(msg, sock);
    const command = text.trim().toLowerCase();
    const send = (msg, opts) => sock.sendMessage(from, { text: msg, ...(opts || {}) });
    const img = getRandomImage();

    // === GROUP ACTIVATOR SYSTEM ===
    if (command === '.activateblaxk') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command can only be used in groups.');
        const groupJid = from;
        const senderJid = jidUtils.bareJid(msg.key.participant);
        if (!senderJid) return send('❌ Could not determine sender.');
        if (groupActivators[groupJid]) {
            return send('⚠️ This group has already been activated.');
        }
        groupActivators[groupJid] = senderJid;
        saveGroupActivators();

        // Delete the activation message
        await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: msg.key.fromMe, id: msg.key.id, participant: msg.key.participant } });
        // Announce ownership and mention the user
        await sock.sendMessage(from, {
            text: `👑 Blaxk Bot Fully belongs to ${mentionTag(senderJid)}`,
            mentions: [msg.key.participant]
        });
        return;
    }

    if (command === '.deactivateblaxk') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command can only be used in groups.');
        const groupJid = from;
        const senderJid = jidUtils.bareJid(msg.key.participant);
        if (!groupActivators[groupJid]) {
            return send('ℹ️ This group has not been activated.');
        }
        if (senderJid !== groupActivators[groupJid] && jidUtils.bareJid(sender) !== jidUtils.bareJid(getOwnerJid())) {
            return send('❌ Only the current group activator or bot owner can deactivate Blaxk Bot.');
        }
        delete groupActivators[groupJid];
        saveGroupActivators();
        send('✅ Blaxk Bot has been deactivated in this group.');
        return;
    }

    // === ALLOWED USERS RESTRICTION (OWNER in private, ADMINS in group, ACTIVATOR in group ONLY) ===
    const allowed = await isAllowedUser(sock, msg);
    if (!allowed) {
        return send("You are not permitted to use BlaxkBot in this chat.");
    }

    // === ADD USER COMMAND (group activator only) ===
    if (command.startsWith('.add')) {
        const isGroup = jidUtils.isGroupJid(from);
        // Only group activator can add
        const isActivator = isGroup && groupActivators[from] && jidUtils.bareJid(sender) === jidUtils.bareJid(groupActivators[from]);
        if (!isActivator) {
            return send('❌ Only the group activator (LID) can add users.');
        }
        const target = getTargetUser(msg);
        if (!target) return send('❌ Reply to or mention a user to add.');
        allowedUsers.add(target);
        addedUsers.add(target);
        saveAllowedUsers();
        saveAddedUsers();
        send(`✅ User ${mentionTag(target)} has been granted access.`, { mentions: [target] });
        return;
    }

    // === REMOVE USER COMMAND (group activator only) ===
    else if (command.startsWith('.remove')) {
        const isGroup = jidUtils.isGroupJid(from);
        // Only group activator can remove
        const isActivator = isGroup && groupActivators[from] && jidUtils.bareJid(sender) === jidUtils.bareJid(groupActivators[from]);
        if (!isActivator) {
            return send('❌ Only the group activator (LID) can remove users.');
        }
        const target = getTargetUser(msg);
        if (!target) return send('❌ Reply to or mention a user to remove.');
        // Prevent removing the group activator's LID
        if (
            isGroup &&
            groupActivators[from] &&
            jidUtils.bareJid(target) === jidUtils.bareJid(groupActivators[from])
        ) {
            return send('😎 You cannot revoke access from the group activator. Chill, the LID is untouchable!');
        }
        if (!allowedUsers.has(target)) {
            return send(`ℹ️ User ${mentionTag(target)} does not have access.`, { mentions: [target] });
        }
        allowedUsers.delete(target);
        addedUsers.delete(target);
        saveAllowedUsers();
        saveAddedUsers();
        send(`✅ User ${mentionTag(target)} access has been revoked.`, { mentions: [target] });
        return;
    }

    // === GREET COMMAND (manual greeting, replaces auto-greet in private) ===
    else if (command.startsWith('.greet')) {
        if (!jidUtils.isPrivateJid(from) && !jidUtils.isGroupJid(from)) {
            return send('❌ This command can only be used in private chats or groups.');
        }
        const target = getTargetUser(msg) || sender;
        const bareTarget = jidUtils.bareJid(target); // always use bare JID

        if (greetedUsers.has(bareTarget)) {
            return send(`👋 User ${mentionTag(bareTarget)} has already been greeted.`, { mentions: [target] });
        }

        const audioPath = path.resolve(__dirname, '..', 'Media', 'blaxkbot_greeting.mp3');
        const caption = `✨🤖 *Sir Blaxk Extends His Greetings, Leave a message* 👑✨`;

        if (fs.existsSync(audioPath)) {
            try {
                await sock.sendMessage(from, {
                    audio: fs.readFileSync(audioPath),
                    mimetype: 'audio/mpeg',
                    ptt: true
                }, { quoted: msg });
                await send(caption, { mentions: [target] });
                greetedUsers.add(bareTarget);
                saveGreetedUsers();
            } catch (err) {
                send(`❌ Failed to send greeting audio.`, { mentions: [target] });
            }
        } else {
            send(`${caption}\n\n(Audio file missing!)`, { mentions: [target] });
        }
        return;
    }

    else if (command.startsWith('.resetgreet')) {
        const target = getTargetUser(msg) || from;
        const bareTarget = jidUtils.bareJid(target);
        if (greetedUsers.has(bareTarget)) {
            greetedUsers.delete(bareTarget);
            saveGreetedUsers();
            send(`✅ Greeting reset for ${mentionTag(bareTarget)}.`, { mentions: [target] });
        } else {
            send(`ℹ️ User has not been greeted yet.`, { mentions: [target] });
        }
        return;
    }
    // === BASIC USER FUNCTION RESTRICTION ===
    // Only allow users in addedUsers to use basic commands
    const basicCommands = [
        '.ping', '.help', '.uptime', '.count', '.resetgreet', '.vv', '.lagchat', '.flood', '.spam', '.htmljunk', '.override', '.nuke', '.bugbot', '.greet'
    ];
    if (isBasicUser(sender)) {
        // If not a basic command, block
        if (!basicCommands.some(cmd => command.startsWith(cmd))) {
            return send('❌ You only have access to basic commands. Use .help to see what you can do.');
        }
    }

    // === WARN COMMAND (reply or mention required) ===
    else if (command === '.warn') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        const target = getTargetUser(msg);
        if (!target) return send('❌ Reply to or mention a user to warn.');
        const warnCount = warnUser(from, target);
        await sock.sendMessage(from, {
            text: `⚠️ ${mentionTag(target)} has been warned! (${warnCount}/3)`,
            mentions: [target]
        });
        if (warnCount >= 3) {
            try {
                await sock.groupParticipantsUpdate(from, [target], 'remove');
                await sock.sendMessage(from, { text: `🚫 ${mentionTag(target)} was kicked after 3 warnings.`, mentions: [target] });
                resetWarn(from, target);
            } catch (err) {
                await sock.sendMessage(from, { text: `❌ Failed to kick user: ${err.message}` });
            }
        }
    }

    // === REPORT ACTIVE & INACTIVE MEMBERS ===
    else if (command === '.report') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        const metadata = await sock.groupMetadata(from);
        const groupActivity = activityCounts[from] || {};

        // Active: sent at least 1 message
        const activeMembers = metadata.participants.filter(p => groupActivity[p.id]);
        // Inactive: never sent a message
        const inactiveMembers = metadata.participants.filter(p => !groupActivity[p.id]);

        let reportMsg = `📊 *Group Activity Report*\n\n`;

        reportMsg += `🔥 *Active Members* (${activeMembers.length}):\n`;
        if (activeMembers.length === 0) {
            reportMsg += 'None\n';
        } else {
            reportMsg += activeMembers.map(p => mentionTag(p.id)).join(' ') + '\n';
        }

        reportMsg += `\n💤 *Inactive Members* (${inactiveMembers.length}):\n`;
        if (inactiveMembers.length === 0) {
            reportMsg += 'None';
        } else {
            reportMsg += inactiveMembers.map(p => mentionTag(p.id)).join(' ');
        }

        await sock.sendMessage(from, {
            text: reportMsg,
            mentions: [...activeMembers.map(p => p.id), ...inactiveMembers.map(p => p.id)]
        });
        return;
    }

     // === TOP ACTIVE MEMBERS COMMAND ===
    if (command === '.topactive') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command can only be used in groups.');
        const metadata = await sock.groupMetadata(from);
        const totalMembers = metadata.participants.length;
        const groupActivity = activityCounts[from] || {};

        // Build activity array
        const activityArr = Object.entries(groupActivity).map(([jid, count]) => ({
            jid,
            count
        }));

        // Sort by count descending
        activityArr.sort((a, b) => b.count - a.count);

        // Top 3
        const top3 = activityArr.slice(0, 3);

        let msgText = `👥 Members: *${totalMembers}*\n\n🏆 Top Active Members:\n`;
        if (top3.length === 0) {
            msgText += 'No activity recorded yet.';
        } else {
            top3.forEach((user, idx) => {
                msgText += `${idx + 1}. ${mentionTag(user.jid)} - ${user.count} Messages\n`;
            });
        }

        await sock.sendMessage(from, {
            text: msgText,
            mentions: top3.map(u => u.jid)
        });
        return;
    }

    // === KICK COMMAND (reply or mention required) ===
    else if (command.startsWith('.kick')) {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        const target = getTargetUser(msg);
        if (!target) return send('❌ Reply to or mention a user to kick.');
        try {
            await sock.groupParticipantsUpdate(from, [target], 'remove');
            send(`👢 User ${mentionTag(target)} has been kicked.`, { mentions: [target] });
        } catch (err) {
            await sock.sendMessage(from, { text: `❌ Failed to kick user: ${err.message}` });
        }
    }

    // === PROMOTE COMMAND (reply or mention required) ===
    else if (command.startsWith('.promote')) {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        const target = getTargetUser(msg);
        if (!target) return send('❌ Reply to or mention a user to promote.');
        try {
            await sock.groupParticipantsUpdate(from, [target], 'promote');
            send(`⬆️ User ${mentionTag(target)} promoted to admin.`, { mentions: [target] });
        } catch (err) {
            await sock.sendMessage(from, { text: `❌ Failed to promote user: ${err.message}` });
        }
    }

    // === DEMOTE COMMAND (reply or mention required) ===
    else if (command.startsWith('.demote')) {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        const target = getTargetUser(msg);
        if (!target) return send('❌ Reply to or mention a user to demote.');
        try {
            await sock.groupParticipantsUpdate(from, [target], 'demote');
            send(`⬇️ User ${mentionTag(target)} demoted from admin.`, { mentions: [target] });
        } catch (err) {
            await sock.sendMessage(from, { text: `❌ Failed to demote user: ${err.message}` });
        }
    }

    // === RESET GREET (reply or mention required) ===
    else if (command.startsWith('.resetgreet')) {
        const target = getTargetUser(msg) || sender;
        const bareTarget = jidUtils.bareJid(target);
        if (greetedUsers.has(bareTarget)) {
            greetedUsers.delete(bareTarget);
            saveGreetedUsers();
            send(`✅ Greeting reset for ${mentionTag(bareTarget)}.`, { mentions: [target] });
        } else {
            send(`ℹ️ User has not been greeted yet.`, { mentions: [target] });
        }
        return;
    }

    // === VIEW-ONCE UNLOCK (reply required) ===
    else if (command === '.vv') {
        try {
            const context = msg.message?.extendedTextMessage?.contextInfo;
            const quoted = context?.quotedMessage;
            if (!quoted) {
                return await send('🧐 You must reply to a *view-once* image or video with `.vv`.');
            }

            // Try to find the view-once message at any depth
            let viewOnceMsg = quoted;
            if (viewOnceMsg?.viewOnceMessage?.message) {
                viewOnceMsg = viewOnceMsg.viewOnceMessage.message;
            } else if (viewOnceMsg?.imageMessage?.viewOnce) {
                viewOnceMsg = { imageMessage: viewOnceMsg.imageMessage };
            } else if (viewOnceMsg?.videoMessage?.viewOnce) {
                viewOnceMsg = { videoMessage: viewOnceMsg.videoMessage };
            }

            if (viewOnceMsg?.imageMessage) {
                const stream = await downloadContentFromMessage(viewOnceMsg.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                await sock.sendMessage(from, {
                    image: buffer,
                    caption: '🔓 View-once image unlocked!'
                });
            } else if (viewOnceMsg?.videoMessage) {
                const stream = await downloadContentFromMessage(viewOnceMsg.videoMessage, 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                await sock.sendMessage(from, {
                    video: buffer,
                    caption: '🔓 View-once video unlocked!'
                });
            } else {
                await send('❌ This is not a supported view-once media.');
            }
        } catch (err) {
            console.error('❌ Error in .vv command:', err);
            await send('⚠️ Failed to unlock view-once media.');
        }
    }

    // === INFO COMMANDS ===
    else if (command === '.ping') {
        const caption = `🤖 *BlaxkBot is alive!*
*Version:* ${version.join('.')}
*Uptime:* ${getUptime()}
*Owner:* ${BOT_OWNER}
*Created:* ${BOT_CREATED}
*Quote:* "${BOT_QUOTE}"`;
        img ? await sock.sendMessage(from, { image: fs.readFileSync(img), caption }) : send(caption);
    }

    else if (command === '.help') {
        const caption = `*🛠 BlaxkBot Command List:*

.ping - Show bot status and info
.help - Show this help message
.uptime - Show bot uptime
.restart - Simulate bot restart
.crash - Simulate crash payload
.lagchat - Send laggy messages
.flood - Flood chat with messages
.spam <count> <msg> - Spam a message
.vv - Unhide view-once media (reply to media)
.bugbot - Bugbot test
.override - Unicode override abuse
.nuke - Simulated WhatsApp nuke
.htmljunk - Send HTML junk (for fun)
.greet - Greet a user (reply or mention)
.resetgreet - Reset greeted users
.count - Count messages in this chat
.add @user - Allow user to use bot (group activator only)
.remove @user - Remove user from allowed list (group activator only)

*Group Admin/Activator:*
.report - Report active/inactive members
.topactive - Show top active members in group
.deletelinks on/off - Enable/disable link deletion (admin/activator only)
.warn (reply) - Warn a user (admin/activator only)
.kick @user - Remove user from group (admin/activator only)
.promote @user - Make user admin (admin/activator only)
.demote @user - Remove admin rights (admin/activator only)
.broadcast <msg> - Broadcast message to all members (admin/activator only)
.tagall - Mention all group members (admin/activator only)
.admins - List all group admins
.info - Show group info
.setdesc <desc> - Set group description (admin/activator only)
.setsubject <name> - Set group name (admin/activator only)
.invite - Get group invite link (admin/activator only)
.revoke - Revoke group invite link (admin/activator only)
.lockchat - Lock group chat (admin/activator only)
.unlockchat - Unlock group chat (admin/activator only)

*Coming Soon:* .qr, .shorten, .weather, .time`;
        img ? await sock.sendMessage(from, { image: fs.readFileSync(img), caption }) : send(caption);
    }

    else if (command === '.uptime') {
        send(`⏱ Uptime: ${getUptime()}`);
    }

    else if (command === '.restart') {
        send('♻️ Restarting bot... (simulated)');
    }

    // === Enable/disable link deletion in group ===
    else if (command === '.deletelinks on') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        linkDeleteGroups.add(from);
        saveLinkDeleteGroups();
        send('🔗 Link deletion is now *enabled* for this group.');
    }
    else if (command === '.deletelinks off') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        linkDeleteGroups.delete(from);
        saveLinkDeleteGroups();
        send('🔗 Link deletion is now *disabled* for this group.');
    }

    // === BUGBOT COMMAND ===
    else if (command === '.bugbot') {
        try {
            const bugMsg = '🐞 BlaxkBot Bug Test';
            for (let i = 1; i <= 5; i++) {
                await send(`${bugMsg} #${i}`);
            }
            await send('✅ Bugbot cycle complete.');
        } catch (err) {
            console.error('❌ Bugbot error:', err);
            send('⚠️ Bugbot failed.');
        }
    }

    // === CRASH COMMAND ===
    else if (command.startsWith('.crash')) {
        try {
            const payload = '👹'.repeat(10000);
            await send(payload);
        } catch (err) {
            console.error('❌ Crash error:', err);
            send('⚠️ Failed to send crash payload.');
        }
    }

    // === LAG & SPAM ===
    else if (command === '.lagchat') {
        for (let i = 0; i < 10; i++) {
            await send('👹'.repeat(100));
        }
    }

    else if (command === '.flood') {
        for (let i = 0; i < 10; i++) {
            await send(`🔥 Message #${i + 1}`);
        }
    }

    else if (command.startsWith('.spam')) {
        const [_, countStr, ...msgParts] = text.trim().split(' ');
        const count = parseInt(countStr);
        const message = msgParts.join(' ');

        if (!count || !message) return send("Usage: .spam <count> <message>");
        if (count > 10) return send("❌ Too many messages. Max allowed is 10.");

        for (let i = 0; i < count; i++) {
            await send(message);
        }
    }

    // === Count Messages ===
    else if (command === '.count') {
        const count = messageCounts[from] || 0;
        send(`💬 Total messages in this chat: *${count}*`);
    }

    // ===== GROUP ADMIN/ACTIVATOR COMMANDS =====

    // Group: Tag all
    else if (command === '.tagall') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        const metadata = await sock.groupMetadata(from);
        const mentions = metadata.participants.map(p => p.id);
        await sock.sendMessage(from, {
            text: '👥 Tagging all group members:\n' + mentions.map(jid => mentionTag(jid)).join(' '),
            mentions
        });
    }

    // Group: Broadcast message to all members (admin/activator only)
    else if (command.startsWith('.broadcast')) {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        const message = text.replace('.broadcast', '').trim();
        if (!message) return send('Usage: .broadcast <your message>');
        const metadata = await sock.groupMetadata(from);
        const mentions = metadata.participants.map(p => p.id);
        await sock.sendMessage(from, {
            text: `📢 *Broadcast from admin/activator:*\n${message}`,
            mentions
        });
    }

    // Group: List admins (tag admins)
    else if (command === '.admins') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        const metadata = await sock.groupMetadata(from);
        const admins = metadata.participants.filter(p => p.admin);
        const adminTags = admins.map(p => mentionTag(p.id)).join('\n');
        const mentions = admins.map(p => p.id);
        await sock.sendMessage(from, {
            text: '👑 Group Admins:\n' + adminTags,
            mentions
        });
    }

    // Group: Group info
    else if (command === '.info') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        const metadata = await sock.groupMetadata(from);
        send(
            `*Group Info:*\n` +
            `Name: ${metadata.subject}\n` +
            `Description: ${metadata.desc || 'No description'}\n` +
            `Members: ${metadata.participants.length}\n` +
            `Admins: ${metadata.participants.filter(p => p.admin).length}`
        );
    }

    // Group: Set description
    else if (command.startsWith('.setdesc')) {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        const desc = text.replace('.setdesc', '').trim();
        if (!desc) return send('Usage: .setdesc <description>');
        try {
            await sock.groupUpdateDescription(from, desc);
            send('📝 Group description updated.');
        } catch (err) {
            await sock.sendMessage(from, { text: `❌ Failed to set description: ${err.message}` });
        }
    }

    // Group: Set subject/name
    else if (command.startsWith('.setsubject')) {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        const subject = text.replace('.setsubject', '').trim();
        if (!subject) return send('Usage: .setsubject <name>');
        try {
            await sock.groupUpdateSubject(from, subject);
            send('🏷️ Group name updated.');
        } catch (err) {
            await sock.sendMessage(from, { text: `❌ Failed to set group name: ${err.message}` });
        }
    }

    // Group: Get invite link
    else if (command === '.invite') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        try {
            const code = await sock.groupInviteCode(from);
            send(`🔗 Group invite link:\nhttps://chat.whatsapp.com/${code}`);
        } catch (err) {
            await sock.sendMessage(from, { text: `❌ Failed to get invite link: ${err.message}` });
        }
    }

    // Group: Revoke invite link
    else if (command === '.revoke') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        try {
            await sock.groupRevokeInvite(from);
            send('♻️ Group invite link revoked.');
        } catch (err) {
            await sock.sendMessage(from, { text: `❌ Failed to revoke invite link: ${err.message}` });
        }
    }

    // Group: Lock chat (only admins/activator can send messages)
    else if (command === '.lockchat') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        try {
            await sock.groupSettingUpdate(from, 'announcement'); // Only admins can send
            send('🔒 Chat locked! Only admins can send messages.');
        } catch (err) {
            await sock.sendMessage(from, { text: `❌ Failed to lock chat: ${err.message}` });
        }
    }

    // Group: Unlock chat (everyone can send messages)
    else if (command === '.unlockchat') {
        if (!jidUtils.isGroupJid(from)) return send('❌ This command is for groups only.');
        let isActivator = groupActivators[from] && jidUtils.bareJid(sender) === groupActivators[from];
        let isAdmin = await isGroupAdmin(sock, from, sender);
        if (!isActivator && !isAdmin) return send('❌ Only group admins or group activator can use this command.');
        try {
            await sock.groupSettingUpdate(from, 'not_announcement'); // Everyone can send
            send('🔓 Chat unlocked! Everyone can send messages.');
        } catch (err) {
            await sock.sendMessage(from, { text: `❌ Failed to unlock chat: ${err.message}` });
        }
    }

    // ===== END GROUP ADMIN/ACTIVATOR COMMANDS =====

    // === EVIL COMMANDS ===
    else if (command === '.override') {
        await send(generateOverrideAbuse());
    }
    else if (command === '.nuke') {
        await send(generateNukePayload());
    }
    else if (command === '.htmljunk') {
        await send(generateHtmlJunk());
    }

    // === PLACEHOLDERS FOR FUTURE COMMANDS ===
    else if (command.startsWith('.qr')) {
        send('📷 QR code generator coming soon.');
    }

    else if (command.startsWith('.shorten')) {
        send('🔗 URL shortener not yet active.');
    }

    else if (command.startsWith('.weather')) {
        send('🌦️ Weather integration pending.');
    }

    else if (command.startsWith('.time')) {
        send('🕒 Time lookup feature coming soon.');
    }

    // === UNKNOWN COMMAND ===
    else if (command.startsWith('.')) {
        send('❓ Unknown command. Use .help to see what’s available.');
    }
}

module.exports = {
    handleCommand,
    linkDeleteGroups,
    warnUser,
    userWarns,
    greetedUsers,
    saveGreetedUsers,
    messageCounts,
    saveMessageCounts,
    allowedUsers,
    saveAllowedUsers,
    isAllowedUser,
    setOwnerJid,
    getOwnerJid,
    bareJid: jidUtils.bareJid,
    addedUsers,
    saveAddedUsers,
    loadAddedUsers
};