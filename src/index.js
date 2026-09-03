// index.js — BlaxkBot v3 entry point: connection (QR + pairing code) and message pipeline
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const config = require('./config');
const { createRegistry } = require('./commands');
const createPermissions = require('./permissions');
const jidUtils = require('./jidUtils');
const { trackMessage } = require('./activity');

const DATA_DIR = require('path').resolve(__dirname, '../data');
require('fs').mkdirSync(DATA_DIR, { recursive: true });

const logger = pino({ level: 'silent' });

// === BOOT: registry + permissions + feature modules ===
const registry = createRegistry();
const Permissions = createPermissions(config, DATA_DIR);

const FEATURES = [
    './features/core', './features/group', './features/moderation', './features/welcome',
    './features/sticker', './features/downloads', './features/ai', './features/recommend',
    './features/fun', './features/sims', './features/system'
];
const loadedFeatures = [];
for (const featurePath of FEATURES) {
    try {
        require(featurePath)({ registry, config, Permissions, stores: DATA_DIR });
        loadedFeatures.push(featurePath);
    } catch (e) {
        console.warn(`⚠️ Feature module not loaded yet: ${featurePath} (${e.message})`);
    }
}

// === CONNECTION ===
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger,
        auth: state,
        browser: Browsers.appropriate('Chrome'),
        version,
        printQRInTerminal: false,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 45000,
        markOnlineOnConnect: false,
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    // --- Pairing code (if PAIRING_NUMBER is set) ---
    let pairingCodeRequested = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Request pairing code ONLY when QR is available (connection ready)
        const pairingNumber = config.pairingNumber.replace(/[^0-9]/g, '');
        if (pairingNumber && pairingNumber.length >= 10 && !pairingCodeRequested && !sock.authState.creds.registered && qr) {
            pairingCodeRequested = true;
            console.log('🔄 Requesting pairing code for:', pairingNumber);
            try {
                const code = await sock.requestPairingCode(pairingNumber);
                console.log('\n╔════════════════════════════════╗');
                console.log('║                                ║');
                console.log(`║   📟 PAIRING CODE: ${code}     ║`);
                console.log('║                                ║');
                console.log('╚════════════════════════════════╝\n');
                console.log('📌 Steps to link your device:\n');
                console.log('   1. Open WhatsApp on your phone');
                console.log('   2. Tap Settings → Linked Devices');
                console.log('   3. Tap "Link a Device"');
                console.log('   4. Tap "Link with phone number instead"');
                console.log(`   5. Enter the code above: ${code}\n`);
            } catch (error) {
                console.error('❌ Failed to request pairing code:', error.message);
                console.log('💡 Verify phone number format (country code, no +), or clear the session folder.');
            }
        }

        // --- QR code (default auth mode) ---
        if (qr && !pairingNumber) {
            console.log('\n📱 Scan this QR code with WhatsApp:\n');
            qrcode.generate(qr, { small: true });
            console.log('');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log('❌ Connection closed. Reason code:', statusCode);
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Delete the session/ folder and restart to re-authenticate.');
                process.exit(0);
            }
            reconnectAttempts++;
            if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
                console.log('❌ Max reconnection attempts reached. Try again in a few minutes.');
                process.exit(1);
            }
            const delay = Math.min(3000 * reconnectAttempts, 15000);
            console.log(`🔄 Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            setTimeout(connectToWhatsApp, delay);
        } else if (connection === 'open') {
            reconnectAttempts = 0;
            console.log('╔════════════════════════════════════╗');
            console.log('║   ✅ BlaxkBot Connected!           ║');
            console.log('╚════════════════════════════════════╝');
            console.log(`📞 Logged in as ${sock.user.id}`);
            console.log(`📦 Features loaded: ${loadedFeatures.length}/${FEATURES.length}`);

            // Auto-set owner number from the bot's own login if unset
            const botOwnNumber = sock.user.id.split(':')[0];
            if (!config.ownerNumber) {
                config.setVar('OWNER_NUMBER', botOwnNumber);
                console.log(`🔑 Owner number auto-set: ${botOwnNumber}`);
            }
        }
    });

    // === MESSAGE PIPELINE ===
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            try {
                if (!msg.message) continue;

                const text =
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption ||
                    '';

                const chatJid = msg.key.remoteJid;
                const senderJid = msg.key.participant || msg.key.remoteJid;
                const isGroup = jidUtils.isGroupJid(chatJid);

                // 1. Activity tracking
                if (isGroup) trackMessage(chatJid, senderJid);

                // 2. Moderation hooks (antiword, antilink) — may intercept
                const moderation = require('./features/moderation');
                if (await moderation.checkAntiword(sock, chatJid, senderJid, text, msg)) continue;
                if (await moderation.checkAntilink(sock, chatJid, senderJid, text, msg)) continue;

                // 3. Trivia answer interception (plain letters/digits, not commands)
                if (isGroup && !text.trim().startsWith(config.prefix)) {
                    const { answerTrivia, awardPoint } = require('./features/fun');
                    const triviaResult = answerTrivia(chatJid, senderJid, text);
                    if (triviaResult === 'correct') {
                        awardPoint(chatJid, senderJid);
                        await sock.sendMessage(chatJid, {
                            text: `🎉 Correct, @${jidUtils.bareJid(senderJid)}! +1 point 🏆`,
                            mentions: [senderJid]
                        });
                        continue;
                    }
                    if (triviaResult === 'wrong') {
                        await sock.sendMessage(chatJid, { text: '❌ Nope! Try again — A, B, C or D.' });
                        continue;
                    }
                }

                // 4. Command dispatch
                if (text.trim().startsWith(config.prefix)) {
                    // .activateblaxk is dispatchable by anyone (guard inside the handler)
                    await registry.dispatch(sock, msg, text, async (sock, msg, name) =>
                        name === 'activateblaxk' ? true : Permissions.canRunCommand(sock, msg, name)
                    );
                }
            } catch (e) {
                console.error('❌ Error processing message:', e);
            }
        }
    });

    // === GROUP EVENTS (welcome/goodbye — wired by features/welcome.js) ===
    sock.ev.on('group-participants.update', async (update) => {
        try {
            const welcome = require('./features/welcome');
            await welcome.onParticipantsUpdate(sock, update);
        } catch (e) {
            console.warn('⚠️ welcome hook unavailable:', e.message);
        }
    });

    // === MESSAGE DELETIONS (anti-delete — wired by features/moderation.js) ===
    sock.ev.on('messages.update', async (updates) => {
        try {
            const moderation = require('./features/moderation');
            await moderation.onMessagesUpdate(sock, updates);
    } catch (e) {
            console.warn('⚠️ anti-delete hook unavailable:', e.message);
        }
    });
}

connectToWhatsApp().catch(err => {
    console.error('❌ Fatal connection error:', err);
    process.exit(1);
});
