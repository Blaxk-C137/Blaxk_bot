const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Load the module and grab the pure word-regex builder
// (it's not exported publicly; we test via the register flow with a temp data dir)
const moderation = require('../src/features/moderation');

test('moderation pipeline hooks default to no-op before registration', async () => {
    assert.strictEqual(await moderation.checkAntiword(null, 'g@g.us', 'u@s.whatsapp.com', 'hello', {}), false);
    assert.strictEqual(await moderation.checkAntilink(null, 'g@g.us', 'u@s.whatsapp.com', 'hello', {}), false);
    await moderation.onMessagesUpdate(null, []);
});

test('antilink command toggles and reports status', async () => {
    // point the module's data dir at a temp dir by running register with cwd-independent stores
    const { createRegistry } = require('../src/commands');
    const createPermissions = require('../src/permissions');
    const reg = createRegistry();
    const storesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blaxk-mod-'));
    const perm = createPermissions({ ownerNumber: '111@s.whatsapp.com', mode: 'public' }, storesDir);

    // reset persisted state so repeated runs start from OFF
    const linkStoreFile = path.resolve(__dirname, '../data/linkDeleteGroups.json');
    if (fs.existsSync(linkStoreFile)) {
        const data = JSON.parse(fs.readFileSync(linkStoreFile));
        delete data['g@g.us'];
        fs.writeFileSync(linkStoreFile, JSON.stringify(data, null, 2));
    }
    const wordStoreFile = path.resolve(__dirname, '../data/antiwords.json');
    if (fs.existsSync(wordStoreFile)) {
        const data = JSON.parse(fs.readFileSync(wordStoreFile));
        delete data['g2@g.us'];
        fs.writeFileSync(wordStoreFile, JSON.stringify(data, null, 2));
    }

    const sent = [];
    const sock = { sendMessage: async (jid, c) => { sent.push(c); return { key: {} }; } };
    const msg = { key: { remoteJid: 'g@g.us', participant: '111@s.whatsapp.com', fromMe: false } };

    const hooks = moderation({ registry: reg, config: require('../src/config'), Permissions: perm });

    // status before enabling
    await reg.dispatch(sock, msg, '.antilink');
    // enable with kick action
    await reg.dispatch(sock, msg, '.antilink on kick');
    // status after
    await reg.dispatch(sock, msg, '.antilink');

    assert.ok(sent[0].text.includes('OFF'));
    assert.ok(sent[1].text.includes('enabled (kick)'));
    assert.ok(sent[2].text.includes('ON (kick)'));

    // antilink hook: link message from pleb gets intercepted; admin message passes
    const sock2 = {
        sendMessage: async (jid, c) => { sent.push(c); return { key: {} }; },
        groupMetadata: async () => ({ participants: [{ id: '999@s.whatsapp.com', admin: 'admin' }, { id: 'pleb@s.whatsapp.com', admin: null }] })
    };
    const linkMsg = { key: { remoteJid: 'g@g.us', participant: 'pleb@s.whatsapp.com', id: 'MSG1', fromMe: false } };
    const intercepted = await hooks.checkAntilink(sock2, 'g@g.us', 'pleb@s.whatsapp.com', 'check this https://spam.example', linkMsg);
    assert.strictEqual(intercepted, true);
    const adminPass = await hooks.checkAntilink(sock2, 'g@g.us', '999@s.whatsapp.com', 'https://ok.example', linkMsg);
    assert.strictEqual(adminPass, false);
    const plainText = await hooks.checkAntilink(sock2, 'g@g.us', 'pleb@s.whatsapp.com', 'just chatting', linkMsg);
    assert.strictEqual(plainText, false);
});

test('antiword add/list/remove round trip', async () => {
    const { createRegistry } = require('../src/commands');
    const createPermissions = require('../src/permissions');
    const reg = createRegistry();
    const storesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blaxk-aw-'));
    const perm = createPermissions({ ownerNumber: '111@s.whatsapp.com', mode: 'public' }, storesDir);
    const sent = [];
    const sock = { sendMessage: async (jid, c) => { sent.push(c); return { key: {} }; } };
    const msg = { key: { remoteJid: 'g2@g.us', participant: '111@s.whatsapp.com', fromMe: false } };
    moderation({ registry: reg, config: require('../src/config'), Permissions: perm });

    await reg.dispatch(sock, msg, '.antiword on');
    await reg.dispatch(sock, msg, '.antiword add idiot, fool');
    await reg.dispatch(sock, msg, '.antiword list');
    await reg.dispatch(sock, msg, '.antiword remove fool');
    await reg.dispatch(sock, msg, '.antiword list');

    assert.ok(sent[1].text.includes('2 word'));
    assert.ok(sent[2].text.includes('idiot, fool'));
    assert.ok(sent[4].text.includes('idiot'));
    assert.ok(!sent[4].text.includes('fool,'));
});
