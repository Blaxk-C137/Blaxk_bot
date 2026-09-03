const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const createPermissions = require('../src/permissions');

function freshEnv(ownerNumber = '2348012345678') {
    const storesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blaxk-perm-'));
    return { storesDir, perm: createPermissions({ ownerNumber, mode: 'public' }, storesDir) };
}

const mockSock = (participants = []) => ({
    groupMetadata: async () => ({ participants }),
    sendMessage: async () => {}
});

// sender is owner when normalized numbers match (LIDs/suffixes must not break this)
test('isOwner matches owner number despite JID suffixes', () => {
    const { perm } = freshEnv();
    const msg = { key: { remoteJid: 'g@g.us', participant: '2348012345678:5@s.whatsapp.com', fromMe: false } };
    assert.strictEqual(perm.isOwner(msg), true);
    const msg2 = { key: { remoteJid: '2349999999999@s.whatsapp.com', fromMe: false } };
    assert.strictEqual(perm.isOwner(msg2), false);
});

test('isOwner accepts fromMe messages (bot itself)', () => {
    const { perm } = freshEnv();
    const msg = { key: { remoteJid: 'x@s.whatsapp.com', fromMe: true } };
    assert.strictEqual(perm.isOwner(msg), true);
});

test('isSudo reads from sudo.json store', () => {
    const { storesDir, perm } = freshEnv();
    fs.writeFileSync(path.join(storesDir, 'sudo.json'), JSON.stringify(['2347000000000@s.whatsapp.com']));
    assert.strictEqual(perm.isSudo('2347000000000@s.whatsapp.com'), true);
    assert.strictEqual(perm.isSudo('2348012345678@s.whatsapp.com'), false);
});

test('isGroupAdmin checks group metadata participant admin flag', async () => {
    const { perm } = freshEnv();
    const sock = mockSock([
        { id: '2348011111111@s.whatsapp.com', admin: 'admin' },
        { id: '2348022222222@s.whatsapp.com', admin: null }
    ]);
    assert.strictEqual(await perm.isGroupAdmin(sock, 'g@g.us', '2348011111111@s.whatsapp.com'), true);
    assert.strictEqual(await perm.isGroupAdmin(sock, 'g@g.us', '2348022222222@s.whatsapp.com'), false);
});

test('activator tier passes for the stored group activator', () => {
    const { storesDir, perm } = freshEnv();
    fs.writeFileSync(path.join(storesDir, 'groupActivators.json'), JSON.stringify({ 'g@g.us': '2348022222222@s.whatsapp.com' }));
    assert.strictEqual(perm.isActivator('g@g.us', '2348022222222@s.whatsapp.com'), true);
    assert.strictEqual(perm.isActivator('g@g.us', '2348033333333@s.whatsapp.com'), false);
});

test('private mode denies non-owner for all-tier commands', async () => {
    const storesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blaxk-perm-'));
    const perm = createPermissions({ ownerNumber: '2348012345678', mode: 'private' }, storesDir);
    const sock = { sendMessage: async () => {} };
    const msg = { key: { remoteJid: '2349999999999@s.whatsapp.com', fromMe: false } };
    assert.strictEqual(await perm.canRunCommand(sock, msg, 'ping'), false);
});

test('basic users keep access to all-tier commands in private mode', async () => {
    const storesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blaxk-perm-'));
    fs.writeFileSync(path.join(storesDir, 'addedUsers.json'), JSON.stringify(['2349999999999@s.whatsapp.com']));
    const perm = createPermissions({ ownerNumber: '2348012345678', mode: 'private' }, storesDir);
    const sock = { sendMessage: async () => {} };
    const msg = { key: { remoteJid: '2349999999999@s.whatsapp.com', fromMe: false } };
    assert.strictEqual(await perm.canRunCommand(sock, msg, 'ping'), true);
});

test('admin tier passes for group admin, activator, and owner; fails for pleb', async () => {
    const storesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blaxk-perm-'));
    fs.writeFileSync(path.join(storesDir, 'groupActivators.json'), JSON.stringify({ 'g@g.us': '2348022222222@s.whatsapp.com' }));
    // Register the command like the real app does, so canRunCommand resolves its tier
    const { createRegistry } = require('../src/commands');
    createRegistry().registerCommand('kick', 'kick a user', async () => {}, { permission: 'admin' });
    const perm = createPermissions({ ownerNumber: '2348012345678', mode: 'public' }, storesDir);
    const sock = mockSock([
        { id: '2348011111111@s.whatsapp.com', admin: 'admin' },
        { id: '2348033333333@s.whatsapp.com', admin: null }
    ]);
    const mk = (participant) => ({ key: { remoteJid: 'g@g.us', participant, fromMe: false } });
    assert.strictEqual(await perm.canRunCommand(sock, mk('2348011111111@s.whatsapp.com'), 'kick'), true);   // admin
    assert.strictEqual(await perm.canRunCommand(sock, mk('2348022222222@s.whatsapp.com'), 'kick'), true);   // activator
    assert.strictEqual(await perm.canRunCommand(sock, mk('2348012345678:9@s.whatsapp.com'), 'kick'), true);  // owner
    assert.strictEqual(await perm.canRunCommand(sock, mk('2348033333333@s.whatsapp.com'), 'kick'), false);  // pleb
});
