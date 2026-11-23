const test = require('node:test');
const assert = require('node:assert');
const { createRegistry } = require('../src/commands');

const mockSock = () => ({
    sent: [],
    sendMessage: async function (jid, content) { this.sent.push(content); return true; }
});
const mockMsg = () => ({ key: { remoteJid: 'x@s.whatsapp.com', fromMe: false } });

test('dispatch calls the registered handler with parsed args', async () => {
    const reg = createRegistry();
    const calls = [];
    reg.registerCommand('hello', 'says hi', async (sock, msg, args) => calls.push(args), { permission: 'all' });
    const handled = await reg.dispatch(mockSock(), mockMsg(), '.hello world foo');
    assert.strictEqual(handled, true);
    assert.deepStrictEqual(calls, [['world', 'foo']]);
});

test('dispatch returns false for unknown commands', async () => {
    const reg = createRegistry();
    const handled = await reg.dispatch(mockSock(), mockMsg(), '.nope');
    assert.strictEqual(handled, false);
});

test('aliases dispatch to the same handler', async () => {
    const reg = createRegistry();
    let hit = 0;
    reg.registerCommand('sticker', 'sticker', async () => hit++, { permission: 'all', aliases: ['s'] });
    await reg.dispatch(mockSock(), mockMsg(), '.s');
    assert.strictEqual(hit, 1);
});

test('groupOnly commands reject private chats with a message', async () => {
    const reg = createRegistry();
    let handlerRan = false;
    reg.registerCommand('kick', 'kick', async () => { handlerRan = true; }, { permission: 'admin', groupOnly: true });
    const sock = mockSock();
    const handled = await reg.dispatch(sock, mockMsg(), '.kick');
    assert.strictEqual(handled, true);
    assert.strictEqual(handlerRan, false);
    assert.ok(sock.sent[0].text.includes('groups only'));
});

test('handler errors are caught and reported, dispatch still returns true', async () => {
    const reg = createRegistry();
    reg.registerCommand('boom', 'boom', async () => { throw new Error('kaboom'); }, { permission: 'all' });
    const sock = mockSock();
    const handled = await reg.dispatch(sock, mockMsg(), '.boom');
    assert.strictEqual(handled, true);
    assert.ok(sock.sent[0].text.includes('failed'));
});

test('permission denial stops the handler without running it', async () => {
    const reg = createRegistry();
    let handlerRan = false;
    reg.registerCommand('secret', 'secret', async () => { handlerRan = true; }, { permission: 'owner' });
    const handled = await reg.dispatch(mockSock(), mockMsg(), '.secret', async () => false);
    assert.strictEqual(handled, true);
    assert.strictEqual(handlerRan, false);
});

test('command details preserve descriptions, permissions and aliases', () => {
    const reg = createRegistry();
    reg.registerCommand('ping', 'ping the bot', async () => {}, { permission: 'all' });
    reg.registerCommand('kick', 'kick a user', async () => {}, { permission: 'admin' });
    reg.registerCommand('restart', 'restart bot', async () => {}, { permission: 'owner' });
    reg.registerCommand('sticker', 'make sticker', async () => {}, { permission: 'all', aliases: ['s'] });
    assert.ok(reg.buildHelp('.', 'ping').includes('ping the bot'));
    assert.ok(reg.buildHelp('.', 'kick').includes('Admin'));
    assert.ok(reg.buildHelp('.', 'restart').includes('Owner'));
    const help = reg.buildHelp('!', 's');
    assert.ok(help.includes('!sticker'));
    assert.ok(help.includes('!s'));
    assert.ok(help.includes('make sticker'));
});

test('menu groups every canonical command by feature without listing aliases twice', () => {
    const reg = createRegistry();
    reg.withCategory('core').registerCommand('ping', 'status', async () => {});
    reg.withCategory('sticker').registerCommand('sticker', 'make sticker', async () => {}, { aliases: ['s'] });
    reg.withCategory('group').registerCommand('kick', 'remove member', async () => {}, { permission: 'admin' });
    const menu = reg.buildHelp('!');
    assert.ok(menu.includes('Essentials'));
    assert.ok(menu.includes('Stickers & media'));
    assert.ok(menu.includes('Group management'));
    assert.ok(menu.includes('3 commands'));
    assert.strictEqual((menu.match(/!sticker\b/g) || []).length, 1);
    assert.ok(!/!s\b/.test(menu));
    assert.ok(menu.includes('!help <command>'));
    assert.ok(!menu.includes('make sticker'), 'descriptions belong in command details');
});

test('command details use the current prefix in usage examples', () => {
    const reg = createRegistry();
    reg.registerCommand('alive', 'Set message (.alive set <text>)', async () => {}, { groupOnly: true });
    const help = reg.buildHelp('!!', '!!alive');
    assert.ok(help.includes('!!alive set <text>'));
    assert.ok(help.includes('Groups only'));
    assert.ok(reg.buildHelp('!!', 'missing').includes('!!menu'));
    assert.ok(reg.buildHelp('B', 'Balive').includes('Balive set <text>'), 'uppercase prefixes must work in copied command names');
});
