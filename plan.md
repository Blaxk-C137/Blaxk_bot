# BlaxkBot + Blaxk_TCF Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the two WhatsApp bots — BlaxkBot (`src/`, 51 commands, offline-first) and Blaxk_TCF (`IMPLEMENT.../`, ~90 commands, API-rich) — into one bot with a registry + feature-module architecture, working QR/pairing-code auth, and API-key-optional behavior; then delete the `IMPLEMENT...` folder.

**Architecture:** A central command registry (`Map` of name → {description, handler, meta}) fed by one module per feature domain under `src/features/`. A single connection layer (`src/index.js`) handles QR + pairing-code auth (Baileys 7), reconnection, and routes every message through: activity tracking → moderation hooks → trivia answers → command dispatch. API-dependent features (Gemini, TMDB, football, YouTube, TikTok, ephoto360) check for their API key at call time and reply with a friendly "not configured" message when missing, so the bot runs fully offline with zero keys.

**Tech Stack:** Node >= 18, `@whiskeysockets/baileys` 7.0.0-rc.9, `pino`, `qrcode-terminal`, `sharp`, `dotenv`, `axios`, `cheerio`, `@distube/ytdl-core`, `yt-search`, `@google/genai`, `wa-sticker-formatter`, `node --test` for tests, pm2 (optional, dev).

**Spec:** This document. Source bots: `src/` (BlaxkBot) and `IMPLEMENT.../` (Blaxk_TCF) — both readable until Task 16 deletes the latter.

## Global Constraints

