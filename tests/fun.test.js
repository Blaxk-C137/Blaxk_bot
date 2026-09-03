const test = require('node:test');
const assert = require('node:assert');
const {
    fancyText,
    zalgoText,
    compatScore,
    rateScore,
    parsePickOptions,
    parseMemeText,
    createTriviaQuestion,
    startTrivia,
    answerTrivia,
    addScore
} = require('../src/commands/fun');

// === fancyText ===
test('fancyText maps letters into the bold unicode range and keeps non-letters', () => {
    const out = fancyText('Hello World! 123', 'bold');
    assert.ok(out.includes('\u{1D5DB}')); // 𝗛 (sans-serif bold H: 0x1D5D4 + 7)
    assert.ok(out.includes('\u{1D5EA}')); // 𝗪 (sans-serif bold W: 0x1D5D4 + 22)
    assert.ok(out.includes('!'));
    assert.ok(out.includes(' '));
    assert.ok(out.includes('\u{1D7EF}')); // 𝟯 — sans-serif bold 3 (0x1D7EC + 3)
    assert.ok(!/[a-zA-Z]/.test(out)); // no plain ASCII letters left
});

test('fancyText is deterministic for the same style', () => {
    assert.strictEqual(fancyText('BlaxkBot', 'bold'), fancyText('BlaxkBot', 'bold'));
});

test('fancyText passes through characters the style has no mapping for', () => {
    const out = fancyText('héllo-ñ', 'bold');
    assert.ok(out.includes('é'));
    assert.ok(out.includes('ñ'));
    assert.ok(out.includes('-'));
});

// === zalgoText ===
test('zalgoText preserves the original characters when combining marks are stripped', () => {
    const out = zalgoText('abc', 5, () => 0.5);
    const stripped = out.replace(/[̀-ͯ]/g, '');
    assert.strictEqual(stripped, 'abc');
});

test('zalgoText adds at least one combining mark per character at intensity 1', () => {
    const out = zalgoText('ab', 1, () => 0.5);
    const marks = out.match(/[̀-ͯ]/g) || [];
    assert.ok(marks.length >= 2);
});

test('zalgoText is deterministic for the same rng', () => {
    const a = zalgoText('same text', 3, () => 0.42);
    const b = zalgoText('same text', 3, () => 0.42);
    assert.strictEqual(a, b);
});

// === compatScore (ship) ===
test('compatScore returns the same value for the same pair of jids', () => {
    assert.strictEqual(
        compatScore('123@s.whatsapp.com', '456@s.whatsapp.com'),
        compatScore('123@s.whatsapp.com', '456@s.whatsapp.com')
    );
});

test('compatScore is symmetric regardless of argument order', () => {
    assert.strictEqual(
        compatScore('123@s.whatsapp.com', '456@s.whatsapp.com'),
        compatScore('456@s.whatsapp.com', '123@s.whatsapp.com')
    );
});

test('compatScore stays within 0-100', () => {
    for (let i = 1; i <= 50; i++) {
        const s = compatScore(`${i}@s.whatsapp.com`, `${i * 7}@s.whatsapp.com`);
        assert.ok(s >= 0 && s <= 100, `score ${s} out of range`);
    }
});

// === rateScore ===
test('rateScore is deterministic for the same jid and stays within 0-100', () => {
    const first = rateScore('123@s.whatsapp.com');
    assert.strictEqual(first, rateScore('123@s.whatsapp.com'));
    assert.ok(first >= 0 && first <= 100);
});

test('rateScore gives different jids at least some spread', () => {
    const scores = new Set();
    for (let i = 1; i <= 20; i++) scores.add(rateScore(`${i}@s.whatsapp.com`));
    assert.ok(scores.size > 1, 'rateScore should not return a constant');
});

// === parsePickOptions ===
test('parsePickOptions splits on pipes, trims and drops empties', () => {
    assert.deepStrictEqual(parsePickOptions(' pizza | burgers |'), ['pizza', 'burgers']);
});

test('parsePickOptions returns an empty array for no input', () => {
    assert.deepStrictEqual(parsePickOptions('   '), []);
});

// === parseMemeText ===
test('parseMemeText returns top and bottom text', () => {
    assert.deepStrictEqual(parseMemeText('WHEN THE BOT | WORKS FIRST TRY'), {
        top: 'WHEN THE BOT',
        bottom: 'WORKS FIRST TRY'
    });
});

test('parseMemeText uses empty bottom when only top is given', () => {
    assert.deepStrictEqual(parseMemeText('just top text'), { top: 'just top text', bottom: '' });
});

// === trivia game state ===
test('createTriviaQuestion formats a question with options and tracks the answer index', () => {
    const q = createTriviaQuestion({
        question: 'Capital of France?',
        options: ['London', 'Paris', 'Berlin', 'Madrid'],
        answerIndex: 1
    });
    assert.ok(q.text.includes('Capital of France?'));
    assert.ok(q.text.includes('A) London'));
    assert.ok(q.text.includes('B) Paris'));
    assert.strictEqual(q.answerIndex, 1);
});

test('answerTrivia marks the first correct answer and closes the game', () => {
    const group = 'test-group@g.us';
    startTrivia(group, { question: 'Q?', options: ['a', 'b', 'c', 'd'], answerIndex: 2 });

    assert.strictEqual(answerTrivia(group, 'someone@s.whatsapp.com', 'c'), 'correct');
    assert.strictEqual(answerTrivia(group, 'other@s.whatsapp.com', 'c'), null, 'game closed after a correct answer');
});

test('answerTrivia returns wrong for an incorrect letter and null for non-answers', () => {
    const group = 'test-group2@g.us';
    startTrivia(group, { question: 'Q?', options: ['a', 'b', 'c', 'd'], answerIndex: 0 });

    assert.strictEqual(answerTrivia(group, 'x@s.whatsapp.com', 'b'), 'wrong');
    assert.strictEqual(answerTrivia(group, 'x@s.whatsapp.com', 'hello there'), null, 'normal chat is not an answer');
    assert.strictEqual(answerTrivia(group, 'x@s.whatsapp.com', '2'), 'wrong', 'numeric answers map to options');
});

test('answerTrivia accepts A-D letters and 1-4 digits case-insensitively', () => {
    const group = 'test-group3@g.us';
    startTrivia(group, { question: 'Q?', options: ['a', 'b', 'c', 'd'], answerIndex: 3 });

    assert.strictEqual(answerTrivia(group, 'x@s.whatsapp.com', ' D '), 'correct');
});

// === addScore (score bookkeeping) ===
test('addScore increments points per group and user', () => {
    const scores = {};
    addScore(scores, 'g1@g.us', 'u1@s.whatsapp.com');
    addScore(scores, 'g1@g.us', 'u1@s.whatsapp.com');
    addScore(scores, 'g1@g.us', 'u2@s.whatsapp.com');
    addScore(scores, 'g2@g.us', 'u1@s.whatsapp.com');
    assert.strictEqual(scores['g1@g.us']['u1@s.whatsapp.com'], 2);
    assert.strictEqual(scores['g1@g.us']['u2@s.whatsapp.com'], 1);
    assert.strictEqual(scores['g2@g.us']['u1@s.whatsapp.com'], 1);
});
