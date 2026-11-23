// fun.js — fun-pack: games, instant fun, text toys (merged BlaxkBot + TCF)
const fs = require('fs');
const path = require('path');
const jidUtils = require('../jidUtils');
const content = require('../../data/funContent.json');

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

// === FANCY TEXT (.fancy) — merged unicode styles ===
// BlaxkBot offset-based styles + TCF's lookup-table styles, all in one registry.
const FANCY_OFFSET_STYLES = {
    bold: { upper: 0x1D5D4, lower: 0x1D5EE, digit: 0x1D7EC }, // sans-serif bold
    italic: { upper: 0x1D434, lower: 0x1D44E, digit: null, special: { h: 'ℎ' } }, // script (italic)
    mono: { upper: 0x1D670, lower: 0x1D68A, digit: 0x1D7F6 }, // monospace
    // additional math-alphanumeric blocks for the merged 30+ style set
    boldfraktur: { upper: 0x1D56C, lower: 0x1D586, digit: null },
    sansbolditalic: { upper: 0x1D63C, lower: 0x1D656, digit: 0x1D820 },
    sansitalic: { upper: 0x1D608, lower: 0x1D622, digit: null, special: { h: 'ℎ' } },
    scriptbold: { upper: 0x1D4D0, lower: 0x1D4EA, digit: null },
    // deprecated-style but widely supported negated/variant selectors as small extras
    sansdigitbold: { upper: 0x1D5D4, lower: 0x1D5EE, digit: 0x1D7EC }
};
const FANCY_SMALLCAPS = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
    j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
    s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
};

// TCF lookup-table styles (ported; same alphabet mapping approach)
const normalChars = {
    small: 'abcdefghijklmnopqrstuvwxyz',
    capital: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    number: '0123456789'
};
const TCF_FONTS = {
    bolditalic: {
        small: '𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯',
        capital: '𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕', number: '0123456789'
    },
    sans: {
        small: '𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓',
        capital: '𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹',
        number: '𝟢𝟣𝟤𝟥𝟦𝟧𝟨𝟩𝟪𝟫'
    },
    doublestruck: {
        small: '𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫',
        capital: '𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ',
        number: '𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡'
    },
    fraktur: {
        small: '𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷',
        capital: '𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ', number: '0123456789'
    },
    script: {
        small: '𝒶𝒷𝒸𝒹𝑒𝒻𝑔𝒽𝒾𝒿𝓀𝓁𝓂𝓃𝑜𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏',
        capital: '𝒜𝐵𝒞𝒟𝐸𝐹𝒢𝐻𝐼𝒥𝒦𝐿𝑀𝒩𝒪𝒫𝒬𝑅𝑆𝑇𝒰𝒱𝒲𝒳𝒴𝒵', number: '0123456789'
    },
    boldscript: {
        small: '𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃',
        capital: '𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩', number: '0123456789'
    },
    circled: {
        small: 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ',
        capital: 'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ',
        number: '⓪①②③④⑤⑥⑦⑧⑨'
    },
    squared: {
        small: '🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉',
        capital: '🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉', number: '0123456789'
    },
    parens: {
        small: '⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵',
        capital: '⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵',
        number: '0⑴⑵⑶⑷⑸⑹⑺⑻⑼'
    },
    upsidedown: {
        small: 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz',
        capital: 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz', number: '0123456789'
    },
    // combining-mark decorative styles
    strike: { combining: '̶' },   // long stroke overlay (strikethrough)
    underline: { combining: '̲' }, // combining low line
    slash: { combining: '̸' }      // combining solidus
};

