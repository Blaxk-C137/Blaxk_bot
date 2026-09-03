const test = require('node:test');
const assert = require('node:assert');

test('config provides safe defaults with no env vars set', () => {
    const config = require('../src/config');
    assert.strictEqual(config.prefix, '.');
    assert.strictEqual(config.mode, 'public');
    assert.ok(config.sessionPath.length > 0);
});

test('getVar falls back to process.env then default', () => {
    const { getVar } = require('../src/config');
    assert.strictEqual(getVar('MODE', 'public'), 'public');
});

test('setVar overrides getVar and resets cleanly', () => {
    const { getVar, setVar, __resetOverrides } = require('../src/config');
    __resetOverrides();
    setVar('MODE', 'private');
    assert.strictEqual(getVar('MODE', 'public'), 'private');
    setVar('MODE', 'public');
    assert.strictEqual(getVar('MODE', 'public'), 'public');
});
