// fun.js — fun-pack commands for BlaxkBot (games, instant fun, text/media toys)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const jidUtils = require('../jidUtils');
const content = require('./funContent.json');

// === BUNDLED CONTENT PICKER ===
function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// === DETERMINISTIC HASH (FNV-1a) — same input, same score, forever ===
function hashString(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        // 32-bit FNV prime multiplication via shifts
        hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
    }
    return hash >>> 0;
}

// === COMPATIBILITY SCORE (.ship) — deterministic + order-independent ===
function compatScore(jidA, jidB) {
    const [a, b] = [jidA, jidB].sort();
    return hashString(`${a}|${b}`) % 101;
}

// === RATE SCORE (.rate) — deterministic per user ===
function rateScore(jid) {
    return hashString(jid) % 101;
}

// === FANCY TEXT (.fancy) — unicode font styles ===
// Offset-based styles map A-Z/a-z/0-9 into mathematical alphanumeric blocks.
// NB: italic 'h' lives at U+210E (ℎ) because U+1D455 is reserved.
const FANCY_OFFSET_STYLES = {
    bold: { upper: 0x1D5D4, lower: 0x1D5EE, digit: 0x1D7EC }, // sans-serif bold
    italic: { upper: 0x1D434, lower: 0x1D44E, digit: null, special: { h: 'ℎ' } },
    mono: { upper: 0x1D670, lower: 0x1D68A, digit: 0x1D7F6 }
};
const FANCY_SMALLCAPS = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
    j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
    s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
};

function fancyText(text, style) {
    const offsetStyle = FANCY_OFFSET_STYLES[style];
    let out = '';
    for (const ch of text) {
        const code = ch.codePointAt(0);
        if (style === 'fullwidth') {
            out += code >= 0x21 && code <= 0x7e ? String.fromCodePoint(code + 0xfee0) : ch;
        } else if (style === 'smallcaps') {
            const lower = ch.toLowerCase();
            out += FANCY_SMALLCAPS[lower] || ch;
        } else if (offsetStyle) {
            if (offsetStyle.special && offsetStyle.special[ch]) {
                out += offsetStyle.special[ch];
            } else if (code >= 65 && code <= 90) {
                out += String.fromCodePoint(offsetStyle.upper + (code - 65));
            } else if (code >= 97 && code <= 122) {
                out += String.fromCodePoint(offsetStyle.lower + (code - 97));
            } else if (code >= 48 && code <= 57 && offsetStyle.digit !== null) {
                out += String.fromCodePoint(offsetStyle.digit + (code - 48));
            } else {
                out += ch;
            }
        } else {
            out += ch;
        }
    }
    return out;
}

// === ZALGO TEXT (.zalgo) — glitch with combining marks ===
function zalgoText(text, intensity = 3, rand = Math.random) {
    const MARKS = [];
    for (let c = 0x0300; c <= 0x036f; c++) MARKS.push(String.fromCodePoint(c));
    let out = '';
    for (const ch of text) {
        out += ch;
        const count = Math.max(1, Math.ceil(rand() * intensity));
        for (let i = 0; i < count; i++) {
            out += MARKS[Math.floor(rand() * MARKS.length)];
        }
    }
    return out;
}

// === PARSE HELPERS ===
function parsePickOptions(text) {
    return text.split('|').map(s => s.trim()).filter(Boolean);
}

function parseMemeText(text) {
    const parts = text.split('|').map(s => s.trim());
    return { top: parts[0] || '', bottom: parts[1] || '' };
}

// === TRIVIA GAME STATE (one active game per group, in-memory) ===
const activeTrivia = {}; // { [groupJid]: { text, answerIndex } }

function createTriviaQuestion(raw) {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const text =
        `🧠 *TRIVIA TIME!*\n\n` +
        `${raw.question}\n\n` +
        raw.options.map((opt, i) => `${letters[i]}) ${opt}`).join('\n') +
        `\n\nReply with the letter — first correct answer scores a point! 🏆`;
    return { text, answerIndex: raw.answerIndex };
}

function startTrivia(groupJid, rawQuestion) {
    const game = createTriviaQuestion(rawQuestion);
    activeTrivia[groupJid] = game;
    return game;
}

