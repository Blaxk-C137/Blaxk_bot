// commands.js — central command registry and dispatcher
let current = null; // last created registry, for permission lookups

function createRegistry() {
    const commands = new Map(); // name -> { description, handler, meta }
    current = { commands }; // let permissions.js look up tiers

    function registerCommand(name, description, handler, meta = {}) {
        const fullMeta = {
            permission: meta.permission || 'all',
            groupOnly: !!meta.groupOnly,
            aliases: meta.aliases || []
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

module.exports = { createRegistry, get current() { return current; } };
