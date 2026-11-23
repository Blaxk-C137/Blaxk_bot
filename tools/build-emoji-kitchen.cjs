// Run: node tools/build-emoji-kitchen.cjs /path/to/metadata.json
const fs = require('fs');
const path = require('path');
const { gzipSync } = require('zlib');
const { normalizeCodepoint, IMAGE_BASE } = require('../src/emojiKitchen');

if (!process.argv[2]) throw new Error('Provide an Emoji Kitchen metadata.json file.');
const metadata = JSON.parse(fs.readFileSync(process.argv[2]));
const index = {};
for (const emoji of Object.values(metadata.data)) {
    for (const mixes of Object.values(emoji.combinations)) {
        for (const mix of mixes) {
            if (!mix.isLatest) continue;
            if (!mix.gStaticUrl.startsWith(IMAGE_BASE)) throw new Error('Unexpected image origin.');
            const key = [normalizeCodepoint(mix.leftEmojiCodepoint), normalizeCodepoint(mix.rightEmojiCodepoint)].sort().join('+');
            const suffix = mix.gStaticUrl.slice(IMAGE_BASE.length);
            if (!index[key] || suffix > index[key]) index[key] = suffix;
        }
    }
}
const sorted = Object.fromEntries(Object.keys(index).sort().map(key => [key, index[key]]));
const output = path.resolve(__dirname, '../data/emojiKitchen.json.gz');
fs.writeFileSync(output, gzipSync(JSON.stringify(sorted), { mtime: 0 }));
console.log(`Built ${Object.keys(sorted).length} combinations: ${output}`);
