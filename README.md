# BlaxkBot v3

WhatsApp group-management + fun bot built on [Baileys](https://github.com/WhiskeySockets/Baileys). A merged, rebuilt version of the original **BlaxkBot** and **Blaxk_TCF** — 120+ commands, one clean architecture.

## Quick Start

```bash
npm install
node src/index.js
```

**That's it — no environment variables required to boot.** Scan the QR code printed in the terminal with WhatsApp (Settings → Linked Devices → Link a Device). The first time you log in, your number is automatically saved as the bot's owner.

> **Pairing code instead of QR?** Add `PAIRING_NUMBER=2348012345678` to `.env` (your number in international format) — the bot will print an 8-digit pairing code at startup.

## Architecture

```
src/
├── index.js        # connection layer: QR/pairing auth, reconnect, event routing
├── config.js       # dotenv + runtime var overrides (data/varOverrides.json)
├── commands.js     # command registry: registerCommand / dispatch / buildHelp
├── permissions.js  # tier engine: owner > sudo > group-admin > activator > everyone
├── jidUtils.js     # jid parsing helpers
├── activity.js     # per-group message activity tracker
└── features/       # one module per feature area, registers its own commands
    ├── core.js       # ping, help/menu, uptime, alive, session, repo
    ├── group.js      # add/kick/promote/mute/tag/warn/invite/gpp/...
    ├── moderation.js # antilink, antiword, antidelete, autoviewonce + pipeline hooks
    ├── welcome.js    # welcome/goodbye, report, topactive
    ├── sticker.js    # sticker, gif, meme, vv, emojimix, img, mp3, reverse
    ├── downloads.js  # song, ytvideo, yts, tiktok, mediafire, apk
    ├── ai.js         # gemini (9 personality modes, per-chat history)
    ├── recommend.js  # movie (TMDB), anime (Jikan), football (api-sports)
    ├── fun.js        # games, instant fun, 30+ fancy styles, tictactoe, textmaker
    ├── sims.js       # crash/bugbot/override/nuke/htmljunk payload toys
    └── system.js     # vars, scheduler, presence, pm2/git, jids, sudo, autostatus
```

Every feature module exports `register({ registry, config, Permissions })` and registers its own commands with a permission tier. No circular imports; modules load tolerantly (one failing module never blocks boot).

### Message pipeline

1. Activity tracking (groups)
2. `antilink` / `antiword` hooks (may intercept)
3. Trivia answers + tic-tac-toe moves (plain letters/digits)
4. Registry dispatch → permission check → handler

## Commands (120+)

`.menu` (or `.help`) shows a compact menu grouped by feature. Use `.help <command>` for the description, aliases and required access, for example `.help emojimix`. Both follow the current command prefix. Highlights:

| Area | Commands |
|---|---|
| **Group admin** | add, kick, kickall, promote, demote, mute/unmute, tagall, broadcast, warn (persistent), invite, revoke, gpp, admins, ginfo, setdesc, setsubject, ghostping |
| **Activator system** | activateblaxk, deactivateblaxk, adduser, removeuser |
| **Moderation** | antilink (warn/kick), antiword (ban-list + warn/kick), antidelete, autoviewonce |
| **Media** | sticker/s, gif, meme, vv (view-once unlock), emojimix, img, mp3, reverse |
| **Downloads** | song, ytvideo, yts, tiktok, mediafire, apk |
| **AI** | gemini / chatgpt / ai — with modes (savage, teacher, rizz, ...) and per-chat memory; `.gemini clear` / `.clear` resets |
| **Recommend** | movie, anime, football (12 subcommands) |
| **Fun** | truth, dare, wyr, trivia (easy/medium/hard), tictactoe/ttt, roulette, 8ball, flip, dice, rate, ship, pick, joke, quote, fact, flirt, fancy (30+ styles), zalgo, textmaker (17 effects) |
| **Sims** | crash, bugbot, override, nuke, htmljunk |
| **Owner** | mode, prefix, ownernumber, setvar/seevar, schedule/schedules/schedulecancel, wapresence, autostatus, pm2status, restart, update, block, del, setsudo/delsudo/seesudo, savejid/getjid/deljid |

`.emojimix 😅+😍` uses a bundled Emoji Kitchen lookup and downloads the sticker artwork from Google's CDN. Spaces or two adjacent emojis also work; unsupported combinations get a clear reply. See [the catalog notes](data/emojiKitchen.README.md) for sources and refresh instructions.

## Optional API keys (.env)

The bot boots and runs fully offline. These unlock extra commands:

```env
GEMINI_API_KEY=...    # .gemini AI chat      (free at aistudio.google.com)
TMDB_API_KEY=...      # .movie               (free at themoviedb.org)
FOOTBALL_API_KEY=...  # .football            (free at api-sports.io)
PAIRING_NUMBER=234... # pairing-code login instead of QR
OWNER_NUMBER=234...   # override auto-detected owner
PREFIX=.              # default command prefix
MODE=public           # public | private
```

Without a key, the affected commands reply with a friendly `🔑 needs X configured` message. Network commands (img, tiktok, textmaker, song, ...) degrade gracefully the same way.

You can also set vars at runtime as the owner: `.setvar TMDB_API_KEY xxxx` (persists in `data/varOverrides.json`, survives restarts).

## System requirements

- **Node.js ≥ 18**
- **ffmpeg** on PATH — required for video stickers, `.gif`, `.mp3`, `.reverse` (e.g. `sudo dnf install ffmpeg`)
- Everything else is bundled in `package.json`

## Production (pm2)

```bash
npm i -g pm2
pm2 start ecosystem.config.js
pm2 logs blaxkbot
pm2 save
```

`.restart` and `.update` (owner commands, in chat) exit the process; pm2 brings it back up.

## Tests

```bash
npm test
```

Unit tests cover registry/menu, permissions, config, wrapped messages, stickers and emoji mixes, moderation, fun pack, scheduler parsing, and payload generators. Some existing tests write to `data/`; run the suite in an isolated copy when using a live bot checkout.

## Project layout notes

- `data/` — all JSON stores (warns, welcome, schedules, jids, fun content, scores, var overrides)
- `session/` — Baileys multi-file auth (gitignored — **never commit this**)
- `downloads/` — runtime media cache (gitignored)
- `.env` — fully optional (gitignored)
