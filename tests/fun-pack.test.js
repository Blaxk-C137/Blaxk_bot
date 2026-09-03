const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CONTENT = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/funContent.json')));

// === tictactoe (ported from TCF) ===
const {
    createGame, getGame, deleteGame, makeMove, checkWinner, formatBoard
} = require('../src/features/fun');

test('checkWinner detects all three rows', () => {
    assert.strictEqual(checkWinner([['X','X','X'],[' ',' ',' '],[' ',' ',' ']]), 'X');
    assert.strictEqual(checkWinner([[' ',' ',' '],['O','O','O'],[' ',' ',' ']]), 'O');
    assert.strictEqual(checkWinner([[' ',' ',' '],[' ',' ',' '],['X','X','X']]), 'X');
});

test('checkWinner detects all three columns', () => {
    assert.strictEqual(checkWinner([['O',' ',' '],['O',' ',' '],['O',' ',' ']]), 'O');
    assert.strictEqual(checkWinner([[' ','X',' '],[' ','X',' '],[' ','X',' ']]), 'X');
    assert.strictEqual(checkWinner([[' ',' ','O'],[' ',' ','O'],[' ',' ','O']]), 'O');
});

test('checkWinner detects both diagonals', () => {
    assert.strictEqual(checkWinner([['X',' ',' '],[' ','X',' '],[' ',' ','X']]), 'X');
    assert.strictEqual(checkWinner([[' ',' ','O'],[' ','O',' '],['O',' ',' ']]), 'O');
});

test('checkWinner returns null for no winner and ignores incomplete lines', () => {
    assert.strictEqual(checkWinner([[' ',' ',' '],[' ',' ',' '],[' ',' ',' ']]), null);
    assert.strictEqual(checkWinner([['X','O','X'],['O','X','O'],['O','X','O']]), null); // full board, no line
    assert.strictEqual(checkWinner([['X','X','O'],[' ',' ',' '],[' ',' ',' ']]), null); // two-in-a-row blocked
});

test('tictactoe makeMove enforces turns, position validity and taken cells', () => {
    const g = 'ttt-test1@g.us';
    deleteGame(g);
    createGame(g, 'px@s.whatsapp.com', 'po@s.whatsapp.com');

    assert.strictEqual(makeMove(g, 'po@s.whatsapp.com', 1).success, false, 'not O\'s turn');
    const r1 = makeMove(g, 'px@s.whatsapp.com', 5);
    assert.strictEqual(r1.success, true);
    assert.strictEqual(makeMove(g, 'px@s.whatsapp.com', 1).success, false, 'now X must wait');
    assert.strictEqual(makeMove(g, 'po@s.whatsapp.com', 0).success, false, 'position 0 invalid');
    assert.strictEqual(makeMove(g, 'po@s.whatsapp.com', 10).success, false, 'position 10 invalid');
    assert.strictEqual(makeMove(g, 'po@s.whatsapp.com', 5).success, false, 'cell taken');
});

test('tictactoe plays a full win: X wins via top row and game closes', () => {
    const g = 'ttt-test2@g.us';
    deleteGame(g);
    createGame(g, 'px@s.whatsapp.com', 'po@s.whatsapp.com');
    // X: 1, O: 4, X: 2, O: 5, X: 3 -> X top row
    makeMove(g, 'px@s.whatsapp.com', 1);
    makeMove(g, 'po@s.whatsapp.com', 4);
    makeMove(g, 'px@s.whatsapp.com', 2);
    makeMove(g, 'po@s.whatsapp.com', 5);
    const final = makeMove(g, 'px@s.whatsapp.com', 3);
    assert.strictEqual(final.success, true);
    assert.strictEqual(final.gameOver, true);
    assert.strictEqual(final.result, 'win');
    assert.strictEqual(final.game.winner, 'px@s.whatsapp.com');
    deleteGame(g);
    assert.strictEqual(getGame(g), null, 'game deleted');
});

test('tictactoe plays a draw: full board, no winner', () => {
    const g = 'ttt-test3@g.us';
    deleteGame(g);
    createGame(g, 'px@s.whatsapp.com', 'po@s.whatsapp.com');
    // X: 1,4,8; O: 2,6,9; X: 3... classic draw pattern:
    // X O X
    // X O O
    // O X X
    const moves = [[1,'px'],[2,'po'],[3,'px'],[5,'po'],[4,'px'],[6,'po'],[9,'px'],[7,'po'],[8,'px']];
    let final;
    for (const [pos, who] of moves) final = makeMove(g, `${who}@s.whatsapp.com`, pos);
    assert.strictEqual(final.result, 'draw');
    assert.strictEqual(final.gameOver, true);
});

test('formatBoard renders the board, players, turn and move hint', () => {
    const g = 'ttt-test4@g.us';
    deleteGame(g);
    createGame(g, 'px@s.whatsapp.com', 'po@s.whatsapp.com');
    makeMove(g, 'px@s.whatsapp.com', 1);
    const text = formatBoard(getGame(g));
    assert.ok(text.includes('TIC-TAC-TOE'));
    assert.ok(text.includes('px'), 'player X shown');
    assert.ok(text.includes('po'), 'player O shown');
    assert.ok(text.includes('X'));
    assert.ok(/1-9/.test(text), 'move hint');
    assert.ok(!/ 1 /.test(text.split('\n').find(l => l.includes('│  X') || l.includes('X  │')) || ''), 'cell 1 no longer shows its number');
    deleteGame(g);
});