// 'correct' | 'wrong' | null (null = no game or not an answer attempt)
function answerTrivia(groupJid, userJid, text) {
    const game = activeTrivia[groupJid];
    if (!game) return null;
    const t = (text || '').trim().toLowerCase();
    let idx = null;
    if (/^[a-d]$/.test(t)) idx = t.charCodeAt(0) - 97;
    else if (/^[1-4]$/.test(t)) idx = Number(t) - 1;
    if (idx === null) return null;
    if (idx === game.answerIndex) {
        delete activeTrivia[groupJid];
        return 'correct';
    }
    return 'wrong';
}

// === SCORE PERSISTENCE ===
const SCORES_FILE = path.resolve(__dirname, 'funScores.json');
let funScores = {};
function loadFunScores() {
    if (fs.existsSync(SCORES_FILE)) {
        try {
            funScores = JSON.parse(fs.readFileSync(SCORES_FILE));
        } catch (e) {
            console.error('Failed to load funScores:', e);
        }
    }
}
function saveFunScores() {
    fs.writeFileSync(SCORES_FILE, JSON.stringify(funScores, null, 2));
}
loadFunScores();

// Pure bookkeeping — persistence wraps this.
function addScore(scores, groupJid, userJid) {
    if (!scores[groupJid]) scores[groupJid] = {};
    if (!scores[groupJid][userJid]) scores[groupJid][userJid] = 0;
    scores[groupJid][userJid]++;
}

function awardPoint(groupJid, userJid) {
    addScore(funScores, groupJid, userJid);
    saveFunScores();
}

// === LOCAL HELPERS (duplicated from index.js to avoid a circular require) ===
function mentionTag(jid) {
    return `@${jid.split('@')[0].split(':')[0]}`;
}

function getTargetUser(msg) {
    const context = msg.message?.extendedTextMessage?.contextInfo;
    return context?.mentionedJid?.[0] || context?.participant;
}

function tierLookup(tiers, score) {
    return tiers.find(t => score >= t.min && score <= t.max);
}

function emojiBar(score) {
    const filled = Math.round(score / 10);
    return '❤️'.repeat(filled) + '🖤'.repeat(10 - filled);
}

