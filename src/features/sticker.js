// sticker.js — sticker, gif, emojimix, img, meme, vv (media toys)
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const { execFileSync } = require('child_process');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getEmojiMixUrl } = require('../emojiKitchen');
const { unwrapMessage } = require('../messageUtils');

function getQuotedMessage(msg) {
    const message = unwrapMessage(msg.message);
    const context = Object.values(message || {}).find(content => content?.contextInfo?.quotedMessage)?.contextInfo;
    return unwrapMessage(context?.quotedMessage) || null;
}

function parseEmojiPair(input) {
    const raw = String(input || '').trim();
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const parts = raw.includes('+') ? raw.split('+').map(part => part.trim()) :
        [...segmenter.segment(raw)].map(part => part.segment).filter(part => part.trim());
    const emoji = /^(?:\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?)*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)$/u;
    return parts.length === 2 && parts.every(part => emoji.test(part)) ? parts : null;
}

async function downloadQuoted(msg, type) {
    const quoted = getQuotedMessage(msg);
    if (!quoted) return null;
    const content = quoted?.[type + 'Message'];
    if (!content) return null;
    const stream = await downloadContentFromMessage(content, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

function hasQuotedType(msg, type) {
    const quoted = getQuotedMessage(msg);
    return !!quoted?.[type + 'Message'];
}

// Animated sticker: video -> webp via system ffmpeg (no fluent-ffmpeg dependency)
async function videoToAnimatedSticker(buffer) {
    const tmpIn = path.join(os.tmpdir(), `blaxk_${Date.now()}.in`);
    const tmpOut = tmpIn + '.webp';
    fs.writeFileSync(tmpIn, buffer);
    try {
        execFileSync('ffmpeg', [
            '-y', '-i', tmpIn, '-vcodec', 'libwebp', '-an',
            '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=black@0',
            '-lossless', '0', '-q:v', '70', '-loop', '0', tmpOut
        ], { stdio: 'ignore', timeout: 60000 });
        return fs.readFileSync(tmpOut);
    } finally {
        fs.rmSync(tmpIn, { force: true });
        fs.rmSync(tmpOut, { force: true });
    }
}

async function createStickerBuffer(inputBuffer, { pack = 'BlaxkBot', author = 'Blaxk999' } = {}) {
    // Primary: wa-sticker-formatter (adds metadata, works for images + videos)
    try {
        const { Sticker, StickerTypes } = require('wa-sticker-formatter');
        const sticker = new Sticker(inputBuffer, { pack, author, type: StickerTypes.FULL, quality: 80 });
        return await sticker.toBuffer();
    } catch { /* fall through to sharp */ }
    // Fallback: plain sharp webp resize
    return sharp(inputBuffer)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 })
        .toBuffer();
}

