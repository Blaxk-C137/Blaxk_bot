// system.js — owner/system commands: vars, scheduler, presence, pm2/git, jids, sudo, blocking
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DATA_DIR = path.resolve(__dirname, '../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ==================== SCHEDULER (data/schedules.json) ====================

const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

function loadSchedules() {
    try { return JSON.parse(fs.readFileSync(SCHEDULES_FILE)) || { items: [] }; } catch { return { items: [] }; }
}
function saveSchedules(db) {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(db, null, 2));
}
function listSchedules() {
    return loadSchedules().items || [];
}
function addSchedule(entry) {
    const db = loadSchedules();
    db.items = db.items || [];
    entry.id = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    db.items.push(entry);
    saveSchedules(db);
    return entry;
}
function removeSchedule(id) {
    const db = loadSchedules();
    const before = (db.items || []).length;
    db.items = (db.items || []).filter(x => x.id !== id && String(x.id) !== String(id));
    saveSchedules(db);
    return before !== db.items.length;
}
// parse "in 10m/2h/30s/1d" -> timestamp; "HH:MM" (next occurrence) -> timestamp
function parseScheduleTime(input) {
    const s = String(input || '').trim().toLowerCase();
    if (!s) return null;
    const rel = s.match(/^in\s+(\d+)\s*(s|m|h|d|w)$/);
    if (rel) {
        const n = Number(rel[1]);
        const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[rel[2]];
        const timestamp = Date.now() + n * mult;
        return n > 0 && Number.isSafeInteger(timestamp) && timestamp <= 8640000000000000 ? timestamp : null;
    }
    const at = s.match(/^(\d{1,2}):(\d{2})$/);
    if (at) {
        if (Number(at[1]) > 23 || Number(at[2]) > 59) return null;
        const now = new Date();
        const target = new Date(now);
        target.setHours(Number(at[1]), Number(at[2]), 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        return target.getTime();
    }
    const abs = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (abs) {
        const [year, month, day, hour, minute] = abs.slice(1).map(Number);
        const date = new Date(year, month - 1, day, hour, minute);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
            date.getHours() !== hour || date.getMinutes() !== minute) return null;
        return date.getTime();
    }
    return null;
}

let schedulerTimer = null;
function startScheduler(sock) {
    if (schedulerTimer) { try { clearInterval(schedulerTimer); } catch { } }
    schedulerTimer = setInterval(async () => {
        const db = loadSchedules();
        const now = Date.now();
        const remaining = [];
        for (const item of db.items || []) {
            if (item.timestamp && now >= item.timestamp) {
                try {
                    await sock.sendMessage(item.jid, { text: item.text });
                } catch { }
            } else {
                remaining.push(item);
            }
        }
        db.items = remaining;
        saveSchedules(db);
    }, 30000);
    return schedulerTimer;
}

// ==================== JIDS (data/jids.json) ====================

const JIDS_FILE = path.join(DATA_DIR, 'jids.json');

function loadJids() {
    try { return JSON.parse(fs.readFileSync(JIDS_FILE)) || { map: {} }; } catch { return { map: {} }; }
}
function saveJids(db) {
    fs.writeFileSync(JIDS_FILE, JSON.stringify(db, null, 2));
}
function saveJid(name, jid) {
    const n = String(name || '').trim().toLowerCase();
    if (!n || !jid) return false;
    const db = loadJids();
    db.map[n] = String(jid).trim();
    saveJids(db);
    return true;
}
function getJidByName(name) {
    return loadJids().map[String(name || '').trim().toLowerCase()] || null;
}
function listJids() {
    return Object.entries(loadJids().map || {}).map(([name, jid]) => ({ name, jid }));
}
function deleteJid(name) {
    const n = String(name || '').trim().toLowerCase();
    const db = loadJids();
    if (db.map[n]) {
        delete db.map[n];
        saveJids(db);
        return true;
    }
    return false;
}
function extractJidFromText(text) {
    const m = String(text || '').match(/\b[0-9]+@(?:s\.whatsapp\.net|g\.us)\b/);
    return m ? m[0] : null;
}
function resolveJid(input, fallbackJid) {
    const t = String(input || '').trim();
    if (!t) return fallbackJid || null;
    if (t.includes('@s.whatsapp.net') || t.includes('@g.us')) return t;
    return getJidByName(t) || fallbackJid || null;
}

