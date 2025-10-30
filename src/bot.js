const fs = require('fs');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const path = require('path');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const {
    handleCommand,
    linkDeleteGroups,
    warnUser,
    userWarns,
    greetedUsers,
    saveGreetedUsers,
    messageCounts,
    saveMessageCounts,
    isAllowedUser,
    setOwnerJid
} = require('./commands/index');
const jidUtils = require('./jidUtils');

// --- Activity tracking for .topactive ---
const activityFile = path.resolve(__dirname, 'activityCounts.json');
let activityCounts = {};
function saveActivityCounts() {
    fs.writeFileSync(activityFile, JSON.stringify(activityCounts, null, 2));
}
function loadActivityCounts() {
    if (fs.existsSync(activityFile)) {
        try {
            activityCounts = JSON.parse(fs.readFileSync(activityFile));
        } catch (e) {
            activityCounts = {};
        }
    }
}
loadActivityCounts();

// Load group activators for checking activated groups (dynamic loader)
function getGroupActivators() {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, './groupActivators.json')));
}

async function connectionLogic() {
    console.log("Starting bot...");
    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(__dirname, '../session'));
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        logger: P({ level: 'silent' }),
        auth: state,
        browser: ['BlaxkBot', 'Chrome', '4.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update || {};
        if (qr) {
            console.log('Scan this QR code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === "open") {
            console.log("✅ Bot connected!");
            setOwnerJid(sock.user.id); // Save owner JID persistently
        }
        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectionLogic();
            }
        }
    });

    // Group welcome handler (only in activated groups, no @lid, just @number)
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        const groupActivators = getGroupActivators(); // Always get latest
        // Only send welcome if group is activated
        if (action === 'add' && groupActivators[id]) {
            for (const user of participants) {
                await sock.sendMessage(id, {
                    text: `👋 Welcome to the group, @${jidUtils.bareJid(user)}!`,
                    mentions: [user]
                });
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.message) continue;
            // Ignore messages sent by the bot itself (prevents loops)
            //if (msg.key.fromMe) continue;

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                msg.message.videoMessage?.caption ||
                '';

            // --- Determine sender and recipient JIDs ---
            const botJid = sock.user?.id;
            const senderJid = jidUtils.getSenderJid(msg, sock);
            const chatJid = jidUtils.getChatJid(msg);

            // Log both for debugging
            console.log(`[${new Date().toLocaleString()}] Chat: ${chatJid} | Sender: ${senderJid} | FromMe: ${msg.key.fromMe} | Text: ${text}`);
            
            // --- Track user activity (messages) for .topactive ---
            if (jidUtils.isGroupJid(chatJid)) {
                if (!activityCounts[chatJid]) activityCounts[chatJid] = {};
                if (!activityCounts[chatJid][senderJid]) activityCounts[chatJid][senderJid] = 0;
                activityCounts[chatJid][senderJid]++;
                saveActivityCounts();
            }

            // --- Remove auto-greet in private chats ---
            // (No more auto-greet logic here)

            // --- Count Messages in a Chat ---
            if (!messageCounts[chatJid]) messageCounts[chatJid] = 0;
            messageCounts[chatJid]++;
            saveMessageCounts();

            // --- Link deletion, warn, and auto-kick logic ---
            if (
                jidUtils.isGroupJid(chatJid) &&
                linkDeleteGroups.has(chatJid) &&
                /https?:\/\/|wa\.me\//i.test(text)
            ) {
                try {
                    // Delete the link message
                    await sock.sendMessage(chatJid, { delete: msg.key });
                    // Get user JID
                    const userJid = msg.key.participant || msg.participant || chatJid;
                    // Warn the user
                    const warnCount = warnUser(chatJid, userJid);
                    await sock.sendMessage(chatJid, {
                        text: `⚠️ @${jidUtils.bareJid(userJid)} warned for posting a link! (${warnCount}/3)`,
                        mentions: [userJid]
                    });
                    // Kick if 3 warnings
                    if (warnCount >= 3) {
                        await sock.groupParticipantsUpdate(chatJid, [userJid], 'remove');
                        await sock.sendMessage(chatJid, {
                            text: `🚫 @${jidUtils.bareJid(userJid)} was kicked for repeated link violations.`,
                            mentions: [userJid]
                        });
                        userWarns[chatJid][userJid] = 0; // reset after kick
                    }
                    console.log(`[${new Date().toLocaleString()}] Deleted link & warned user in ${chatJid}`);
                } catch (e) {
                    console.error('Failed to delete link message or warn:', e);
                }
                continue; // Don't process further
            }

            // --- Command handling with access control ---
            if (text.trim().startsWith('.')) {
                // --- Allow .activateblaxk for anyone in group, before access check ---
                if (text.trim().toLowerCase() === '.activateblaxk') {
                    await handleCommand(sock, msg, text, version);
                    continue;
                }

                // --- Allow if: owner, group admin, group activator (LID), or fromMe ---
                let allowed = false;
                if (msg.key.fromMe) {
                    allowed = true;
                } else if (await isAllowedUser(sock, msg)) {
                    allowed = true;
                }

                if (!allowed) {
                    await sock.sendMessage(chatJid, {
                        text: "You are not permitted to command BlaxkBot. Do not Attempt this Again.",
                        mentions: [senderJid]
                    });
                    continue;
                }
                await handleCommand(sock, msg, text, version);
            }
        }
    });
}

// Export activityCounts for use in commands/index.js
module.exports = {
    connectionLogic,
    activityCounts,
    saveActivityCounts,
    loadActivityCounts
};

connectionLogic();