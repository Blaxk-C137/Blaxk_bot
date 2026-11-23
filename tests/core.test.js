const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistry } = require('../src/commands');
const core = require('../src/features/core');

function setup() {
    const registry = createRegistry();
    core({ registry, config: { prefix: '.', mode: 'public' } });
    const sent = [];
    const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'sent' } }; } };
    const msg = { key: { remoteJid: '123@s.whatsapp.net', id: 'incoming', fromMe: false } };
    return { registry, sent, sock, msg };
}

test('ping uses a reaction rather than sending a blank message', async () => {
    const { registry, sent, sock, msg } = setup();
    await registry.dispatch(sock, msg, '.ping');
    assert.deepEqual(sent[0].react?.key, msg.key);
    assert.ok(sent.every(content => content.text !== ''));
    assert.match(sent.at(-1).caption || sent.at(-1).text, /Latency: \d+ms/);
});

test('ping still replies when reactions and image delivery are unavailable', async () => {
    const { registry, sent, msg } = setup();
    const sock = { sendMessage: async (jid, content) => {
        if (content.react || content.image) throw new Error('unsupported');
        sent.push(content);
    } };
    await registry.dispatch(sock, msg, '.ping');
    assert.match(sent.at(-1).text, /BlaxkBot is alive/);
    assert.match(sent.at(-1).text, /Latency: unavailable/);
});

test('menu and help arguments provide details for an alias', async () => {
    const { registry, sent, sock, msg } = setup();
    await registry.dispatch(sock, msg, '.menu ping');
    assert.match(sent[0].text, /Show bot status and info/);
});