module.exports = function registerSticker({ registry, config }) {
    registry = registry.withCategory('sticker');
    const reply = (sock, msg, text) => sock.sendMessage(msg.key.remoteJid, { text });

    // === STICKER (reply to image/video) ===
    registry.registerCommand('sticker', 'Create a sticker from a replied image or video', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        try {
            const pack = args[0] || 'BlaxkBot';
            if (hasQuotedType(msg, 'image')) {
                const buffer = await downloadQuoted(msg, 'image');
                const webp = await createStickerBuffer(buffer, { pack });
                await sock.sendMessage(from, { sticker: webp });
            } else if (hasQuotedType(msg, 'video')) {
                const buffer = await downloadQuoted(msg, 'video');
                try {
                    const webp = await createStickerBuffer(buffer, { pack });
                    await sock.sendMessage(from, { sticker: webp });
                } catch {
                    const webp = await videoToAnimatedSticker(buffer);
                    await sock.sendMessage(from, { sticker: webp });
                }
            } else {
                await reply(sock, msg, '❌ Reply to an image or short video with .sticker.');
            }
        } catch (err) {
            console.error('❌ Sticker error:', err);
            await reply(sock, msg, '⚠️ Failed to create sticker. (Video stickers require ffmpeg.)');
        }
    }, { permission: 'all', aliases: ['s'] });

    // === GIF (reply to video) ===
    registry.registerCommand('gif', 'Convert a replied short video to looping MP4-GIF', async (sock, msg) => {
        const from = msg.key.remoteJid;
        if (!hasQuotedType(msg, 'video')) return reply(sock, msg, '❌ Reply to a short video with .gif.');
        try {
            const buffer = await downloadQuoted(msg, 'video');
            const tmpIn = path.join(os.tmpdir(), `blaxk_gif_${Date.now()}.in`);
            const tmpOut = tmpIn + '.mp4';
            fs.writeFileSync(tmpIn, buffer);
            try {
                execFileSync('ffmpeg', [
                    '-y', '-i', tmpIn, '-an', '-t', '10',
                    '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
                    '-vf', 'scale=512:-2:force_original_aspect_ratio=decrease,fps=15',
                    '-preset', 'veryfast', '-crf', '28',
                    '-vcodec', 'libx264', tmpOut
                ], { stdio: 'ignore', timeout: 60000 });
                await sock.sendMessage(from, { video: fs.readFileSync(tmpOut), caption: '🎥 Your GIF', gifPlayback: true });
            } finally {
                fs.rmSync(tmpIn, { force: true });
                fs.rmSync(tmpOut, { force: true });
            }
        } catch (err) {
            console.error('❌ Gif error:', err);
            await reply(sock, msg, '⚠️ Failed to convert to GIF. (Requires ffmpeg; max ~10s video.)');
        }
    }, { permission: 'all' });

    // === MEME (reply to image, caption it) ===
    registry.registerCommand('meme', 'Caption a replied image (top | bottom)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const body = args.join(' ').trim();
        if (!body) return reply(sock, msg, 'Usage: .meme top text | bottom text (reply to an image)');
        const [top, bottom] = body.split('|').map(s => s.trim());
        if (!hasQuotedType(msg, 'image')) return reply(sock, msg, '❌ Reply to an image with .meme top text | bottom text.');
        try {
            const buffer = await downloadQuoted(msg, 'image');
            const image = sharp(buffer);
            const meta = await image.metadata();
            const width = meta.width || 800;
            const height = meta.height || 800;
            const fontSize = Math.max(24, Math.round(width / 10));
            const svgText = (txt, y) => txt ? `<text x="50%" y="${y}" font-size="${fontSize}" font-family="Impact, sans-serif" font-weight="bold" fill="#fff" stroke="#000" stroke-width="${Math.max(2, fontSize / 15)}" text-anchor="middle" paint-order="stroke">${txt.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` : '';
            const svg = Buffer.from(`<svg width="${width}" height="${height}">${svgText(top, fontSize)}${svgText(bottom, height - fontSize / 3)}</svg>`);
            const out = await image.composite([{ input: svg }]).jpeg({ quality: 90 }).toBuffer();
            await sock.sendMessage(from, { image: out, caption: '🎭 Your meme, fresh from the oven.' });
        } catch (err) {
            console.error('❌ Meme error:', err);
            await reply(sock, msg, '⚠️ Failed to create meme.');
        }
    }, { permission: 'all' });

    // === VV (view-once unlock) ===
    registry.registerCommand('vv', 'Unhide view-once media (reply to it)', async (sock, msg) => {
        const from = msg.key.remoteJid;
        try {
            if (hasQuotedType(msg, 'image')) {
                const buffer = await downloadQuoted(msg, 'image');
                await sock.sendMessage(from, { image: buffer, caption: '🔓 View-once image unlocked!' });
            } else if (hasQuotedType(msg, 'video')) {
                const buffer = await downloadQuoted(msg, 'video');
                await sock.sendMessage(from, { video: buffer, caption: '🔓 View-once video unlocked!' });
            } else if (hasQuotedType(msg, 'audio')) {
                const buffer = await downloadQuoted(msg, 'audio');
                await sock.sendMessage(from, { audio: buffer, mimetype: 'audio/mpeg' });
            } else {
                await reply(sock, msg, '🧐 Reply to a *view-once* image, video, or audio with .vv.');
            }
        } catch (err) {
            console.error('❌ VV error:', err);
            await reply(sock, msg, '⚠️ Failed to unlock view-once media.');
        }
    }, { permission: 'all' });

    // === EMOJIMIX (two emojis -> Emoji Kitchen sticker) ===
    registry.registerCommand('emojimix', 'Mix two emojis into a sticker (.emojimix 😅+😍)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const pair = parseEmojiPair(args.join(' '));
        if (!pair) return reply(sock, msg, `Usage: ${config.prefix}emojimix 😅+😍 (send two emojis)`);
        try {
            const axios = require('axios');
            const imageUrl = getEmojiMixUrl(...pair);
            if (!imageUrl) return reply(sock, msg, '❌ Emoji Kitchen has no mix for that pair. Try 😅+😍 or ❤️+🔥.');
            const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 5 * 1024 * 1024 });
            const webp = await createStickerBuffer(Buffer.from(imgRes.data));
            await sock.sendMessage(from, { sticker: webp });
        } catch (err) {
            console.error('❌ Emojimix error:', err.message);
            await reply(sock, msg, '⚠️ Could not download the emoji mix. Please try again shortly.');
        }
    }, { permission: 'all' });

    // === IMG (image search — external) ===
    registry.registerCommand('img', 'Search and send an image (.img <query>)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) return reply(sock, msg, 'Usage: .img <search query>');
        try {
            const axios = require('axios');
            // DuckDuckGo image search (no API key required)
            const tokenUrl = 'https://duckduckgo.com/';
            const tokenRes = await axios.get(tokenUrl, { params: { q: query }, timeout: 10000 });
            const vqdMatch = tokenRes.data.match(/vqd=([\d-]+)\&/);
            if (!vqdMatch) throw new Error('search token unavailable');
            const res = await axios.get('https://duckduckgo.com/i.js', {
                params: { l: 'wt-wt', o: 'json', q: query, vqd: vqdMatch[1], f: ',,,', p: '1' },
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 15000
            });
            const results = res.data?.results || [];
            if (!results.length) throw new Error('no results');
            const imgRes = await axios.get(results[0].image, { responseType: 'arraybuffer', timeout: 20000 });
            await sock.sendMessage(from, { image: Buffer.from(imgRes.data), caption: `🖼️ "${query}"` });
        } catch (err) {
            console.error('❌ Img error:', err.message);
            await reply(sock, msg, `⚠️ Image search failed: ${err.message}. (Requires network.)`);
        }
    }, { permission: 'all', aliases: ['image'] });

    // === MP3 (extract audio from replied video) & REVERSE ===
    registry.registerCommand('mp3', 'Extract audio from a replied video as MP3', async (sock, msg) => {
        const from = msg.key.remoteJid;
        if (!hasQuotedType(msg, 'video') && !hasQuotedType(msg, 'audio')) {
            return reply(sock, msg, '❌ Reply to a video or audio with .mp3.');
        }
        try {
            const type = hasQuotedType(msg, 'video') ? 'video' : 'audio';
            const buffer = await downloadQuoted(msg, type);
            const tmpIn = path.join(os.tmpdir(), `blaxk_mp3_${Date.now()}.in`);
            const tmpOut = tmpIn + '.mp3';
            fs.writeFileSync(tmpIn, buffer);
            try {
                execFileSync('ffmpeg', ['-y', '-i', tmpIn, '-vn', '-b:a', '128k', tmpOut], { stdio: 'ignore', timeout: 60000 });
                await sock.sendMessage(from, {
                    audio: fs.readFileSync(tmpOut),
                    mimetype: 'audio/mpeg',
                    fileName: 'blaxkbot.mp3'
                });
            } finally {
                fs.rmSync(tmpIn, { force: true });
                fs.rmSync(tmpOut, { force: true });
            }
        } catch (err) {
            console.error('❌ Mp3 error:', err);
            await reply(sock, msg, '⚠️ Failed to extract audio. (Requires ffmpeg.)');
        }
    }, { permission: 'all' });

    registry.registerCommand('reverse', 'Reverse a replied audio or video', async (sock, msg) => {
        const from = msg.key.remoteJid;
        const type = hasQuotedType(msg, 'video') ? 'video' : hasQuotedType(msg, 'audio') ? 'audio' : null;
        if (!type) return reply(sock, msg, '❌ Reply to a video or audio with .reverse.');
        try {
            const buffer = await downloadQuoted(msg, type);
            const tmpIn = path.join(os.tmpdir(), `blaxk_rev_${Date.now()}.in`);
            const tmpOut = tmpIn + '.out' + (type === 'video' ? '.mp4' : '.mp3');
            fs.writeFileSync(tmpIn, buffer);
            try {
                const args = ['-y', '-i', tmpIn];
                if (type === 'video') {
                    args.push('-vf', 'reverse', '-af', 'areverse', '-preset', 'veryfast', tmpOut);
                } else {
                    args.push('-af', 'areverse', tmpOut);
                }
                execFileSync('ffmpeg', args, { stdio: 'ignore', timeout: 60000 });
                const content = type === 'video'
                    ? { video: fs.readFileSync(tmpOut), caption: '🔄 Reversed!' }
                    : { audio: fs.readFileSync(tmpOut), mimetype: 'audio/mpeg' };
                await sock.sendMessage(from, content);
            } finally {
                fs.rmSync(tmpIn, { force: true });
                fs.rmSync(tmpOut, { force: true });
            }
        } catch (err) {
            console.error('❌ Reverse error:', err);
            await reply(sock, msg, '⚠️ Failed to reverse media. (Requires ffmpeg.)');
        }
    }, { permission: 'all' });
};

module.exports.createStickerBuffer = createStickerBuffer;
module.exports.videoToAnimatedSticker = videoToAnimatedSticker;
module.exports.parseEmojiPair = parseEmojiPair;
module.exports.getQuotedMessage = getQuotedMessage;