// === COMMAND DISPATCHER ===
// Returns true when the command was handled. ctx: { from, sender, text, command, send }
async function handleFunCommand(sock, msg, ctx) {
    const { from, sender, text, command, send } = ctx;
    const arg = (cmd) => text.replace(new RegExp(`^\\.${cmd}\\s*`, 'i'), '').trim();

    // --- GAMES ---
    // NB: all checks are startsWith — mention/argument text trails the command
    // (e.g. ".ship @a @b"), so exact equality would never match.
    if (command.startsWith('.truth')) {
        const target = getTargetUser(msg) || sender;
        send(`🎯 *Truth* for ${mentionTag(target)}:\n\n${pick(content.truths)}`, { mentions: [target] });
    }
    else if (command.startsWith('.dare')) {
        const target = getTargetUser(msg) || sender;
        send(`🔥 *Dare* for ${mentionTag(target)}:\n\n${pick(content.dares)}`, { mentions: [target] });
    }
    else if (command.startsWith('.wyr')) {
        send(`🤔 *Would you rather...*\n${pick(content.wouldYouRather)}`);
    }
    else if (command.startsWith('.trivia')) {
        if (!jidUtils.isGroupJid(from)) return send('❌ Trivia can only be played in groups.'), true;
        const game = startTrivia(from, pick(content.trivia));
        send(game.text);
    }
    else if (command.startsWith('.roulette')) {
        const target = getTargetUser(msg) || sender;
        send(`🔫 ${mentionTag(target)} spins the cylinder and pulls the trigger...`, { mentions: [target] });
        await new Promise(r => setTimeout(r, 2500));
        if (Math.random() < 1 / 6) {
            send(pick(content.rouletteDeath).replace('{name}', mentionTag(target)), { mentions: [target] });
        } else {
            send(pick(content.rouletteSurvive), { mentions: [target] });
        }
    }

    // --- INSTANT FUN ---
    else if (command.startsWith('.8ball')) {
        const question = arg('8ball');
        if (!question) return send('Usage: .8ball <question>'), true;
        send(`🎱 ${question}\n\n${pick(content.eightball)}`);
    }
    else if (command.startsWith('.flip')) {
        send(Math.random() < 0.5 ? '🪙 *HEADS!*' : '🪙 *TAILS!*');
    }
    else if (command.startsWith('.dice')) {
        send(`🎲 You rolled a *${1 + Math.floor(Math.random() * 6)}*`);
    }
    else if (command.startsWith('.rate')) {
        const target = getTargetUser(msg) || sender;
        const score = rateScore(jidUtils.bareJid(target));
        const tier = tierLookup(content.rateComments, score);
        send(`📊 I rate ${mentionTag(target)} a solid *${score}/100*\n${tier.comment}`, { mentions: [target] });
    }
    else if (command.startsWith('.ship')) {
        const context = msg.message?.extendedTextMessage?.contextInfo;
        const a = context?.mentionedJid?.[0];
        const b = context?.mentionedJid?.[1] || context?.participant;
        if (!a || !b || a === b) return send('Usage: .ship @user1 @user2 (two different people)'), true;
        const score = compatScore(jidUtils.bareJid(a), jidUtils.bareJid(b));
        const tier = tierLookup(content.shipVerdicts, score);
        send(
            `💘 *SHIP: ${mentionTag(a)} × ${mentionTag(b)}*\n` +
            `${emojiBar(score)} ${score}%\n${tier.verdict}`,
            { mentions: [a, b] }
        );
    }
    else if (command.startsWith('.pick')) {
        const options = parsePickOptions(arg('pick'));
        if (options.length < 2) return send('Usage: .pick option 1 | option 2 | ...'), true;
        send(`🤖 I choose: *${pick(options)}*`);
    }
    else if (command.startsWith('.joke')) {
        send(`😂 ${pick(content.jokes)}`);
    }
    else if (command.startsWith('.quote')) {
        send(`💬 "${pick(content.quotes)}"`);
    }
    else if (command.startsWith('.fact')) {
        send(`🧠 *Did you know?* ${pick(content.facts)}`);
    }

    // --- TEXT/MEDIA TOYS ---
    else if (command.startsWith('.fancy')) {
        const body = arg('fancy');
        if (!body) return send('Usage: .fancy <text>'), true;
        const styles = Object.keys(FANCY_OFFSET_STYLES).concat(['fullwidth', 'smallcaps']);
        const style = pick(styles);
        send(`✨ (${style})\n${fancyText(body, style)}`);
    }
    else if (command.startsWith('.zalgo')) {
        const body = arg('zalgo');
        if (!body) return send('Usage: .zalgo <text>'), true;
        send(`🌀 H̸e̷ ̶c̷o̷m̴e̴s̷.̷\n${zalgoText(body, 3)}`);
    }
    else if (command.startsWith('.meme')) {
        const body = arg('meme');
        if (!body) return send('Usage: .meme top text | bottom text (reply to an image)'), true;
        const { top, bottom } = parseMemeText(body);
        const context = msg.message?.extendedTextMessage?.contextInfo;
        let quoted = context?.quotedMessage;
        if (!quoted?.imageMessage) return send('❌ Reply to an image with .meme top text | bottom text.'), true;
        try {
            const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            const image = sharp(buffer);
            const meta = await image.metadata();
            const width = meta.width || 800;
            const height = meta.height || 800;
            const fontSize = Math.max(24, Math.round(width / 10));
            const svgText = (txt, y) => txt ? `<text x="50%" y="${y}" font-size="${fontSize}" font-family="Impact, sans-serif" font-weight="bold" fill="#fff" stroke="#000" stroke-width="${Math.max(2, fontSize / 15)}" text-anchor="middle" paint-order="stroke">${txt.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` : '';
            const svg = Buffer.from(
                `<svg width="${width}" height="${height}">${svgText(top, fontSize)}${svgText(bottom, height - fontSize / 3)}</svg>`
            );
            const out = await image.composite([{ input: svg }]).jpeg({ quality: 90 }).toBuffer();
            await sock.sendMessage(from, { image: out, caption: '🎭 Your meme, fresh from the oven.' });
        } catch (err) {
            console.error('❌ Meme error:', err);
            send('⚠️ Failed to create meme.');
        }
    }
    else {
        return false; // not a fun command
    }
    return true;
}

module.exports = {
    // pure helpers (tested in tests/fun.test.js)
    fancyText,
    zalgoText,
    compatScore,
    rateScore,
    parsePickOptions,
    parseMemeText,
    createTriviaQuestion,
    startTrivia,
    answerTrivia,
    addScore,
    // command handling
    handleFunCommand,
    awardPoint
};