// ==================== AUTOSTATUS (data/autoStatus.json) ====================

const AUTOSTATUS_FILE = path.join(DATA_DIR, 'autoStatus.json');

function loadAutoStatus() {
    try { return JSON.parse(fs.readFileSync(AUTOSTATUS_FILE)) || { enabled: false, reactOn: false }; }
    catch { return { enabled: false, reactOn: false }; }
}
function saveAutoStatus(cfg) {
    fs.writeFileSync(AUTOSTATUS_FILE, JSON.stringify(cfg, null, 2));
}

// Called by index.js on 'messages.upsert' with status broadcasts: auto-view + optional reaction
async function onStatusUpdate(sock, msg) {
    const cfg = loadAutoStatus();
    if (!cfg.enabled) return;
    try {
        // reading a status marks it viewed
        await sock.readMessages([msg.key]);
        if (cfg.reactOn) {
            const emojis = ['👍', '❤️', '😂', '😮', '🔥'];
            await sock.sendMessage(msg.key.remoteJid, {
                react: { key: msg.key, text: emojis[Math.floor(Math.random() * emojis.length)] }
            });
        }
    } catch (e) {
        console.error('autostatus error:', e.message);
    }
}

// ==================== COMMANDS ====================

module.exports = function registerSystem({ registry, config, Permissions, sock }) {
    registry = registry.withCategory('system');
    const reply = (sockArg, msg, text) => sockArg.sendMessage(msg.key.remoteJid, { text });

    // --- vars (runtime config via data/varOverrides.json) ---
    registry.registerCommand('mode', 'Set bot mode (.mode public|private)', async (sock, msg, args) => {
        const mode = (args[0] || '').toLowerCase();
        if (mode !== 'public' && mode !== 'private') {
            return reply(sock, msg, `📊 Mode: *${config.mode}*\n\nUse .mode public or .mode private`);
        }
        config.setVar('MODE', mode);
        await reply(sock, msg, `✅ Mode set to *${mode}*.`);
    }, { permission: 'owner' });

    registry.registerCommand('prefix', 'Change the command prefix (.prefix <char>)', async (sock, msg, args) => {
        const p = (args[0] || '').trim();
        if (!p || p.length > 3) return reply(sock, msg, 'Usage: .prefix <char> (1-3 characters)');
        config.setVar('PREFIX', p);
        await reply(sock, msg, `✅ Prefix set to *${p}* — commands now use ${p}help`);
    }, { permission: 'owner' });

    registry.registerCommand('ownernumber', 'Set the owner number (.ownernumber <number>)', async (sock, msg, args) => {
        const num = String(args[0] || '').replace(/[^0-9]/g, '');
        if (num.length < 7) return reply(sock, msg, 'Usage: .ownernumber <international number, e.g. 2348012345678>');
        config.setVar('OWNER_NUMBER', `${num}@s.whatsapp.net`);
        await reply(sock, msg, `✅ Owner number set to +${num}`);
    }, { permission: 'owner' });

    registry.registerCommand('setvar', 'Set a runtime var (.setvar KEY value)', async (sock, msg, args) => {
        const key = (args[0] || '').toUpperCase();
        const value = args.slice(1).join(' ').trim();
        if (!key || !value) return reply(sock, msg, 'Usage: .setvar <KEY> <value>\nKeys: MODE, PREFIX, OWNER_NUMBER, GEMINI_API_KEY, TMDB_API_KEY, FOOTBALL_API_KEY');
        config.setVar(key, value);
        await reply(sock, msg, `✅ ${key} saved.`);
    }, { permission: 'owner' });

    registry.registerCommand('seevar', 'Show a runtime var (.seevar KEY)', async (sock, msg, args) => {
        const key = (args[0] || '').toUpperCase();
        if (!key) return reply(sock, msg, 'Usage: .seevar <KEY>');
        // secrets are masked
        const raw = config.getVar(key, '');
        const masked = /KEY|TOKEN|SECRET/i.test(key) && raw
            ? `${raw.substring(0, 4)}...${raw.slice(-2)}` : raw;
        await reply(sock, msg, `${key} = ${masked || '(not set)'}`);
    }, { permission: 'owner' });

    // --- scheduler ---
    registry.registerCommand('schedule', 'Schedule a message (.schedule in 10m <text> | .schedule HH:MM <text>)', async (sock, msg, args) => {
        const timeParts = args[0]?.toLowerCase() === 'in' || /^\d{4}-\d{2}-\d{2}$/.test(args[0] || '') ? 2 : 1;
        const timeArg = args.slice(0, timeParts).join(' ');
        const text = args.slice(timeParts).join(' ').trim();
        if (!timeArg || !text) {
            return reply(sock, msg, 'Usage:\n.schedule in 10m <text>\n.schedule 14:30 <text>\n.schedule 2026-12-25 09:00 <text>');
        }
        const timestamp = parseScheduleTime(timeArg);
        if (!timestamp || timestamp <= Date.now()) return reply(sock, msg, '❌ Use a valid future time: in 10m, 14:30, or 2030-06-15 08:30.');
        const entry = addSchedule({ jid: msg.key.remoteJid, text, timestamp });
        const when = new Date(timestamp).toLocaleString();
        await reply(sock, msg, `⏰ Scheduled for *${when}* (id: ${entry.id})`);
    }, { permission: 'all' });

    registry.registerCommand('schedules', 'List scheduled messages', async (sock, msg) => {
        const items = listSchedules();
        if (!items.length) return reply(sock, msg, '📭 No scheduled messages.');
        const lines = items.map(i => `• [${i.id}] ${new Date(i.timestamp).toLocaleString()} → ${i.jid}\n  "${i.text.substring(0, 60)}"`);
        await reply(sock, msg, `⏰ *Scheduled Messages (${items.length}):*\n\n${lines.join('\n')}`);
    }, { permission: 'all' });

    registry.registerCommand('schedulecancel', 'Cancel a scheduled message (.schedulecancel <id>)', async (sock, msg, args) => {
        const id = args[0];
        if (!id) return reply(sock, msg, 'Usage: .schedulecancel <id> (find ids with .schedules)');
        const ok = removeSchedule(id);
        await reply(sock, msg, ok ? '🗑️ Schedule cancelled.' : '❌ No schedule with that id.');
    }, { permission: 'all' });

    // --- presence ---
    registry.registerCommand('wapresence', 'Set bot presence (.wapresence online|typing|recording|offline)', async (sock, msg, args) => {
        const mode = (args[0] || '').toLowerCase();
        const valid = { online: 'available', typing: 'composing', recording: 'recording', offline: 'unavailable' };
        if (!valid[mode]) {
            return reply(sock, msg, 'Usage: .wapresence online|typing|recording|offline');
        }
        try {
            await sock.sendPresenceUpdate(valid[mode], msg.key.remoteJid);
            await reply(sock, msg, `✅ Presence set to *${mode}*.`);
        } catch (err) {
            await reply(sock, msg, `⚠️ Failed: ${err.message}`);
        }
    }, { permission: 'owner' });

    // --- pm2 / git ---
    registry.registerCommand('pm2status', 'Show pm2/git process status', async (sock, msg) => {
        try {
            const { execFile: ef } = require('child_process');
            const util = require('util');
            const exec = util.promisify(ef);
            const pm2 = process.env.pm_id ? `Managed by pm2 (instance ${process.env.pm_id})` : 'Not managed by pm2';
            const { stdout } = await exec('git', ['log', '-1', '--oneline'], { cwd: process.cwd() });
            const uptime = Math.floor(process.uptime());
            await reply(sock, msg, `📊 *System Status*\n\n${pm2}\n🖥️ Uptime: ${uptime}s\n📦 Latest commit: ${stdout.trim()}`);
        } catch (err) {
            await reply(sock, msg, `⚠️ Status failed: ${err.message}`);
        }
    }, { permission: 'owner' });

    registry.registerCommand('restart', 'Restart the bot (via pm2 if managed, else exit)', async (sock, msg) => {
        await reply(sock, msg, '♻️ Restarting...');
        setTimeout(() => process.exit(0), 1000);
    }, { permission: 'owner' });

    registry.registerCommand('update', 'Pull latest code from git and restart', async (sock, msg) => {
        try {
            const { stdout } = await new Promise((resolve, reject) => {
                execFile('git', ['pull'], { cwd: process.cwd() }, (err, stdout, stderr) => {
                    if (err) reject(new Error(stderr || err.message)); else resolve({ stdout });
                });
            });
            const out = String(stdout || '');
            if (out.includes('Already up to date')) {
                await reply(sock, msg, '✅ Already up to date.');
            } else {
                await reply(sock, msg, `✅ Updated:\n${out.substring(0, 500)}\n\n♻️ Restarting...`);
                setTimeout(() => process.exit(0), 1000);
            }
        } catch (err) {
            await reply(sock, msg, `⚠️ Update failed: ${err.message}`);
        }
    }, { permission: 'owner' });

    // --- moderation utilities ---
    registry.registerCommand('spam', 'Spam a message N times (.spam 5 <text>)', async (sock, msg, args) => {
        const count = Math.min(parseInt(args[0], 10) || 3, 10);
        const text = args.slice(1).join(' ').trim() || 'spam';
        for (let i = 0; i < count; i++) {
            await sock.sendMessage(msg.key.remoteJid, { text });
        }
    }, { permission: 'admin' });

    registry.registerCommand('block', 'Block a user (.block @user or number)', async (sock, msg, args) => {
        const context = msg.message?.extendedTextMessage?.contextInfo;
        const target = context?.mentionedJid?.[0]
            || (args[0] && args[0].includes('@') ? args[0] : args[0] ? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
        if (!target) return reply(sock, msg, 'Usage: .block @user or .block 2348012345678');
        try {
            await sock.updateBlockStatus(target, 'block');
            await reply(sock, msg, `✅ Blocked ${target}`);
        } catch (err) {
            await reply(sock, msg, `⚠️ Failed: ${err.message}`);
        }
    }, { permission: 'owner' });

    registry.registerCommand('del', 'Delete a message (reply to it)', async (sock, msg) => {
        const context = msg.message?.extendedTextMessage?.contextInfo;
        const quoted = context?.stanzaId;
        const participant = context?.participant;
        if (!quoted) return reply(sock, msg, '❌ Reply to a message with .del to delete it.');
        try {
            await sock.sendMessage(msg.key.remoteJid, {
                delete: { remoteJid: msg.key.remoteJid, fromMe: false, id: quoted, participant }
            });
        } catch (err) {
            await reply(sock, msg, `⚠️ Failed: ${err.message}`);
        }
    }, { permission: 'admin' });

    // --- saved jids ---
    registry.registerCommand('savejid', 'Save a chat jid by name (.savejid <name> <jid|reply>)', async (sock, msg, args) => {
        const name = args[0];
        if (!name) return reply(sock, msg, 'Usage: .savejid <name> <jid or reply to a message>');
        const context = msg.message?.extendedTextMessage?.contextInfo;
        const jid = extractJidFromText(args.slice(1).join(' '))
            || (context?.participant && msg.key.remoteJid.endsWith('@g.us') ? context.participant : null)
            || (msg.key.remoteJid.includes('@s.whatsapp.net') || msg.key.remoteJid.includes('@g.us') ? msg.key.remoteJid : null);
        if (!jid) return reply(sock, msg, '❌ Provide a jid (number@s.whatsapp.net or group id@g.us).');
        saveJid(name, jid);
        await reply(sock, msg, `✅ Saved "${name}" → ${jid}`);
    }, { permission: 'all' });

    registry.registerCommand('getjid', 'Get a saved jid (.getjid <name>)', async (sock, msg, args) => {
        const name = args.join(' ').trim();
        if (!name) {
            const all = listJids();
            if (!all.length) return reply(sock, msg, '📭 No saved jids yet.');
            return reply(sock, msg, `📇 *Saved JIDs:*\n\n${all.map(j => `• ${j.name} → ${j.jid}`).join('\n')}`);
        }
        const jid = getJidByName(name);
        await reply(sock, msg, jid ? `📇 ${name} → ${jid}` : `❌ No jid saved as "${name}".`);
    }, { permission: 'all' });

    registry.registerCommand('deljid', 'Delete a saved jid (.deljid <name>)', async (sock, msg, args) => {
        const name = args.join(' ').trim();
        if (!name) return reply(sock, msg, 'Usage: .deljid <name>');
        const ok = deleteJid(name);
        await reply(sock, msg, ok ? '🗑️ Deleted.' : '❌ Not found.');
    }, { permission: 'all' });

    // --- sudo (owner delegates) ---
    registry.registerCommand('setsudo', 'Grant sudo to a number (.setsudo @user or number)', async (sock, msg, args) => {
        const context = msg.message?.extendedTextMessage?.contextInfo;
        const num = Permissions.normalizeNumber(context?.mentionedJid?.[0] || args[0] || '');
        if (!num || num.length < 7) return reply(sock, msg, 'Usage: .setsudo @user or .setsudo 2348012345678');
        const store = Permissions.stores.sudoStore;
        store.load();
        const list = Array.isArray(store.data) ? store.data : [];
        if (!list.some(value => Permissions.normalizeNumber(value) === num)) store.data = [...list, num];
        await reply(sock, msg, `✅ +${num} is now sudo.`);
    }, { permission: 'owner' });

    registry.registerCommand('delsudo', 'Revoke sudo (.delsudo @user or number)', async (sock, msg, args) => {
        const context = msg.message?.extendedTextMessage?.contextInfo;
        const num = Permissions.normalizeNumber(context?.mentionedJid?.[0] || args[0] || '');
        if (!num) return reply(sock, msg, 'Usage: .delsudo @user or .delsudo 2348012345678');
        const store = Permissions.stores.sudoStore;
        store.load();
        const list = Array.isArray(store.data) ? store.data : [];
        const remaining = list.filter(value => Permissions.normalizeNumber(value) !== num);
        const removed = remaining.length !== list.length;
        if (removed) store.data = remaining;
        await reply(sock, msg, removed ? `✅ Removed +${num}.` : '❌ Not a sudo.');
    }, { permission: 'owner' });

    registry.registerCommand('seesudo', 'List sudo numbers', async (sock, msg) => {
        const store = Permissions.stores.sudoStore;
        store.load();
        const list = Array.isArray(store.data) ? [...new Set(store.data.map(Permissions.normalizeNumber))] : [];
        await reply(sock, msg, list.length ? `🔐 *Sudo users:*\n${list.map(n => '+' + n).join('\n')}` : '📭 No sudo users.');
    }, { permission: 'owner' });

    // --- autostatus (auto-view + optional reactions on status broadcasts) ---
    registry.registerCommand('autostatus', 'Auto-view statuses (.autostatus on|off|react on|off)', async (sock, msg, args) => {
        const sub = (args[0] || '').toLowerCase();
        const cfg = loadAutoStatus();
        if (sub === 'on' || sub === 'off') {
            cfg.enabled = sub === 'on';
            saveAutoStatus(cfg);
            return reply(sock, msg, `✅ Auto status view ${sub === 'on' ? 'enabled' : 'disabled'}.`);
        }
        if (sub === 'react') {
            const rsub = (args[1] || '').toLowerCase();
            if (rsub !== 'on' && rsub !== 'off') return reply(sock, msg, 'Usage: .autostatus react on/off');
            cfg.reactOn = rsub === 'on';
            saveAutoStatus(cfg);
            return reply(sock, msg, `💫 Status reactions ${rsub === 'on' ? 'enabled' : 'disabled'}.`);
        }
        await reply(sock, msg, `🔄 *Auto Status Settings*\n\n📱 Auto view: ${cfg.enabled ? 'ON' : 'OFF'}\n💫 Reactions: ${cfg.reactOn ? 'ON' : 'OFF'}\n\n.autostatus on/off\n.autostatus react on/off`);
    }, { permission: 'owner' });

    // start the scheduler loop if we were given a live socket at registration
    if (sock) startScheduler(sock);
};

module.exports.parseScheduleTime = parseScheduleTime;
module.exports.addSchedule = addSchedule;
module.exports.removeSchedule = removeSchedule;
module.exports.listSchedules = listSchedules;
module.exports.startScheduler = startScheduler;
module.exports.saveJid = saveJid;
module.exports.getJidByName = getJidByName;
module.exports.listJids = listJids;
module.exports.deleteJid = deleteJid;
module.exports.resolveJid = resolveJid;
module.exports.extractJidFromText = extractJidFromText;
module.exports.onStatusUpdate = onStatusUpdate;