// === trivia difficulty levels ===
test('trivia content is tagged with difficulty: easy entries for all 20 originals + medium + hard', () => {
    assert.ok(CONTENT.trivia.length >= 40, `expected >= 40 trivia entries, got ${CONTENT.trivia.length}`);
    const counts = { easy: 0, medium: 0, hard: 0 };
    for (const q of CONTENT.trivia) {
        assert.ok(['easy', 'medium', 'hard'].includes(q.difficulty), `entry missing difficulty: ${q.question}`);
        counts[q.difficulty]++;
    }
    assert.ok(counts.easy >= 20, 'at least 20 easy');
    assert.ok(counts.medium >= 10, 'at least 10 medium');
    assert.ok(counts.hard >= 10, 'at least 10 hard');
});

test('triviaByDifficulty filters entries by difficulty', () => {
    const { triviaByDifficulty } = require('../src/features/fun');
    const easy = triviaByDifficulty('easy');
    const hard = triviaByDifficulty('hard');
    assert.ok(easy.length >= 20);
    assert.ok(hard.length >= 10);
    assert.ok(easy.every(q => q.difficulty === 'easy'));
    assert.ok(hard.every(q => q.difficulty === 'hard'));
    // unknown difficulty falls back to everything
    assert.strictEqual(triviaByDifficulty('bogus').length, CONTENT.trivia.length);
});

// === merged fancy styles (TCF table + BlaxkBot offsets) ===
test('fancyText supports the merged style list (offsets + TCF table styles)', () => {
    const { fancyText, FANCY_STYLES } = require('../src/features/fun');
    const styles = Object.keys(FANCY_STYLES);
    assert.ok(styles.length >= 30, `expected >= 30 styles, got ${styles.length}`);
    // BlaxkBot originals survive
    assert.ok(styles.includes('bold') && styles.includes('italic') && styles.includes('mono'));
    assert.ok(styles.includes('fullwidth') && styles.includes('smallcaps'));
    // TCF styles present
    assert.ok(styles.includes('doublestruck'));
    assert.ok(styles.includes('fraktur'));
    assert.ok(styles.includes('script'));
    assert.ok(styles.includes('boldscript'));
    assert.ok(styles.includes('circled'));
    assert.ok(styles.includes('squared'));
    assert.ok(styles.includes('parens'));
    assert.ok(styles.includes('upsidedown'));
    // every style maps letters away from ASCII
    for (const s of styles) {
        const out = fancyText('Hello 12', s);
        assert.ok(!/[a-z]/.test(out.replace(/[^A-Za-z0-9]/g, (c) => ' ')) || out !== 'Hello 12', `style ${s} left text unchanged`);
    }
});

test('fancyText maps correctly with named TCF styles', () => {
    const { fancyText } = require('../src/features/fun');
    // double-struck a is U+1D552
    assert.ok(fancyText('a', 'doublestruck').includes('\u{1D552}'));
    // circled A is Ⓐ (U+24B6)
    assert.ok(fancyText('A', 'circled').includes('\u{1F170}') || fancyText('A', 'circled').includes('Ⓐ'));
    // fullwidth a is ａ (U+FF41)
    assert.ok(fancyText('a', 'fullwidth').includes('ａ'));
    // fraktur H is ℌ (U+210C)
    assert.ok(fancyText('H', 'fraktur').includes('ℌ'));
});

// === flirt content ===
test('flirt lines are bundled offline in funContent.json', () => {
    assert.ok(Array.isArray(CONTENT.flirt) && CONTENT.flirt.length >= 15, 'flirt lines missing');
    assert.ok(CONTENT.flirt.every(l => typeof l === 'string' && l.length > 0));
});

// === registry wiring ===
test('fun module registers all fun commands including tictactoe and flirt', () => {
    const { createRegistry } = require('../src/commands');
    const reg = createRegistry();
    require('../src/features/fun')({ registry: reg, config: { prefix: '.' }, Permissions: { canRunCommand: async () => true } });
    const names = [...reg.commands.keys()];
    for (const n of ['truth', 'dare', 'wyr', 'trivia', 'roulette', '8ball', 'flip', 'dice', 'rate', 'ship', 'pick', 'joke', 'quote', 'fact', 'fancy', 'zalgo', 'tictactoe', 'ttt', 'flirt', 'textmaker']) {
        assert.ok(names.includes(n), `missing command: ${n}`);
    }
});

// === textmaker (networked — verify routing only, no real calls) ===
test('textmaker usage error lists known effect types', () => {
    const { createRegistry } = require('../src/commands');
    const reg = createRegistry();
    require('../src/features/fun')({ registry: reg, config: { prefix: '.' }, Permissions: { canRunCommand: async () => true } });
    const sent = [];
    const sock = { sendMessage: async (jid, c) => { sent.push(c); return { key: {} }; } };
    const msg = { key: { remoteJid: 'g@g.us', participant: 'u@s.whatsapp.com', fromMe: false } };
    return reg.dispatch(sock, msg, '.textmaker', async () => true).then(() => {
        assert.ok(sent[0].text.includes('thunder'), 'usage lists thunder: ' + sent[0].text);
    });
});
