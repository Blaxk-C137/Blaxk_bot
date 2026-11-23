const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createRegistry } = require('../src/commands');
const sticker = require('../src/features/sticker');

test('emoji pair parsing accepts complete emoji sequences and common separators', () => {
    for (const [input, expected] of [
        ['😅+😍', ['😅', '😍']], ['❤️ + 🔥', ['❤️', '🔥']],
        ['👍🏽 😍', ['👍🏽', '😍']], ['👩‍💻+🤖', ['👩‍💻', '🤖']],
        ['😅😍', ['😅', '😍']]
    ]) assert.deepEqual(sticker.parseEmojiPair(input), expected);
    for (const input of ['hello+😍', '😅+😍+🔥', '😅', 'x😅+😍', '1+2']) {
        assert.equal(sticker.parseEmojiPair(input), null, input);
    }
});

test('quoted media detection unwraps disappearing and view-once replies', () => {
    const imageMessage = { mimetype: 'image/jpeg', url: 'https://example.com/image' };
    const msg = { message: { imageMessage: { contextInfo: { quotedMessage: {
        ephemeralMessage: { message: { viewOnceMessageV2Extension: { message: { imageMessage } } } }
    } } } } };
    assert.deepEqual(sticker.getQuotedMessage(msg), { imageMessage });
});

test('emojimix produces a real WebP sticker from the catalog combination', async t => {
    const axios = require('axios');
    const image = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#ffcc00' } }).png().toBuffer();
    const imageUrl = 'https://www.gstatic.com/android/keyboard/emojikitchen/20201001/u1f605/u1f605_u1f60d.png';
    const requests = [];
    t.mock.method(axios, 'get', async (url, options) => {
        requests.push(url);
        assert.equal(url, imageUrl);
        assert.equal(options.responseType, 'arraybuffer');
        return { data: image };
    });
    const registry = createRegistry();
    sticker({ registry, config: { prefix: '.' } });
    const sent = [];
    await registry.dispatch({ sendMessage: async (jid, content) => sent.push(content) },
        { key: { remoteJid: '123@s.whatsapp.net' } }, '.emojimix 😅+😍');
    assert.ok(sent.at(-1).sticker, JSON.stringify(sent));
    const metadata = await sharp(sent.at(-1).sticker).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 512);
    assert.ok(requests.includes(imageUrl));
});

test('emoji catalog handles reverse order, heart selectors and skin tones', () => {
    const { getEmojiMixUrl } = require('../src/emojiKitchen');
    const face = 'https://www.gstatic.com/android/keyboard/emojikitchen/20201001/u1f605/u1f605_u1f60d.png';
    const heart = 'https://www.gstatic.com/android/keyboard/emojikitchen/20230821/u2764-ufe0f/u2764-ufe0f_u1f525.png';
    assert.equal(getEmojiMixUrl('😅', '😍'), face);
    assert.equal(getEmojiMixUrl('😍', '😅'), face);
    assert.equal(getEmojiMixUrl('❤️', '🔥'), heart);
    assert.equal(getEmojiMixUrl('🔥', '❤'), heart);
    assert.equal(getEmojiMixUrl('👍🏽', '😍'), getEmojiMixUrl('👍', '😍'));
    assert.equal(getEmojiMixUrl('👩‍💻', '🤖'), null);
});

test('unsupported emoji pairs make no network request', async t => {
    const axios = require('axios');
    t.mock.method(axios, 'get', async () => assert.fail('unsupported pairs must not download anything'));
    const registry = createRegistry();
    sticker({ registry, config: { prefix: '.' } });
    const sent = [];
    await registry.dispatch({ sendMessage: async (jid, content) => sent.push(content) },
        { key: { remoteJid: '123@s.whatsapp.net' } }, '.emojimix 👩‍💻+🤖');
    assert.match(sent.at(-1).text, /no mix/);
});
