const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// point the config overrides at a temp file so tests don't touch real runtime vars
// (config reads data/varOverrides.json, so we swap the file content instead)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blaxk-sys-'));
const realOverrides = path.resolve(__dirname, '../data/varOverrides.json');
const savedOverrides = fs.existsSync(realOverrides) ? fs.readFileSync(realOverrides) : null;
fs.writeFileSync(realOverrides, JSON.stringify({}, null, 2));
const config = require('../src/config');
config.__resetOverrides();

// redirect the module's data files into the temp dir (system.js writes next to itself)
const schedFile = path.resolve(__dirname, '../data/schedules.json');
const jidsFile = path.resolve(__dirname, '../data/jids.json');

const system = require('../src/features/system');
const sims = require('../src/features/sims');

test('var commands flip config: setVar MODE private then config.mode === private', async () => {
    const { createRegistry } = require('../src/commands');
    const reg = createRegistry();
    system({ registry: reg, config, Permissions: { stores: { sudoStore: { add: async () => {}, remove: async () => true, list: async () => [] } } } });

    const sent = [];
    const sock = { sendMessage: async (jid, c) => { sent.push(c); return { key: {} }; } };
    const msg = { key: { remoteJid: 'owner@s.whatsapp.com', fromMe: false } };

    await reg.dispatch(sock, msg, '.mode private', async () => true);
    assert.strictEqual(config.mode, 'private');
    assert.ok(sent[0].text.includes('private'));

    await reg.dispatch(sock, msg, '.mode bogus', async () => true);
    assert.ok(sent[1].text.includes('Usage') || sent[1].text.includes('Mode'));

    await reg.dispatch(sock, msg, '.mode public', async () => true);
    assert.strictEqual(config.mode, 'public');

    // prefix
    await reg.dispatch(sock, msg, '.prefix !', async () => true);
    assert.strictEqual(config.prefix, '!');
    // restore so the rest of the test can keep using '.' commands
    config.setVar('PREFIX', '.');
    assert.strictEqual(config.prefix, '.');

    // seevar masks keys
    await reg.dispatch(sock, msg, '.setvar GEMINI_API_KEY secret123', async () => true);
    await reg.dispatch(sock, msg, '.seevar GEMINI_API_KEY', async () => true);
    assert.ok(!JSON.stringify(sent).includes('secret123'), 'secret must be masked');
    await reg.dispatch(sock, msg, '.seevar MODE', async () => true);
    assert.ok(sent[sent.length - 1].text.includes('public'));
});

test('parseScheduleTime parses relative, time-of-day, and absolute datetimes', () => {
    const before = Date.now();
    const in10m = system.parseScheduleTime('in 10m');
    assert.ok(in10m >= before + 10 * 60000 - 2000 && in10m <= before + 10 * 60000 + 2000);
    assert.ok(system.parseScheduleTime('in 2h') > before + 3600000);
    assert.ok(system.parseScheduleTime('in 30s') > before);
    assert.ok(system.parseScheduleTime('IN 1D') > before + 86400000 - 5000);

    const at = system.parseScheduleTime('23:59');
    assert.ok(at > before, 'future time-of-day');
    const d = new Date(at);
    assert.strictEqual(d.getHours(), 23);
    assert.strictEqual(d.getMinutes(), 59);

    const abs = system.parseScheduleTime('2030-06-15 08:30');
    assert.strictEqual(new Date(abs).getFullYear(), 2030);

    assert.strictEqual(system.parseScheduleTime('garbage'), null);
    assert.strictEqual(system.parseScheduleTime(''), null);
});

test('scheduler add/list/remove round trip persists to disk', () => {
    fs.rmSync(schedFile, { force: true });
    const entry = system.addSchedule({ jid: 'g@g.us', text: 'hello future', timestamp: Date.now() + 60000 });
    assert.ok(entry.id);
    assert.strictEqual(system.listSchedules().length, 1);
    assert.ok(system.removeSchedule(entry.id));
    assert.strictEqual(system.listSchedules().length, 0);
    assert.strictEqual(system.removeSchedule('nope'), false);
});

test('jids save/get/list/delete round trip + resolveJid', () => {
    fs.rmSync(jidsFile, { force: true });
    assert.strictEqual(system.saveJid('Dev Group', '123456@g.us'), true);
    assert.strictEqual(system.saveJid('', 'x'), false);
    assert.strictEqual(system.getJidByName('dev group'), '123456@g.us'); // name normalization
    assert.strictEqual(system.getJidByName('missing'), null);
    assert.strictEqual(system.listJids().length, 1);
    assert.strictEqual(system.resolveJid('Dev Group'), '123456@g.us');
    assert.strictEqual(system.resolveJid('234801@s.whatsapp.net'), '234801@s.whatsapp.net');
    assert.strictEqual(system.resolveJid('', 'fallback@g.us'), 'fallback@g.us');
    assert.strictEqual(system.deleteJid('dev group'), true);
    assert.strictEqual(system.deleteJid('dev group'), false);
    assert.strictEqual(system.extractJidFromText('chat with 234801@s.whatsapp.net please'), '234801@s.whatsapp.net');
});

test('sims payload generators produce the classic payloads', () => {
    const override = sims.generateOverrideAbuse();
    assert.ok(override.includes('Normal text'));
    assert.ok(override.includes('‮')); // RLO

    const nuke = sims.generateNukePayload();
    assert.ok(nuke.includes('SIMULATED NUKE'));
    assert.ok((nuke.match(/👹/g) || []).length === 100);

    const junk = sims.generateHtmlJunk();
    assert.ok(junk.includes('<div'));
    assert.ok(junk.includes('marquee'));

    const crash = sims.generateCrashPayload();
    // 👹 is a surrogate pair: 20000 UTF-16 units = 10000 emoji
    assert.strictEqual([...crash].length, 10000);
    assert.ok((crash.match(/👹/g) || []).length === 10000);
});

// restore the real overrides file after the suite
test.after?.(async () => {
    if (savedOverrides !== null) fs.writeFileSync(realOverrides, savedOverrides);
    else fs.rmSync(realOverrides, { force: true });
});

test('sims and system register their full command sets', () => {
    const { createRegistry } = require('../src/commands');
    const reg = createRegistry();
    sims({ registry: reg, config });
    system({ registry: reg, config, Permissions: { stores: { sudoStore: { add: async () => {}, remove: async () => true, list: async () => [] } } } });
    const names = [...reg.commands.keys()];
    for (const n of ['crash', 'bugbot', 'override', 'nuke', 'htmljunk',
                     'mode', 'prefix', 'ownernumber', 'setvar', 'seevar',
                     'schedule', 'schedules', 'schedulecancel', 'wapresence',
                     'pm2status', 'restart', 'update', 'spam', 'block', 'del',
                     'savejid', 'getjid', 'deljid', 'setsudo', 'delsudo', 'seesudo']) {
        assert.ok(names.includes(n), `missing: ${n}`);
    }
});
