const test = require('node:test');
const assert = require('node:assert/strict');
const { getMessageText } = require('../src/messageUtils');
const { createRegistry } = require('../src/commands');

test('commands in disappearing messages reach the dispatcher', async () => {
    const message = { ephemeralMessage: { message: { extendedTextMessage: { text: '.hello there' } } } };
    const registry = createRegistry();
    let received;
    registry.registerCommand('hello', 'greeting', async (sock, msg, args) => { received = args; });
    const msg = { key: { remoteJid: '123@s.whatsapp.net' }, message };
    const handled = await registry.dispatch({}, msg, getMessageText(message));
    assert.equal(handled, true);
    assert.deepEqual(received, ['there']);
});

test('message text extraction handles nested captions and empty messages', () => {
    assert.equal(getMessageText({ conversation: '.menu' }), '.menu');
    assert.equal(getMessageText({ viewOnceMessageV2: { message: { imageMessage: { caption: '.menu' } } } }), '.menu');
    assert.equal(getMessageText({ ephemeralMessage: { message: { videoMessage: { caption: '.help sticker' } } } }), '.help sticker');
    assert.equal(getMessageText(undefined), '');
});
