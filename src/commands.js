// commands.js — central command registry and dispatcher
let current = null; // last created registry, for permission lookups

function createRegistry() {
    const commands = new Map(); // name -> { description, handler, meta }
    current = { commands }; // let permissions.js look up tiers

    function registerCommand(name, description, handler, meta = {}) {
        const fullMeta = {
            permission: meta.permission || 'all',
            groupOnly: !!meta.groupOnly,
            aliases: meta.aliases || [],
            category: meta.category || 'other',
            canonicalName: name
        };
        commands.set(name, { description, handler, meta: fullMeta });
        for (const alias of meta.aliases || []) {
            commands.set(alias, { description, handler, meta: { ...fullMeta, isAlias: true } });
        }
    }

    // Returns true if the text was a known command (even if permission denied).
    // permissionCheck: async (sock, msg, name) => boolean — sends its own denial message.
    async function dispatch(sock, msg, text, permissionCheck) {
        const config = require('./config');
        const prefix = config.prefix;
        if (!text.trim().startsWith(prefix)) return false;
        const parts = text.trim().slice(prefix.length).split(/\s+/);
        const name = parts[0].toLowerCase();
        if (!name || !commands.has(name)) return false;
        const cmd = commands.get(name);

        if (cmd.meta.groupOnly && !msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is for groups only.' });
            return true;
        }
        if (permissionCheck && !(await permissionCheck(sock, msg, name))) {
            return true; // denied — message sent by the permission engine
        }
        try {
            await cmd.handler(sock, msg, parts.slice(1));
        } catch (err) {
            console.error(`❌ Command ${prefix}${name} failed:`, err.message);
            await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Command failed. Check the logs.' });
        }
        return true;
    }

    function buildHelp(prefix, query = '') {
        if (query) {
            const name = query.trim();
            const cmd = commands.get((name.startsWith(prefix) ? name.slice(prefix.length) : name).toLowerCase());
            if (!cmd) return `❓ Unknown command. Use ${prefix}menu to see the command list.`;
            const access = { all: 'Everyone', admin: 'Admins / group activator', activator: 'Group activator', owner: 'Owner / sudo' };
            return [
                `*${prefix}${cmd.meta.canonicalName}*`,
                '',
                cmd.description.replace(/\.([a-z][a-z0-9]*)\b/gi, (_, command) => `${prefix}${command}`),
                '',
                `Access: ${access[cmd.meta.permission] || cmd.meta.permission}`,
                ...(cmd.meta.groupOnly ? ['Chat: Groups only'] : []),
                ...(cmd.meta.aliases.length ? [`Aliases: ${cmd.meta.aliases.map(alias => `${prefix}${alias}`).join(', ')}`] : [])
            ].join('\n');
        }
        const categories = new Map([
            ['core', '🤖 Essentials'], ['group', '👥 Group management'],
            ['moderation', '🛡️ Moderation'], ['welcome', '👋 Welcome & activity'],
            ['sticker', '🎨 Stickers & media'], ['downloads', '📥 Downloads'],
            ['ai', '💬 AI chat'], ['recommend', '🎬 Movies, anime & football'],
            ['fun', '🎮 Fun & games'], ['sims', '🧪 Simulations'],
            ['system', '⚙️ Settings & tools'], ['other', '🧩 Other commands']
        ]);
        const grouped = new Map();
        let count = 0;
        for (const [name, cmd] of commands) {
            if (cmd.meta.isAlias) continue;
            if (!grouped.has(cmd.meta.category)) grouped.set(cmd.meta.category, []);
            grouped.get(cmd.meta.category).push(`${prefix}${name}`);
            count++;
        }
        const sections = [];
        for (const category of new Set([...categories.keys(), ...grouped.keys()])) {
            const list = grouped.get(category);
            if (!list?.length) continue;
            const rows = [];
            let row = '';
            for (const name of list.sort()) {
                if (row && row.length + name.length + 3 > 46) {
                    rows.push(row);
                    row = '';
                }
                row += (row ? ' · ' : '') + name;
            }
            if (row) rows.push(row);
            sections.push(`*${categories.get(category) || category}*\n${rows.join('\n')}`);
        }
        return [
            '*🤖 BLAXKBOT*',
            `${count} commands · Prefix: ${prefix}`,
            '──────────────', '',
            ...sections.flatMap(section => [section, '']),
            '──────────────',
            `Details & aliases: ${prefix}help <command>`,
            'Some commands require group, admin or owner access.'
        ].join('\n');
    }

    const registry = { commands, registerCommand, dispatch, buildHelp, withCategory };
    function withCategory(category) {
        return {
            ...registry,
            registerCommand: (name, description, handler, meta = {}) =>
                registerCommand(name, description, handler, { category, ...meta })
        };
    }
    return registry;
}

module.exports = { createRegistry, get current() { return current; } };