- Node >= 18.0.0. Package manager: npm (merge drops pnpm-only config).
- Baileys pinned to `7.0.0-rc.9` (the version Blaxk_TCF uses — newer than BlaxkBot's 6.7.24; all ported code must be verified against Baileys 7 APIs).
- **No environment variable may be required to start the bot.** Every API-dependent command must check for its key at call time and send `🔑 This command needs <KEY_NAME> to be configured in .env` when missing.
- Command prefix is configurable via `PREFIX` env var, default `.`.
- Bot mode is configurable via `MODE` env var: `public` (everyone can run general commands) or `private` (owner only), default `public`.
- All persistent JSON stores live in `data/` at repo root.
- Every feature module exports a single `register({ registry, config, Permissions, stores })` function — no module may require `src/index.js` (no circular imports).
- Existing tests (`tests/fun.test.js`) must keep passing after the port.
- No external network calls in unit tests.
- Commit after every task. Never commit `.env`, `session/`, `sessions/`, `node_modules/`, or `logs/`.

## Merged Command Catalog

The merged bot must expose **every command from both bots**. Full checklist (name → permission tier):

- **Core (everyone):** `ping`, `help`/`menu`, `uptime`, `session`, `repo`, `alive`
- **Group admin (group admin or activator):** `add`, `kick`, `kickall`, `promote`, `demote`, `tag`, `tagall`, `broadcast`, `mute`, `unmute` (= lockchat/unlockchat; keep `.lockchat`/`.unlockchat` as aliases), `warn`, `resetwarn`, `warnlimit`, `invite`, `revoke`, `join`, `ginfo`, `admins`, `info`, `setdesc`, `setsubject`, `gpp`, `ghostping`
- **Activator-only:** `activateblaxk`, `deactivateblaxk`, `adduser`, `removeuser`
- **Moderation (group admin or activator):** `antilink`, `deletelinks` (alias of `antilink`), `antiword`, `report`, `topactive`
- **Media (everyone):** `vv`, `sticker`/`s`, `gif`, `img`, `image`, `meme`, `emojimix`, `mp3`, `reverse`, `autoviewonce` (owner)
- **Downloads (everyone, key/network optional):** `song`, `ytvideo`, `yts`, `tiktok`, `mediafire`, `apk`
- **AI (everyone, key optional):** `gemini`, `chatgpt` (alias of gemini), `clear`
- **Recommendations (everyone, key optional):** `movie`, `anime`, `football`
- **Fun (everyone):** `truth`, `dare`, `wyr`, `trivia` (with easy/medium/hard), `ttt`/`tictactoe`, `roulette`, `8ball`, `flip`, `dice`, `rate`, `ship`, `pick`, `joke`, `quote`, `fact`, `flirt`, `fancy`, `fancytext` (alias), `zalgo`, `textmaker` (+ its 18 effect subcommands)
- **Sims (everyone):** `crash`, `bugbot`, `override`, `nuke`, `htmljunk`
- **System (owner):** `mode`, `prefix`, `ownernumber`, `setvar`, `seevar`, `antidelete`, `wapresence`, `schedule`, `schedules`, `schedulecancel`, `autostatus`, `pm2status`, `restart`, `update`, `spam`, `block`, `del`, `getjid`, `savejid`, `setsudo`, `delsudo`, `seesudo`

## Target File Structure

```
/ (repo root)
├── package.json            # merged deps, scripts: start/dev/test/pm2
├── .env.example            # documented env vars, all optional
├── .gitignore              # + .env, data/generated?, logs/
├── ecosystem.config.js     # pm2 config (from TCF, adapted paths)
├── README.md               # rewritten for merged bot
├── plan.md                 # this file
├── data/                   # all JSON stores (moved from src/commands/*.json)
├── session/                # Baileys multi-file auth (gitignored)
├── downloads/              # runtime media cache (gitignored)
├── src/
│   ├── index.js            # entry: connection (QR/pairing), event routing
│   ├── config.js           # dotenv + defaults + getVar/setVar persistence
│   ├── commands.js         # registry: registerCommand, dispatch, help builder
│   ├── permissions.js      # merged permission engine
│   ├── jidUtils.js         # moved unchanged from BlaxkBot
│   ├── activity.js         # moved unchanged from BlaxkBot
│   └── features/
│       ├── core.js         # ping, help/menu, uptime, session, repo, alive
│       ├── group.js        # group admin suite
│       ├── moderation.js   # warn, antilink, antiword, anti-delete, autoviewonce
│       ├── welcome.js      # welcome/goodbye, report, topactive
│       ├── sticker.js      # sticker, gif, emojimix, img, meme, vv
│       ├── downloads.js    # song, ytvideo, yts, tiktok, mediafire, apk, mp3, reverse
│       ├── ai.js           # gemini, chatgpt, clear
│       ├── recommend.js    # movie, anime, football
│       ├── fun.js          # fun pack + ttt + flirt + trivia levels + textmaker
│       ├── sims.js         # crash, bugbot, override, nuke, htmljunk
│       └── system.js       # mode/prefix/setvar, scheduler, presence, pm2, jids, sudo, health server
└── tests/
    ├── fun.test.js         # moved, updated require path
    ├── config.test.js
    ├── commands.test.js
    └── permissions.test.js
```

---

### Task 0: Baseline commits + safety snapshot

**Files:** none created; git operations only.

- [ ] **Step 1: Commit all current uncommitted work**

```bash
cd /home/blaxk/Downloads/Downloads/scripts/Blaxk_bot
git add -A && git commit -m "chore: commit fun pack + session cleanup before merge"
```

- [ ] **Step 2: Tarball the IMPLEMENT... folder outside the repo** (259MB total; 15MB without node_modules/.git — snapshot everything except node_modules so the deletion in Task 16 is recoverable):

```bash
tar --exclude='IMPLEMENT.../node_modules' -czf \
  ~/Downloads/Blaxk_TCF_backup_$(date +%Y%m%d).tar.gz "IMPLEMENT..."
ls -lh ~/Downloads/Blaxk_TCF_backup_*.tar.gz
```

Expected: archive exists, ~10-20MB.

---

### Task 1: Project scaffolding + config module

**Files:**
- Modify: `package.json`
- Create: `.env.example`, `src/config.js`
- Test: `tests/config.test.js`

**Interfaces:**
- Produces: `config` object — `{ prefix, mode, ownerNumber, sessionPath, geminiApiKey, tmdbApiKey, footballApiKey, pairingNumber }`; `getVar(key)` / `setVar(key, value)` for runtime var changes.

- [ ] **Step 1: Write failing test for config defaults**

```js
// tests/config.test.js
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
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test tests/config.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/config.js`**

```js
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

const config = {
    get prefix() { return getVar('PREFIX', '.'); },
    get mode() { return getVar('MODE', 'public'); },
    get ownerNumber() { return getVar('OWNER_NUMBER', ''); },
    get pairingNumber() { return getVar('PAIRING_NUMBER', ''); },
    get geminiApiKey() { return getVar('GEMINI_API_KEY', ''); },
    get tmdbApiKey() { return getVar('TMDB_API_KEY', ''); },
    get footballApiKey() { return getVar('FOOTBALL_API_KEY', ''); },
    sessionPath: path.resolve(__dirname, '../session'),
    getVar, setVar
};
module.exports = config;
```

- [ ] **Step 4: Run test, verify PASS** — `node --test tests/config.test.js`

- [ ] **Step 5: Rewrite `package.json`**

```json
{
  "name": "blaxkbot",
  "version": "3.0.0",
  "description": "BlaxkBot — merged WhatsApp bot: group management, fun pack, AI, downloads. Runs fully offline; API keys optional.",
  "main": "src/index.js",
  "engines": { "node": ">=18.0.0" },
  "scripts": {
    "start": "node src/index.js",
    "dev": "node src/index.js",
    "test": "node --test tests/",
    "pm2": "npx pm2 start ecosystem.config.js --env production"
  },
  "dependencies": {
    "@distube/ytdl-core": "^4.16.12",
    "@google/genai": "^1.30.0",
    "@whiskeysockets/baileys": "7.0.0-rc.9",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "dotenv": "^17.2.3",
    "node-fetch": "^3.3.2",
    "pino": "^10.1.0",
    "qrcode-terminal": "^0.12.0",
    "sharp": "^0.34.5",
    "wa-sticker-formatter": "^4.4.4",
    "yt-search": "^2.13.1"
  },
  "devDependencies": { "pm2": "^5.3.0" },
  "author": "Blaxk999",
  "license": "ISC"
}
```

- [ ] **Step 6: Create `.env.example`**

```env
# All optional — the bot runs fully without this file.
# PREFIX=.            # command prefix
# MODE=public         # public | private
# OWNER_NUMBER=234xxxxxxxxxx
# PAIRING_NUMBER=     # if set, bot uses pairing code instead of QR
# GEMINI_API_KEY=     # enables .gemini
# TMDB_API_KEY=       # enables .movie
# FOOTBALL_API_KEY=   # enables .football
```

- [ ] **Step 7: Update `.gitignore`** — add lines: `.env`, `downloads/`, `logs/`, `data/varOverrides.json` (keep existing `node_modules/`, `session/`, `*.log`).

- [ ] **Step 8: Install + commit**

```bash
npm install
git add -A && git commit -m "feat: project scaffold, config module with optional env"
```

---

### Task 2: Command registry

**Files:**
- Create: `src/commands.js`
- Test: `tests/commands.test.js`

**Interfaces:**
- Produces: `registerCommand(name, description, handler, meta)` where `handler(sock, msg, args)` and `meta = { permission: 'owner'|'admin'|'activator'|'all', groupOnly: bool, aliases: string[] }`; `dispatch(sock, msg, text)` → boolean handled; `commands` Map; `buildHelp(prefix)` → string.

- [ ] **Step 1: Write failing test**

```js
// tests/commands.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createRegistry } = require('../src/commands');

test('dispatch calls the registered handler with parsed args', async () => {
    const reg = createRegistry();
    const calls = [];
    reg.registerCommand('hello', 'says hi', async (sock, msg, args) => calls.push(args), { permission: 'all' });
    const handled = await reg.dispatch({ sendMessage: async () => {} },
        { key: { remoteJid: 'x@s.whatsapp.com' } }, '.hello world foo');
    assert.strictEqual(handled, true);
    assert.deepStrictEqual(calls, [['world', 'foo']]);
});

test('dispatch returns false for unknown commands', async () => {
    const reg = createRegistry();
    const handled = await reg.dispatch({ sendMessage: async () => {} },
        { key: { remoteJid: 'x@s.whatsapp.com' } }, '.nope');
    assert.strictEqual(handled, false);
});

test('aliases dispatch to the same handler', async () => {
    const reg = createRegistry();
    let hit = 0;
    reg.registerCommand('sticker', 'sticker', async () => hit++, { permission: 'all', aliases: ['s'] });
    await reg.dispatch({ sendMessage: async () => {} }, { key: { remoteJid: 'x@s.whatsapp.com' } }, '.s');
    assert.strictEqual(hit, 1);
});
```

- [ ] **Step 2: Run, verify FAIL** — `node --test tests/commands.test.js`

- [ ] **Step 3: Implement `src/commands.js`**

```js
// commands.js — central command registry and dispatcher
function createRegistry() {
    const commands = new Map(); // name -> { description, handler, meta, ownerName }

    function registerCommand(name, description, handler, meta = {}) {
        commands.set(name, { description, handler,
            meta: { permission: meta.permission || 'all', groupOnly: !!meta.groupOnly, aliases: meta.aliases || [] } });
        for (const alias of meta.aliases || []) {
            commands.set(alias, { description, handler, meta: { ...commands.get(name).meta, isAlias: true } });
        }
    }

    // Returns true if the text was a known command (even if permission denied).
    async function dispatch(sock, msg, text, permissionCheck) {
        const config = require('./config');
        const prefix = config.prefix;
        if (!text.trim().startsWith(prefix)) return false;
        const parts = text.trim().slice(prefix.length).split(/\s+/);
        const name = parts[0].toLowerCase();
        if (!commands.has(name)) return false;
        const cmd = commands.get(name);
        if (cmd.meta.groupOnly && !msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is for groups only.' });
            return true;
        }
        if (permissionCheck && !(await permissionCheck(sock, msg, name))) return true; // denied message sent by caller
        try {
            await cmd.handler(sock, msg, parts.slice(1));
        } catch (err) {
            console.error(`❌ Command .${name} failed:`, err.message);
            await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Command failed. Check the logs.' });
        }
        return true;
    }

    function buildHelp(prefix) {
        const byPerm = { all: [], admin: [], activator: [], owner: [] };
        for (const [name, cmd] of commands) {
            if (cmd.meta.isAlias) continue;
            byPerm[cmd.meta.permission]?.push(`${prefix}${name} - ${cmd.description}`);
        }
        const section = (title, list) => `\n${title}\n${list.length ? list.join('\n') : '—'}`;
        return '*🛠 BlaxkBot Command List:*' +
            section('*Everyone:*', byPerm.all) +
            section('*Group Admin/Activator:*', byPerm.admin) +
            section('*Activator:*', byPerm.activator) +
            section('*Owner:*', byPerm.owner);
    }

    return { commands, registerCommand, dispatch, buildHelp };
}
module.exports = { createRegistry };
```

- [ ] **Step 4: Run, verify PASS** (3/3)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: command registry with aliases, permission meta, help builder"`

---

### Task 3: Permission engine (merged model)

**Files:**
- Create: `src/permissions.js`
- Test: `tests/permissions.test.js`

**Interfaces:**
- Consumes: `src/config.js` (ownerNumber, mode), `data/` stores (groupActivators.json, addedUsers.json, sudo.json).
- Produces: `createPermissions(config)` → `{ isOwner(msg), isSudo(jid), isGroupAdmin(sock, groupJid, jid), isActivator(groupJid, jid), isBasicUser(jid), canRunCommand(sock, msg, name) }` where `canRunCommand` returns boolean and sends the denial message itself.

Merged permission semantics:
- `owner`: normalized-number match against `config.ownerNumber` OR `msg.key.fromMe` OR the bot's own number (BlaxkBot's persistent owner.json behavior is replaced by OWNER_NUMBER env + sock.user).
- `sudo`: JID listed in `data/sudo.json` (from TCF `features/sudo.js` semantics) — treated as owner.
- `admin` tier: group admin OR group activator OR owner.
- `activator` tier: group activator OR owner.
- `all` tier: in `public` mode everyone; in `private` mode only owner/sudo. Basic users (addedUsers.json) always allowed for `all` tier regardless of mode.
- Normalize numbers with `String(num).replace(/[^0-9]/g, '')` (from TCF `permissions.js`) so LIDs and suffixed JIDs compare correctly.

