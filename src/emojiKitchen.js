// Emoji Kitchen URLs are looked up locally; only the resulting image needs a download.
const fs = require('fs');
const path = require('path');
const { gunzipSync } = require('zlib');

const IMAGE_BASE = 'https://www.gstatic.com/android/keyboard/emojikitchen/';
let combinations;

function normalizeCodepoint(codepoint) {
    return codepoint.split('-').filter(part =>
        part !== 'fe0e' && part !== 'fe0f' && !(parseInt(part, 16) >= 0x1f3fb && parseInt(part, 16) <= 0x1f3ff)
    ).join('-');
}

function getEmojiMixUrl(first, second) {
    if (!combinations) {
        combinations = JSON.parse(gunzipSync(fs.readFileSync(path.resolve(__dirname, '../data/emojiKitchen.json.gz'))));
    }
    const codepoint = emoji => normalizeCodepoint([...emoji].map(char => char.codePointAt(0).toString(16)).join('-'));
    const key = [codepoint(first), codepoint(second)].sort().join('+');
    const suffix = combinations[key];
    return suffix ? IMAGE_BASE + suffix : null;
}

module.exports = { getEmojiMixUrl, normalizeCodepoint, IMAGE_BASE };
