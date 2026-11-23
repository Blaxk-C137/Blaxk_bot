// core.js — ping, help/menu, uptime, alive, session, repo
const fs = require('fs');
const path = require('path');

const BOT_START = Date.now();
const DATA_DIR = path.resolve(__dirname, '../../data');
const ALIVE_FILE = path.join(DATA_DIR, 'alive.json');
const DEFAULT_ALIVE = '✨ Hey! I\'m BlaxkBot — alive and active! 🚀';

function getAliveMessage() {
    try { return JSON.parse(fs.readFileSync(ALIVE_FILE)).message || DEFAULT_ALIVE; }
    catch { return DEFAULT_ALIVE; }
}
function setAliveMessage(message) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ALIVE_FILE, JSON.stringify({ message }, null, 2));
}

function getUptime() {
    const ms = Date.now() - BOT_START;
    const sec = Math.floor((ms / 1000) % 60);
    const min = Math.floor((ms / (1000 * 60)) % 60);
    const hr = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const day = Math.floor(ms / (1000 * 60 * 60 * 24));
    return `${day}d ${hr}h ${min}m ${sec}s`;
}

// Measure the time for WhatsApp to acknowledge a reaction to the command.
async function measureLatency(sock, msg) {
    const start = Date.now();
    await sock.sendMessage(msg.key.remoteJid, { react: { text: '⚡', key: msg.key } });
    return Date.now() - start;
}

const BOT_OWNER = 'Blaxk';
const BOT_CREATED = '03 July 2025';
const BOT_QUOTE = 'Wake Up Reality! BlaxkBot Conquers All';
const REPO_URL = 'https://github.com/black999-ng/Blaxk_bot';

module.exports = function registerCore({ registry, config }) {
    registry = registry.withCategory('core');
    const reply = (sock, msg, text) => sock.sendMessage(msg.key.remoteJid, { text });

    registry.registerCommand('ping', 'Show bot status and info', async (sock, msg) => {
        const latency = await measureLatency(sock, msg).then(ms => `${ms}ms`).catch(() => 'unavailable');
        const caption =
            `🤖 *BlaxkBot is alive!*\n` +
            `⚡ Latency: ${latency}\n` +
            `⏱ Uptime: ${getUptime()}\n` +
            `👑 Owner: ${BOT_OWNER}\n` +
            `📅 Created: ${BOT_CREATED}\n` +
            `💬 "${BOT_QUOTE}"`;
        // Attach a random banner image when available
        const images = ['Blaxk1.jpg', 'Blaxk2.jpg', 'Blaxk3.jpg', 'Blaxk4.jpg', 'Blaxk5.jpg', 'Blaxk6.jpg']
            .map(f => path.join(__dirname, '..', f))
            .filter(f => fs.existsSync(f));
        if (images.length > 0) {
            try {
                await sock.sendMessage(msg.key.remoteJid, {
                    image: fs.readFileSync(images[Math.floor(Math.random() * images.length)]),
                    caption
                });
                return;
            } catch { /* Fall back to text if a banner cannot be sent. */ }
        }
        await reply(sock, msg, caption);
    }, { permission: 'all' });

    registry.registerCommand('help', 'Show the menu or command details (.help <command>)', async (sock, msg, args) => {
        await reply(sock, msg, registry.buildHelp(config.prefix, args[0]));
    }, { permission: 'all', aliases: ['menu'] });

    registry.registerCommand('uptime', 'Show bot uptime', async (sock, msg) => {
        await reply(sock, msg, `⏱ Uptime: ${getUptime()}`);
    }, { permission: 'all' });

    registry.registerCommand('alive', 'Show alive message (set custom with .alive set <msg>)', async (sock, msg, args) => {
        if (args[0] === 'set') {
            const text = args.slice(1).join(' ').trim();
            if (!text) return reply(sock, msg, 'Usage: .alive set <message>');
            setAliveMessage(text);
            return reply(sock, msg, '✅ Alive message updated.');
        }
        await reply(sock, msg, getAliveMessage());
    }, { permission: 'all' });

    registry.registerCommand('session', 'Show session/account info', async (sock, msg) => {
        const id = sock.user?.id || 'unknown';
        await reply(sock, msg, `📟 *Session Info:*\nLogged in as: ${id}\nUptime: ${getUptime()}\nMode: ${config.mode}`);
    }, { permission: 'all' });

    registry.registerCommand('repo', 'Show bot repository link', async (sock, msg) => {
        await reply(sock, msg, `📦 BlaxkBot repo: ${REPO_URL}`);
    }, { permission: 'all' });
};
