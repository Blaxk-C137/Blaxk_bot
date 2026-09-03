// ai.js — Gemini chat with personality modes + per-chat history (key-optional)
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'gemini.json');

function loadDB() {
    try { return JSON.parse(fs.readFileSync(DB_FILE)) || {}; } catch { return {}; }
}
function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Personality modes (ported from TCF)
const MODES = {
    normal: 'You\'re a chill, helpful friend. Answer questions naturally, use emojis when it feels right. Don\'t be robotic.',
    savage: 'You\'re brutally honest, witty, and hilarious. Roast people but make them laugh while doing it. Use Nigerian slang and swag. Be savage but entertaining.',
    teacher: 'You\'re a knowledgeable mentor who actually cares. Explain things like you\'re talking to a friend. Break down complex stuff so it makes sense.',
    hacker: 'You\'re a tech geek with mad hacking knowledge. Talk about security, coding, and tech like you live and breathe it. Use tech slang naturally.',
    villain: 'You\'re a calculated, ruthless mastermind. Use cold logic and dark humor. Be dramatic, intimidating, and oddly likeable.',
    boss: 'You\'re a successful CEO with CEO energy. Think strategically. Give business advice like you\'ve built empires. Confident, commanding, not arrogant.',
    npc: 'You\'re a useless NPC from a video game. Give repetitive, unhelpful, boring responses. Be as useful as a wooden sign in a game.',
    rizz: 'You\'ve got RIZZ for days. Smooth, charming, confident, irresistible. Drop flirty lines and romantic advice naturally. Make people feel special.',
    adaptive: 'Study how the person talks and adapt. Learn from context and previous interactions to personalize responses. Balance helpful with engaging.'
};
const DEFAULT_MODE = 'normal';

function getMode(jid) {
    const db = loadDB();
    return (db[jid] && db[jid].mode) || DEFAULT_MODE;
}
function setMode(jid, mode) {
    const db = loadDB();
    if (!db[jid]) db[jid] = {};
    db[jid].mode = mode;
    saveDB(db);
}

// Conversation history (last 50 entries per chat)
function getHistory(jid) {
    const db = loadDB();
    return db[jid]?.history || [];
}
function addToHistory(jid, role, text) {
    const db = loadDB();
    if (!db[jid]) db[jid] = {};
    if (!Array.isArray(db[jid].history)) db[jid].history = [];
    db[jid].history.push({ role, text, ts: Date.now() });
    if (db[jid].history.length > 50) db[jid].history = db[jid].history.slice(-50);
    saveDB(db);
}
function clearHistory(jid) {
    const db = loadDB();
    if (db[jid]) { db[jid].history = []; saveDB(db); }
}

function buildSystemPrompt(mode) {
    return `${MODES[mode] || MODES[DEFAULT_MODE]}

GUIDELINES:
- Don't be formal or robotic — use casual, natural language
- Show personality; be a little unpredictable
- Don't say "I'm an AI" or remind people you're a bot
- Keep WhatsApp responses concise but engaging

Bot Name: BlaxkBot
Current mode: ${mode}`;
}

// Build a history array suitable for @google/genai chats.create contents
function buildContents(jid) {
    return getHistory(jid).map(h => ({
        role: h.role === 'bot' ? 'model' : 'user',
        parts: [{ text: h.text }]
    }));
}

// Testable seam: overridable client factory
let _createClient = null;
function createClient(apiKey) {
    if (_createClient) return _createClient(apiKey);
    const { GoogleGenAI } = require('@google/genai');
    return new GoogleGenAI({ apiKey });
}

async function askGemini(config, jid, prompt, { maxTurns = 10 } = {}) {
    if (!config.geminiApiKey) {
        return { error: '🔑 .gemini needs GEMINI_API_KEY in .env' };
    }
    const mode = getMode(jid);
    const ai = createClient(config.geminiApiKey);
    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction: buildSystemPrompt(mode) },
        ...(Object.keys(getHistory(jid)).length ? { contents: buildContents(jid) } : {})
    });
    addToHistory(jid, 'user', prompt);
    const response = await chat.sendMessage({ message: prompt });
    const text = response.text || '';
    if (text) addToHistory(jid, 'bot', text);
    return { text };
}

module.exports = function registerAI({ registry, config }) {
    const reply = (sock, msg, text) => sock.sendMessage(msg.key.remoteJid, { text });

    registry.registerCommand('gemini', 'Chat with Gemini AI (.gemini <prompt> | .gemini mode <mode> | .gemini clear | .gemini modes)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'modes') {
            const modeList = Object.entries(MODES).map(([name, desc]) => `*${name}* — ${desc.split('.')[0]}`).join('\n');
            return reply(sock, msg, `🎭 *Gemini modes:*\n\n${modeList}\n\nUse .gemini mode <name> to switch.`);
        }
        if (sub === 'mode') {
            const mode = (args[1] || '').toLowerCase();
            if (!MODES[mode]) return reply(sock, msg, `❌ Unknown mode. Use .gemini modes to see available modes.`);
            setMode(from, mode);
            return reply(sock, msg, `✅ Gemini mode set to *${mode}*.`);
        }
        if (sub === 'clear') {
            clearHistory(from);
            return reply(sock, msg, '🗑️ Conversation history cleared.');
        }

        const prompt = args.join(' ').trim();
        if (!prompt) {
            return reply(sock, msg, `Usage: .gemini <prompt>\n.gemini mode <mode>\n.gemini modes\n.gemini clear`);
        }

        try {
            const result = await askGemini(config, from, prompt);
            if (result.error) return reply(sock, msg, result.error);
            if (!result.text) return reply(sock, msg, '⚠️ Gemini returned an empty response. Try again.');
            await reply(sock, msg, result.text);
        } catch (err) {
            console.error('❌ Gemini error:', err.message);
            await reply(sock, msg, '⚠️ Gemini is unavailable right now. Try again later.');
        }
    }, { permission: 'all', aliases: ['chatgpt', 'ai'] });

    registry.registerCommand('clear', 'Clear this chat\'s Gemini conversation history', async (sock, msg) => {
        clearHistory(msg.key.remoteJid);
        await reply(sock, msg, '🗑️ AI conversation history cleared for this chat.');
    }, { permission: 'all' });
};

// Test seams
module.exports.askGemini = askGemini;
module.exports._setClientFactory = (fn) => { _createClient = fn; };
module.exports._reset = () => { _createClient = null; };
module.exports._dbFile = DB_FILE;
module.exports.MODES = MODES;
module.exports.getHistory = getHistory;
module.exports.getMode = getMode;
