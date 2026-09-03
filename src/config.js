// config.js — all settings optional; bot must boot with zero env vars
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Runtime overrides set via .setvar persist here (survives restart)
const OVERRIDES_FILE = path.resolve(__dirname, '../data/varOverrides.json');
let overrides = {};
if (fs.existsSync(OVERRIDES_FILE)) {
    try { overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE)); } catch {}
}
function saveOverrides() {
    fs.mkdirSync(path.dirname(OVERRIDES_FILE), { recursive: true });
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2));
}

function getVar(key, fallback = undefined) {
    if (overrides[key] !== undefined) return overrides[key];
    if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key];
    return fallback;
}
function setVar(key, value) {
    overrides[key] = value;
    saveOverrides();
}
// Test hook — wipes runtime overrides (does not touch process.env)
function __resetOverrides() {
    overrides = {};
    saveOverrides();
}

const config = {
    get prefix() { return getVar('PREFIX', '.'); },
    get mode() { return getVar('MODE', 'public'); },
    get ownerNumber() { return getVar('OWNER_NUMBER', ''); },
    get pairingNumber() { return getVar('PAIRING_NUMBER', ''); },
    get geminiApiKey() { return getVar('GEMINI_API_KEY', ''); },
    get tmdbApiKey() { return getVar('TMDB_API_KEY', ''); },
    get footballApiKey() { return getVar('FOOTBALL_API_KEY', ''); },
    sessionPath: path.resolve(__dirname, '../session'),
    getVar, setVar, __resetOverrides
};
module.exports = config;