// Runic-style / symbol substitutions (offset table patterns)
const FANCY_SYMBOL_SUBS = {
    sparkle: { a: 'ᗅ', b: 'ᖯ', c: 'ᑢ', d: 'ᑯ', e: 'ᗴ', f: 'ᖴ', g: 'ᘜ', h: 'ᕼ', i: 'ᓰ', j: 'ᒍ', k: 'ᖽ', l: 'ᒪ', m: 'ᘻ', n: 'ᑎ', o: 'ᓬ', p: 'ᑭ', q: 'ᑫ', r: 'ᖇ', s: 'ᔑ', t: 'ᖶ', u: 'ᑌ', v: 'ᐺ', w: 'ᘵ', x: '᙭', y: 'Ƴ', z: 'ᘔ' },
    currency: { a: '₳', b: '฿', c: '₵', d: 'Đ', e: 'Ɇ', f: 'ƒ', g: '₲', h: 'ⱨ', i: 'ł', j: 'J', k: '₭', l: 'Ⱡ', m: '₥', n: '₦', o: 'ø', p: '₱', q: 'Q', r: 'Ɽ', s: '₴', t: '₮', u: 'ᵾ', v: 'ṿ', w: '₩', x: 'Ӿ', y: 'Ɏ', z: 'Ⱬ' },
    greekish: { a: 'α', b: 'β', c: '¢', d: 'δ', e: 'ε', f: 'ƒ', g: 'ɢ', h: 'һ', i: 'ᴵ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'σ', p: 'ρ', q: 'q', r: 'ʀ', s: 'ѕ', t: 'т', u: 'υ', v: 'ν', w: 'ω', x: 'χ', y: 'у', z: 'ᴢ' },
    bubbles: { a: '❁', b: '❂', c: '❃', d: '❀', e: '✿', f: '❆', g: '❉', h: '❋', i: '✤', j: '✥', k: '✣', l: '✢', m: '✧', n: '✦', o: '✩', p: '✪', q: '✫', r: '✬', s: '✭', t: '✮', u: '✯', v: '✰', w: '✱', x: '✲', y: '✳', z: '✴' },
    hearts: { a: 'ᗅ', b: 'β', c: 'ƈ', d: 'ɖ', e: 'ɛ', f: 'Ƒ', g: 'ɠ', h: 'ɦ', i: 'Ɩ', j: 'ʆ', k: 'ƙ', l: 'ɭ', m: 'ɱ', n: 'ɳ', o: 'ơ', p: 'ƿ', q: 'զ', r: 'ɾ', s: 'ʂ', t: 'ƭ', u: 'υ', v: 'ѵ', w: 'ա', x: 'ҳ', y: 'у', z: 'ʐ' },
    bent: { a: 'ą', b: 'ҍ', c: 'ç', d: 'ժ', e: 'ɛ', f: 'ƒ', g: 'ց', h: 'հ', i: 'ì', j: 'ʝ', k: 'ӄ', l: 'Լ', m: 'ʍ', n: 'ղ', o: 'ò', p: 'ք', q: 'զ', r: 'ɾ', s: 'ʂ', t: 'ե', u: 'մ', v: 'ѵ', w: 'ա', x: 'χ', y: 'վ', z: 'Հ' },
    tiny: { a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', q: ' q', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ' }
};

// Full style registry: name -> implementation flag
const FANCY_STYLES = {
    ...Object.fromEntries(Object.keys(FANCY_OFFSET_STYLES).map(k => [k, 'offset'])),
    fullwidth: 'fullwidth',
    smallcaps: 'smallcaps',
    ...Object.fromEntries(Object.keys(TCF_FONTS).map(k => [k, 'table'])),
    ...Object.fromEntries(Object.keys(FANCY_SYMBOL_SUBS).map(k => [k, 'subs']))
};

function fancyText(text, style) {
    const offsetStyle = FANCY_OFFSET_STYLES[style];
    const subsStyle = FANCY_SYMBOL_SUBS[style];
    // spread into arrays first: the table glyphs are surrogate pairs,
    // so plain string[index] would split them into broken halves
    const tableStyle = TCF_FONTS[style] && !TCF_FONTS[style].combining && {
        small: [...TCF_FONTS[style].small],
        capital: [...TCF_FONTS[style].capital],
        number: [...TCF_FONTS[style].number]
    };
    const combiningStyle = TCF_FONTS[style]?.combining;
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
        } else if (combiningStyle) {
            // attach one combining mark after each alnum character
            out += ch + (/[A-Za-z0-9]/.test(ch) ? combiningStyle : '');
        } else if (subsStyle) {
            const lower = ch.toLowerCase();
            out += subsStyle[lower] || ch;
        } else if (tableStyle) {
            let converted = ch;
            const lowerIndex = normalChars.small.indexOf(ch);
            if (lowerIndex !== -1) converted = tableStyle.small[lowerIndex] || ch;
            const upperIndex = normalChars.capital.indexOf(ch);
            if (upperIndex !== -1) converted = tableStyle.capital[upperIndex] || ch;
            const numberIndex = normalChars.number.indexOf(ch);
            if (numberIndex !== -1) converted = tableStyle.number[numberIndex] || ch;
            out += converted;
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

function triviaByDifficulty(difficulty) {
    if (!['easy', 'medium', 'hard'].includes(difficulty)) return content.trivia;
    return content.trivia.filter(q => q.difficulty === difficulty);
}

function createTriviaQuestion(raw) {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const text =
        `🧠 *TRIVIA TIME!* (${raw.difficulty || 'any'})\n\n` +
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
const SCORES_FILE = path.resolve(__dirname, '../../data/funScores.json');
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

// === TIC-TAC-TOE (ported from TCF, per-group in-memory games) ===
const activeGames = new Map();

function createGame(chatId, playerX, playerO) {
    const game = {
        players: { X: playerX, O: playerO },
        board: [[' ', ' ', ' '], [' ', ' ', ' '], [' ', ' ', ' ']],
        currentTurn: 'X',
        moves: 0,
        status: 'playing',
        winner: null
    };
    activeGames.set(chatId, game);
    return game;
}

function getGame(chatId) {
    return activeGames.get(chatId) || null;
}

function deleteGame(chatId) {
    activeGames.delete(chatId);
}

// Pure: 'X' | 'O' | null — rows, columns, diagonals
function checkWinner(board) {
    for (let i = 0; i < 3; i++) {
        if (board[i][0] !== ' ' && board[i][0] === board[i][1] && board[i][1] === board[i][2]) {
            return board[i][0];
        }
    }
    for (let i = 0; i < 3; i++) {
        if (board[0][i] !== ' ' && board[0][i] === board[1][i] && board[1][i] === board[2][i]) {
            return board[0][i];
        }
    }
    if (board[0][0] !== ' ' && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
        return board[0][0];
    }
    if (board[0][2] !== ' ' && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
        return board[0][2];
    }
    return null;
}

function makeMove(chatId, playerJid, position) {
    const game = getGame(chatId);
    if (!game) {
        return { success: false, message: '❌ No active game. Start a new game with .ttt @user' };
    }
    if (game.players[game.currentTurn] !== playerJid) {
        return { success: false, message: '❌ Not your turn!' };
    }
    if (position < 1 || position > 9) {
        return { success: false, message: '❌ Position must be between 1-9' };
    }
    const row = Math.floor((position - 1) / 3);
    const col = (position - 1) % 3;
    if (game.board[row][col] !== ' ') {
        return { success: false, message: '❌ Position already taken!' };
    }
    game.board[row][col] = game.currentTurn;
    game.moves++;

    const winner = checkWinner(game.board);
    if (winner) {
        game.status = 'won';
        game.winner = game.players[winner];
        return { success: true, game, gameOver: true, result: 'win' };
    }
    if (game.moves === 9) {
        game.status = 'draw';
        return { success: true, game, gameOver: true, result: 'draw' };
    }
    game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';
    return { success: true, game, gameOver: false };
}

function formatBoard(game) {
    const board = game.board;
    const cell = (v, pos) => v === ' ' ? String(pos) : v;
    let text = '🎮 *TIC-TAC-TOE* 🎮\n\n';
    text += `❌ Player X: @${game.players.X.split('@')[0]}\n`;
    text += `⭕ Player O: @${game.players.O.split('@')[0]}\n\n`;
    if (game.status === 'playing') {
        text += `🔄 Turn: ${game.currentTurn === 'X' ? '❌' : '⭕'} @${game.players[game.currentTurn].split('@')[0]}\n\n`;
    }
    text += '```\n';
    text += '     │     │     \n';
    text += `  ${cell(board[0][0], 1)}  │  ${cell(board[0][1], 2)}  │  ${cell(board[0][2], 3)}  \n`;
    text += '     │     │     \n';
    text += '─────┼─────┼─────\n';
    text += '     │     │     \n';
    text += `  ${cell(board[1][0], 4)}  │  ${cell(board[1][1], 5)}  │  ${cell(board[1][2], 6)}  \n`;
    text += '     │     │     \n';
    text += '─────┼─────┼─────\n';
    text += '     │     │     \n';
    text += `  ${cell(board[2][0], 7)}  │  ${cell(board[2][1], 8)}  │  ${cell(board[2][2], 9)}  \n`;
    text += '     │     │     \n';
    text += '```\n';
    if (game.status === 'won') {
        text += `\n🎉 *WINNER!* 🎉\n@${game.winner.split('@')[0]} wins!\n`;
    } else if (game.status === 'draw') {
        text += `\n🤝 *DRAW!* 🤝\nGame ended in a tie!\n`;
    } else {
        text += `\n💡 Reply with a number (1-9) to make your move\n`;
    }
    return text;
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

// === TEXTMAKER (.textmaker <effect> <text>) — ephoto360 via mumaker, networked ===
const TEXTMAKER_EFFECTS = {
    thunder: 'https://en.ephoto360.com/thunder-text-effect-online-97.html',
    leaves: 'https://en.ephoto360.com/green-brush-text-effect-typography-maker-online-153.html',
    1917: 'https://en.ephoto360.com/1917-style-text-effect-523.html',
    arena: 'https://en.ephoto360.com/create-cover-arena-of-valor-by-mastering-360.html',
    hacker: 'https://en.ephoto360.com/create-anonymous-hacker-avatars-cyan-neon-677.html',
    sand: 'https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html',
    blackpink: 'https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html',
    glitch: 'https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html',
    fire: 'https://en.ephoto360.com/flame-lettering-effect-372.html',
    wings: 'https://en.ephoto360.com/wings-text-effect-176.html',
    christmas: 'https://en.ephoto360.com/create-sparkles-3d-christmas-text-effect-online-727.html',
    frost: 'https://en.ephoto360.com/create-a-frozen-christmas-text-effect-online-792.html',
    deadpool: 'https://en.ephoto360.com/create-text-effects-in-the-style-of-the-deadpool-logo-818.html',
    dbz: 'https://en.ephoto360.com/create-dragon-ball-style-text-effects-online-809.html',
    naruto: 'https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html',
    pixelglitch: 'https://en.ephoto360.com/create-pixel-glitch-text-effect-online-769.html',
    arrow: 'https://en.ephoto360.com/create-multicolored-signature-attachment-arrow-effect-714.html'
};

async function runTextmaker(sock, from, effect, text) {
    let mumaker;
    try {
        mumaker = require('mumaker');
    } catch {
        return sock.sendMessage(from, { text: '⚠️ textmaker unavailable (mumaker not installed).' });
    }
    try {
        const url = TEXTMAKER_EFFECTS[effect];
        const texts = effect === 'deadpool'
            ? text.split(',').map(t => t.trim()).filter(Boolean)
            : text;
        if (effect === 'deadpool' && texts.length !== 2) {
            return sock.sendMessage(from, { text: '❌ Deadpool needs two texts separated by a comma.\nExample: .textmaker deadpool Blaxk, Bot' });
        }
        const result = await mumaker.ephoto(url, texts);
        if (!result?.image) throw new Error('no image URL returned');
        await sock.sendMessage(from, {
            image: { url: result.image },
            caption: `✅ *${effect.toUpperCase()} TEXT EFFECT*\n\n📝 Text: ${text}`
        });
    } catch (err) {
        console.error('❌ Textmaker error:', err.message);
        await sock.sendMessage(from, { text: `⚠️ Failed to generate ${effect} text effect: ${err.message}` });
    }
}

// === REGISTRATION (registry module interface) ===
module.exports = function registerFun({ registry, config, Permissions }) {
    registry = registry.withCategory('fun');
    const send = (sock, msg, text, opts = {}) =>
        sock.sendMessage(msg.key.remoteJid, { text, ...(opts.mentions ? { mentions: opts.mentions } : {}) });

    const command = (name, description, handler, meta = {}) =>
        registry.registerCommand(name, description, handler, { permission: 'all', ...meta });

    // --- GAMES ---
    command('truth', 'Get a random truth question', async (sock, msg) => {
        const target = getTargetUser(msg) || msg.key.participant || senderJid(msg);
        send(sock, msg, `🎯 *Truth* for ${mentionTag(target)}:\n\n${pick(content.truths)}`, { mentions: [target] });
    });

    command('dare', 'Get a random dare', async (sock, msg) => {
        const target = getTargetUser(msg) || msg.key.participant || senderJid(msg);
        send(sock, msg, `🔥 *Dare* for ${mentionTag(target)}:\n\n${pick(content.dares)}`, { mentions: [target] });
    });

    command('wyr', 'Would you rather...?', async (sock, msg) => {
        send(sock, msg, `🤔 *Would you rather...*\n${pick(content.wouldYouRather)}`);
    });

    command('trivia', 'Start a trivia round (.trivia [easy|medium|hard])', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        if (!jidUtils.isGroupJid(from)) return send(sock, msg, '❌ Trivia can only be played in groups.');
        const difficulty = (args[0] || '').toLowerCase();
        const pool = triviaByDifficulty(difficulty);
        const game = startTrivia(from, pick(pool));
        send(sock, msg, game.text);
    });

    command('roulette', 'Spin the cylinder — 1 in 6 chance of a bad day', async (sock, msg) => {
        const target = getTargetUser(msg) || msg.key.participant || senderJid(msg);
        send(sock, msg, `🔫 ${mentionTag(target)} spins the cylinder and pulls the trigger...`, { mentions: [target] });
        await new Promise(r => setTimeout(r, 2500));
        if (Math.random() < 1 / 6) {
            send(sock, msg, pick(content.rouletteDeath).replace('{name}', mentionTag(target)), { mentions: [target] });
        } else {
            send(sock, msg, pick(content.rouletteSurvive));
        }
    });

    command('tictactoe', 'Play tic-tac-toe (.ttt @opponent)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const challenger = msg.key.participant || senderJid(msg);
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const opponent = mentions[0] || args[0];
        if (getGame(from)) {
            return send(sock, msg, '❌ A game is already running here. Reply 1-9 to play, or .tttend to end it.');
        }
        if (!opponent || !opponent.includes('@')) {
            return send(sock, msg, 'Usage: .ttt @opponent — mention someone to challenge.');
        }
        if (opponent === challenger) {
            return send(sock, msg, '❌ You can\'t challenge yourself!');
        }
        createGame(from, challenger, opponent);
        await sock.sendMessage(from, { text: formatBoard(getGame(from)), mentions: [challenger, opponent] });
    }, { aliases: ['ttt'] });

    command('tttend', 'End the current tic-tac-toe game', async (sock, msg) => {
        const from = msg.key.remoteJid;
        if (!getGame(from)) return send(sock, msg, '❌ No game running here.');
        deleteGame(from);
        send(sock, msg, '🗑️ Game ended.');
    });

    // ttt move interception: plain digits 1-9 in a group with an active game
    module.exports.tryTttMove = async function tryTttMove(sock, msg, chatJid, senderJidArg, text) {
        const game = getGame(chatJid);
        if (!game) return false;
        const t = (text || '').trim();
        if (!/^[1-9]$/.test(t)) return false;
        const result = makeMove(chatJid, senderJidArg, Number(t));
        if (!result.success) {
            await sock.sendMessage(chatJid, { text: result.message });
            return true;
        }
        const g = result.game;
        if (result.gameOver) {
            const mentions = [g.players.X, g.players.O];
            if (result.result === 'win') {
                await sock.sendMessage(chatJid, { text: formatBoard(g) + `\n🎉 @${g.winner.split('@')[0]} takes the win!`, mentions });
            } else {
                await sock.sendMessage(chatJid, { text: formatBoard(g), mentions });
            }
            deleteGame(chatJid);
        } else {
            await sock.sendMessage(chatJid, { text: formatBoard(g), mentions: [g.players.X, g.players.O] });
        }
        return true;
    };

    // --- INSTANT FUN ---
    command('8ball', 'Ask the magic 8-ball (.8ball <question>)', async (sock, msg, args) => {
        const question = args.join(' ').trim();
        if (!question) return send(sock, msg, 'Usage: .8ball <question>');
        send(sock, msg, `🎱 ${question}\n\n${pick(content.eightball)}`);
    });

    command('flip', 'Flip a coin', async (sock, msg) => {
        send(sock, msg, Math.random() < 0.5 ? '🪙 *HEADS!*' : '🪙 *TAILS!*');
    });

    command('dice', 'Roll a die', async (sock, msg) => {
        send(sock, msg, `🎲 You rolled a *${1 + Math.floor(Math.random() * 6)}*`);
    });

    command('rate', 'Rate a user out of 100', async (sock, msg) => {
        const target = getTargetUser(msg) || msg.key.participant || senderJid(msg);
        const score = rateScore(jidUtils.bareJid(target));
        const tier = tierLookup(content.rateComments, score);
        send(sock, msg, `📊 I rate ${mentionTag(target)} a solid *${score}/100*\n${tier.comment}`, { mentions: [target] });
    });

    command('ship', 'Ship two users (mention both)', async (sock, msg) => {
        const context = msg.message?.extendedTextMessage?.contextInfo;
        const a = context?.mentionedJid?.[0];
        const b = context?.mentionedJid?.[1] || context?.participant;
        if (!a || !b || a === b) return send(sock, msg, 'Usage: .ship @user1 @user2 (two different people)');
        const score = compatScore(jidUtils.bareJid(a), jidUtils.bareJid(b));
        const tier = tierLookup(content.shipVerdicts, score);
        send(sock, msg, `💘 *SHIP: ${mentionTag(a)} × ${mentionTag(b)}*\n${emojiBar(score)} ${score}%\n${tier.verdict}`, { mentions: [a, b] });
    });

    command('pick', 'Pick between options (.pick a | b | c)', async (sock, msg, args) => {
        const options = parsePickOptions(args.join(' '));
        if (options.length < 2) return send(sock, msg, 'Usage: .pick option 1 | option 2 | ...');
        send(sock, msg, `🤖 I choose: *${pick(options)}*`);
    });

    command('joke', 'Tell a random joke', async (sock, msg) => {
        send(sock, msg, `😂 ${pick(content.jokes)}`);
    });

    command('quote', 'Share a random quote', async (sock, msg) => {
        send(sock, msg, `💬 "${pick(content.quotes)}"`);
    });

    command('fact', 'Share a random fact', async (sock, msg) => {
        send(sock, msg, `🧠 *Did you know?* ${pick(content.facts)}`);
    });

    command('flirt', 'Drop a random flirt line', async (sock, msg) => {
        const target = getTargetUser(msg);
        if (target) {
            send(sock, msg, `${pick(content.flirt)} 😘`, { mentions: [target] });
        } else {
            send(sock, msg, `${pick(content.flirt)} 😘`);
        }
    });

    // --- TEXT/MEDIA TOYS ---
    command('fancy', 'Fancy unicode text (.fancy [style] <text> — 30+ styles)', async (sock, msg, args) => {
        const body = args.join(' ').trim();
        if (!body) {
            const styles = Object.keys(FANCY_STYLES).join(', ');
            return send(sock, msg, `Usage: .fancy [style] <text>\n\nStyles: ${styles}`);
        }
        let style;
        let text = body;
        // .fancy <style> <text> picks the style when the first arg matches
        const firstWord = body.split(/\s+/)[0].toLowerCase();
        if (FANCY_STYLES[firstWord] && body.includes(' ')) {
            style = firstWord;
            text = body.slice(body.indexOf(' ')).trim();
        } else {
            style = pick(Object.keys(FANCY_STYLES));
        }
        send(sock, msg, `✨ (${style})\n${fancyText(text, style)}`);
    }, { aliases: ['fancytext'] });

    command('zalgo', 'Glitch your text with combining marks', async (sock, msg, args) => {
        const body = args.join(' ').trim();
        if (!body) return send(sock, msg, 'Usage: .zalgo <text>');
        send(sock, msg, `🌀 H̸e̷ ̶c̷o̷m̴e̴s̷.̷\n${zalgoText(body, 3)}`);
    });

    command('textmaker', 'Generate stylised text images (.textmaker <effect> <text>)', async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        if (!args[0] || !args[1]) {
            const effects = Object.keys(TEXTMAKER_EFFECTS).join(', ');
            return send(sock, msg, `Usage: .textmaker <effect> <text>\n\nEffects: ${effects}`);
        }
        const effect = args[0].toLowerCase();
        if (!TEXTMAKER_EFFECTS[effect]) {
            return send(sock, msg, `❌ Unknown effect. Effects: ${Object.keys(TEXTMAKER_EFFECTS).join(', ')}`);
        }
        await runTextmaker(sock, from, effect, args.slice(1).join(' '));
    });
};

function senderJid(msg) {
    return msg.key.participant || msg.key.remoteJid;
}

module.exports.fancyText = fancyText;
module.exports.zalgoText = zalgoText;
module.exports.compatScore = compatScore;
module.exports.rateScore = rateScore;
module.exports.parsePickOptions = parsePickOptions;
module.exports.parseMemeText = parseMemeText;
module.exports.createTriviaQuestion = createTriviaQuestion;
module.exports.startTrivia = startTrivia;
module.exports.answerTrivia = answerTrivia;
module.exports.triviaByDifficulty = triviaByDifficulty;
module.exports.addScore = addScore;
module.exports.awardPoint = awardPoint;
module.exports.FANCY_STYLES = FANCY_STYLES;
module.exports.createGame = createGame;
module.exports.getGame = getGame;
module.exports.deleteGame = deleteGame;
module.exports.makeMove = makeMove;
module.exports.checkWinner = checkWinner;
module.exports.formatBoard = formatBoard;
module.exports.tryTttMove = async () => false; // default no-op until registered