- [ ] **Step 1: Write failing tests** — cover: owner match via normalization (`'2348012345678:5@s.whatsapp.com'` vs owner `'2348012345678'`), private mode denies non-owner, basic user allowed in private mode for `all` tier, admin tier passes for activator. Use mock sock with `groupMetadata` returning a fixed participant list; point stores at a temp dir via constructor param `storesDir` so tests don't touch real data.

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement** — port TCF `permissions.js` number-normalization and owner detection; add BlaxkBot's activator/basic-user layers; wrap tier checks in `canRunCommand`. Denial messages: private mode → `'🔒 Bot is in private mode.'`; admin tier → `'❌ Only group admins or the group activator can use this command.'`; activator tier → `'❌ Only the group activator can use this command.'`

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Commit** — `git commit -m "feat: merged permission engine (owner/sudo/admin/activator/basic + public-private mode)"`

---

### Task 4: Connection layer — QR + pairing code (src/index.js)

**Files:**
- Create: `src/index.js` (replaces `src/bot.js`; delete `src/bot.js` in this task)
- Uses: `src/config.js`

This is the heart of "make sure the QR code generation and the rest are good to go." Port TCF's `connectToWhatsApp` (IMPLEMENT.../index.js:270-520) and adapt:

- [ ] **Step 1: Write the connection module** with these exact behaviors:
  1. `useMultiFileAuthState(config.sessionPath)`; `fetchLatestBaileysVersion()`.
  2. `makeWASocket` with `browser: ['BlaxkBot', 'Chrome', '4.0.0']`, `logger: pino({ level: 'silent' })`, `printQRInTerminal: false`.
  3. On `connection.update` with `qr`: if `config.pairingNumber` is set and not yet registered, request pairing code via `sock.requestPairingCode(cleanedNumber)` **once** and print it big; otherwise print QR via `qrcode.generate(qr, { small: true })`.
  4. On `open`: log `✅ BlaxkBot connected!`.
  5. On `close`: reconnect unless `DisconnectReason.loggedOut`, with exponential backoff (port TCF's backoff: 5s doubling, cap 5min).
  6. `creds.update` → `saveCreds`.
- [ ] **Step 2: Message routing pipeline** — inside `messages.upsert`, for each message with `msg.message`, extract text (conversation/extendedText/captions) and run in order:
  1. Activity tracking: `trackMessage(chatJid, senderJid)` when group.
  2. Moderation hooks: antiword check (moderation module) → antilink check (moderation module). Each hook returns `{ intercepted: bool }`.
  3. Trivia interception: `answerTrivia(chatJid, senderJid, text)` → award/notify (ported from current `src/bot.js`).
  4. If text starts with prefix: `registry.dispatch(sock, msg, text, permissionCheck)`.
- [ ] **Step 3: Wire all feature modules** — require each `src/features/*.js` and call its `register({ registry, config, Permissions, stores })`. Stub-call them in order; modules that don't exist yet are added progressively by later tasks (this task registers only `core.js`, created in Task 5).
- [ ] **Step 4: Delete `src/bot.js`** — `git rm src/bot.js` (its logic — activity tracking, trivia intercept, link deletion — has been ported above; the old `handleCommand` dispatch is replaced by the registry).
- [ ] **Step 5: Syntax + boot check** — `node --check src/index.js`; then `timeout 10 node src/index.js` — expect QR or pairing output attempt (will fail without WhatsApp network/scan — that's fine; verify no crash and clean exit on timeout). Note: Baileys 7 renames `msg.key.remoteJid` usage is unchanged, but verify `requestPairingCode` exists on the socket (log typeof) — TCF used it against 7.0.0-rc.9 successfully.
- [ ] **Step 6: Commit** — `git commit -m "feat: connection layer with QR + pairing code, message pipeline, registry wiring"`

---

### Task 5: Core feature module

**Files:**
- Create: `src/features/core.js`
- Port from: BlaxkBot `src/commands/index.js` (`.ping` lines 795-803, `.uptime`, `getUptime`), TCF `features/alive.js`, `features/system.js` (session/repo info)

- [ ] **Step 1:** Implement `register({ registry, config })` with commands: `ping` (bot info card + random image from `src/Blaxk*.jpg` if present + latency ms — port TCF's response-time tracking), `help`/`menu` (uses `registry.buildHelp(config.prefix)`), `uptime`, `alive` (port TCF alive.js, reads `data/alive.json` for custom message), `session` (account/session info), `repo` (repo link from TCF). All `permission: 'all'`.
- [ ] **Step 2:** Manual smoke — mock sock, call each handler directly, verify reply text non-empty.
- [ ] **Step 3: Commit** — `git commit -m "feat: core commands (ping/help/uptime/alive/session/repo)"`

---

### Task 6: Group admin module

**Files:**
- Create: `src/features/group.js`
- Port from: TCF `features/group.js` (add, kick, kickall, promote, demote, tag, tagall, mute, unmute, warn, resetwarn, warnlimit, invite, revoke, join, ginfo, gpp, ghostping) + BlaxkBot `src/commands/index.js` (broadcast, setdesc, setsubject, admins, info, lockchat/unlockchat aliases, tagall)
- Stores: `data/warnCounts.json`, `data/warnLimits.json` (per-group configurable limit, default 3 — replaces BlaxkBot's hardcoded 3), `data/groupActivators.json` (keep existing file, move to `data/`)

- [ ] **Step 1:** Port TCF group.js handlers one by one, converting each `registerCommand('name', desc, handler)` to the new registry signature (handler receives `(sock, msg, args)` — replace TCF's inline `isOwnerMsg`/`isUserAdmin` checks with `meta: { permission: 'admin' }` since the registry's permissionCheck already gates them). Warn system: keep TCF's warnCounts/warnLimits persistence but keep BlaxkBot's kick-at-limit behavior.
- [ ] **Step 2:** Port BlaxkBot-only commands (broadcast with all-member mentions, setdesc, setsubject, admins, info, lockchat/unlockchat as aliases of mute/unmute, activateblaxk/deactivateblaxk with `permission: 'activator'` — activateblaxk must stay pre-permission-check like today: register it in the registry with `permission: 'all'` but handle the "already activated" guard inside the handler, and dispatch it before other traffic in index.js as today).
- [ ] **Step 3:** Smoke test each handler with mock sock + mock group metadata; verify kick/promote/demote call `groupParticipantsUpdate` with right args, tagall mentions all participants.
- [ ] **Step 4: Commit** — `git commit -m "feat: full group admin suite (merged from both bots)"`

---

### Task 7: Moderation module

**Files:**
- Create: `src/features/moderation.js`
- Port from: BlaxkBot link-deletion block (bot.js), TCF `features/antiwords.js`, TCF anti-delete/autoviewonce (search `antidelete` in TCF index.js)

- [ ] **Step 1:** Implement moderation hooks exported for the pipeline: `checkAntiword(chatJid, text)` and `checkAntilink(chatJid, text, msg, sock)` — each returns true if intercepted. Antilink: port BlaxkBot's delete + warn + kick-at-3 flow; toggle per group via `.antilink on/off` (+ `.deletelinks` alias), stored in `data/linkDeleteGroups.json`. Antiword: port TCF's word blacklist per group via `.antiword add <word> | list | clear`, stored in `data/antiwords.json` (TCF already has this file — copy it to `data/`).
- [ ] **Step 2:** Register commands `antilink`, `deletelinks`, `antiword` with `permission: 'admin'`, `groupOnly: true`.
- [ ] **Step 3:** Anti-delete: on `messages.update` with `protocolMessage.key` deletions, if enabled per `data/settings.json` (`antidelete: true`), repost deleted message text with "🗑️ deleted message" prefix. Autoviewonce: auto-open view-once messages. Register `.antidelete`/`.autoviewonce` as `permission: 'owner'` var commands using `config.setVar`.
- [ ] **Step 4:** Unit test the pure parts: word-matching regex builder from antiword list (asterisk/wildcard semantics ported from TCF), antilink URL regex `/https?:\/\/|wa\.me\//i`.
- [ ] **Step 5: Commit** — `git commit -m "feat: moderation (antilink, antiword, anti-delete, autoviewonce)"`

---

### Task 8: Welcome + activity module

**Files:**
- Create: `src/features/welcome.js`
- Port from: TCF `features/welcome.js` (enable/disable/goodbye, `database/welcome.json`), BlaxkBot report/topactive + group-participants welcome handler

- [ ] **Step 1:** `group-participants.update` listener wired in `src/index.js`: send welcome/goodbye per group settings; BlaxkBot's activator-gated welcome merges with TCF's per-group toggle — final behavior: welcome enabled per group (`.welcome on/off <custom message>`), only in groups where BlaxkBot is activated (groupActivators) OR where welcome was explicitly enabled.
- [ ] **Step 2:** Port `report` and `topactive` (BlaxkBot) using `src/activity.js` — `permission: 'admin'`, `groupOnly`.
- [ ] **Step 3:** Smoke test: fake participants update event → verify welcome text + mention.
- [ ] **Step 4: Commit** — `git commit -m "feat: welcome/goodbye + activity reports"`

---

### Task 9: Sticker & media module

**Files:**
- Create: `src/features/sticker.js`
- Port from: BlaxkBot sticker/meme/vv handlers; TCF `features/sticker.js` (createStickerBuffer via wa-sticker-formatter), `features/gif.js`, `features/emojimix.js`, `features/simage.js`, `features/images.js`

- [ ] **Step 1:** Port `sticker`/`s` (use TCF's `wa-sticker-formatter` `createStickerBuffer` as primary path with metadata/pack support; keep BlaxkBot's sharp+ffmpeg fallback for video stickers — `ffmpeg` binary required, note in README), `gif` (video → GIF via ffmpeg, TCF pattern), `meme` (BlaxkBot SVG-caption sharp pipeline), `vv` (BlaxkBot view-once unlock), `img`/`image` (TCF image search — needs network, wrap in try/catch with "network unavailable" fallback), `emojimix` (TCF emojimix API, key-optional).
- [ ] **Step 2:** Smoke: run `createStickerBuffer` against a test PNG (generate one with sharp in the test), `fancy`-style pure functions already tested.
- [ ] **Step 3: Commit** — `git commit -m "feat: sticker/media suite (sticker, gif, meme, vv, img, emojimix)"`

---

### Task 10: Downloads module

**Files:**
- Create: `src/features/downloads.js`
- Port from: TCF `features/songs.js`, `features/ytvideo.js`, `features/yts.js`, `features/mediafire.js`, `features/apk.js`, `lib/audio.js` (mp3/reverse), `lib/mediafire.js`, `lib/apk.js`

- [ ] **Step 1:** Port each command preserving TCF's flow (search via `yt-search`, download via `@distube/ytdl-core`, send as audio/video document). All commands `permission: 'all'` with per-command try/catch that reports network failures gracefully: `⚠️ Download failed: <reason>`.
- [ ] **Step 2:** `mp3` (extract audio from replied video via ffmpeg) and `reverse` (ffmpeg reverse filter for audio/video) — port from `lib/audio.js`.
- [ ] **Step 3:** Mediafire: port URL validation (`mediafire.com` regex) and direct-link scraper (axios + cheerio). APK: port `/apk/` route scraping. TikTok: port `lib/tiktok.js` (uses `api.siputzx.my.id` — external API, no key needed; wrap failures).
- [ ] **Step 4:** Smoke test with mocked axios (no real downloads in tests): verify handler flow calls sendMessage with document/audio object.
- [ ] **Step 5: Commit** — `git commit -m "feat: downloads (song, ytvideo, yts, tiktok, mediafire, apk, mp3, reverse)"`

---

### Task 11: AI module (key-optional)

**Files:**
- Create: `src/features/ai.js`
- Port from: TCF `features/gemini.js` (includes per-chat conversation history in `database/gemini.json`)

- [ ] **Step 1:** Port gemini chat with `@google/genai`; at handler start: `if (!config.geminiApiKey) return sock.sendMessage(..., { text: '🔑 .gemini needs GEMINI_API_KEY in .env' })`. Port conversation history (`data/gemini.json`) and `.clear` to reset it. Register `chatgpt` as alias.
- [ ] **Step 2:** Test with mocked genai client: no-key path returns the not-configured message; with-key path returns model text.
- [ ] **Step 3: Commit** — `git commit -m "feat: AI chat via Gemini (key-optional, per-chat history)"`

---

### Task 12: Recommendations module (key-optional)

**Files:**
- Create: `src/features/recommend.js`
- Port from: TCF `features/movies.js` (TMDB), `features/anime.js` (jikan/anilist — check source), `features/football.js` (12 subcommands)

- [ ] **Step 1:** Port movie commands with TMDB key check (`.movie trending|random|<query>`), anime (`top|seasonal|random|<query>`), football (port the 12 subcommands + `football help`).
- [ ] **Step 2:** Key-missing messages per Global Constraints pattern.
- [ ] **Step 3: Commit** — `git commit -m "feat: recommendations (movie, anime, football — key-optional)"`

---

### Task 13: Fun pack module (merged + extended)

**Files:**
- Modify: move `src/commands/fun.js` → `src/features/fun.js`, `src/commands/funContent.json` → `data/funContent.json`
- Modify: `tests/fun.test.js` (update require path to `../src/features/fun`)
- Port from: TCF `features/tictactoe.js`, `features/trivia.js` (difficulty levels), `features/flirt.js`, `features/textmaker.js` (ephoto360, 18 effects), TCF `features/fancy.js`/`fancytext.js` (30+ unicode styles — merge with BlaxkBot's 5 styles; keep all)

- [ ] **Step 1:** Move existing fun.js/funContent.json + tests; run `npm test` — all 20 must still pass unchanged.
- [ ] **Step 2:** Port TCF trivia difficulty: extend `data/funContent.json` trivia entries with `"difficulty": "easy|medium|hard"` (tag the existing 20 as easy; add 10 medium + 10 hard questions); `.trivia [easy|medium|hard]` filters. Add unit test: trivia filtered by difficulty returns only entries of that difficulty.
- [ ] **Step 3:** Port tictactoe (multi-turn game state per group in memory, board rendering with emoji, win detection — TDD the win-detection function: rows/cols/diagonals/draw).
- [ ] **Step 4:** Port flirt (bundled lines to `data/funContent.json`), merge fancy styles (TCF's style table + BlaxkBot's offset styles; `.fancy <style> <text>` picks style when first arg matches, else random), port textmaker (ephoto360 network calls, graceful failure).
- [ ] **Step 5:** Run full test suite; commit — `git commit -m "feat: merged fun pack (trivia levels, tictactoe, flirt, 30+ fancy styles, textmaker)"`

---

### Task 14: Sims + system/owner modules

**Files:**
- Create: `src/features/sims.js`, `src/features/system.js`
- Port from: BlaxkBot evil payloads (override/nuke/htmljunk/crash/bugbot), TCF scheduler/presence/autostatus/system/jids/sudo + `ecosystem.config.js`

- [ ] **Step 1:** `sims.js` — port the 5 payload generators + handlers as-is (`permission: 'all'`).
- [ ] **Step 2:** `system.js` — port with `permission: 'owner'`: `mode`/`prefix`/`ownernumber`/`setvar`/`seevar` (all via `config.setVar`), `schedule`/`schedules`/`schedulecancel` (port TCF scheduler with `data/schedules.json`, `setInterval`-based), `wapresence` (typing/recording/online presence), `autostatus` (port TCF autostatus), `pm2status`/`restart`/`update` (exec pm2/git commands via child_process, guarded), `spam`, `block`, `del`, `getjid`/`savejid` (port TCF jids.js), `setsudo`/`delsudo`/`seesudo` (port TCF sudo.js, `data/sudo.json`).
- [ ] **Step 3:** Port `ecosystem.config.js` to repo root with `script: 'src/index.js'`.
- [ ] **Step 4:** Unit test: var commands flip config (setVar('MODE','private') then config.mode === 'private').
- [ ] **Step 5: Commit** — `git commit -m "feat: sims + system/owner suite (vars, scheduler, presence, pm2, sudo)"`

---

### Task 15: Final integration + README + full verification

**Files:**
- Modify: `README.md`, `src/index.js` (register every feature module)
- Delete: `src/commands/` (old index.js — all logic ported), `src/package.json` remnants if any

- [ ] **Step 1:** Register every feature module in `src/index.js` (core, group, moderation, welcome, sticker, downloads, ai, recommend, fun, sims, system).
- [ ] **Step 2:** Delete `src/commands/index.js` and `src/commands/fun.js` (moved) — `git rm`.
- [ ] **Step 3:** **Command catalog audit** — run this and diff against the Merged Command Catalog above; every listed command must appear:

```bash
node -e "const {createRegistry}=require('./src/commands');const config=require('./src/config');
const Permissions=require('./src/permissions')(config);
const r=createRegistry();
['./src/features/core','./src/features/group','./src/features/moderation','./src/features/welcome','./src/features/sticker','./src/features/downloads','./src/features/ai','./src/features/recommend','./src/features/fun','./src/features/sims','./src/features/system']
.forEach(m=>require(m)({ registry: r, config, Permissions, stores: {} }));
console.log([...r.commands.keys()].sort().join(' '))" 
```

- [ ] **Step 4:** Full verification: `npm test` (all pass), `node --check` on every `src/**/*.js`, `node src/index.js` boots to QR without crash (timeout kill after 15s), `.help` renders via buildHelp.
- [ ] **Step 5:** Rewrite `README.md`: features, setup (npm install, .env optional, node src/index.js), QR + pairing instructions, API keys table, pm2 usage, ffmpeg note.
- [ ] **Step 6: Commit** — `git commit -m "feat: complete merged BlaxkBot v3 — all features wired, README, verified"`

---

### Task 16: Delete the IMPLEMENT... folder

**Files:**
- Delete: `IMPLEMENT.../` (entire folder)

- [ ] **Step 1:** Confirm Task 15 verification passed and the backup tarball from Task 0 exists: `ls -lh ~/Downloads/Blaxk_TCF_backup_*.tar.gz`
- [ ] **Step 2:** Delete:

```bash
rm -rf "/home/blaxk/Downloads/Downloads/scripts/Blaxk_bot/IMPLEMENT..."
```

- [ ] **Step 3:** Verify repo still boots: `node --check src/index.js && npm test`
- [ ] **Step 4: Commit** — `git add -A && git commit -m "chore: remove IMPLEMENT... folder (merged into BlaxkBot; backup tarballed)"`

---

## Risk Notes

- **Baileys 6 → 7 upgrade**: `requestPairingCode`, `downloadContentFromMessage`, `groupParticipantsUpdate` are verified present in 7.0.0-rc.9 (TCF uses them). `downloadMediaMessage` (new in 7) replaces manual stream loops — prefer it in sticker/media port.
- **Both bots' session folders are incompatible** — the merged bot starts with a fresh QR scan (BlaxkBot's `session/` keys are already deleted from git; TCF's `sessions/` stays in the tarball).
- **Deleting `src/bot.js` and `src/commands/index.js`** happens only after their logic is confirmed ported (Tasks 4-14); if a port is missed, the Task 15 catalog audit catches it.
- **Trivia interception for plain letters** must run before antiword checks could false-positive on single letters (it does — pipeline order: activity → moderation → trivia → commands; single letters don't match antiword regexes).
