// permissions.js — merged permission engine
// Tiers: owner > sudo > (group admin | activator) > basic user > everyone
const fs = require('fs');
const path = require('path');

function normalizeNumber(num) {
    // Strip the device suffix (:5) BEFORE removing non-digits, so
    // '2348012345678:5@s.whatsapp.com' -> '2348012345678', not '...6785'.
    const bare = String(num || '').split('@')[0].split(':')[0];
    return bare.replace(/[^0-9]/g, '');
}

// Small JSON store helper — loads once, saves on change, reloads on demand
function jsonStore(storesDir, file, fallback) {
    const file_ = path.join(storesDir, file);
    const state = { data: fallback };
    function load() {
        if (fs.existsSync(file_)) {
            try { state.data = JSON.parse(fs.readFileSync(file_)); } catch { state.data = fallback; }
        }
        return state.data;
    }
    function save() {
        fs.mkdirSync(storesDir, { recursive: true });
        fs.writeFileSync(file_, JSON.stringify(state.data, null, 2));
    }
    load();
    return { load, save, get data() { return state.data; }, set data(v) { state.data = v; save(); } };
}

function createPermissions(config, storesDir) {
    const sudoStore = jsonStore(storesDir, 'sudo.json', []);
    const activatorStore = jsonStore(storesDir, 'groupActivators.json', {});
    const addedUsersStore = jsonStore(storesDir, 'addedUsers.json', []);

    function getSenderJid(msg) {
        return msg.key.participant || msg.key.remoteJid || '';
    }

    function isOwner(msg) {
        if (msg.key.fromMe) return true;
        const owner = normalizeNumber(config.ownerNumber);
        if (!owner) return false;
        const sender = normalizeNumber(getSenderJid(msg).split('@')[0]);
        return sender === owner;
    }

    function isSudo(jid) {
        sudoStore.load();
        const jids = Array.isArray(sudoStore.data) ? sudoStore.data : [];
        return jids.some(s => normalizeNumber(s.split('@')[0]) === normalizeNumber(jid.split('@')[0]));
    }

    function isOwnerOrSudo(msg) {
        return isOwner(msg) || isSudo(getSenderJid(msg));
    }

    async function isGroupAdmin(sock, groupJid, userJid) {
        try {
            const meta = await sock.groupMetadata(groupJid);
            return meta.participants.some(p =>
                normalizeNumber(p.id.split('@')[0]) === normalizeNumber(userJid.split('@')[0]) &&
                (p.admin === 'admin' || p.admin === 'superadmin')
            );
        } catch { return false; }
    }

    function isActivator(groupJid, jid) {
        activatorStore.load();
        const activator = activatorStore.data[groupJid];
        if (!activator) return false;
        return normalizeNumber(activator.split('@')[0]) === normalizeNumber(jid.split('@')[0]);
    }

    function isBasicUser(jid) {
        addedUsersStore.load();
        const jids = Array.isArray(addedUsersStore.data) ? addedUsersStore.data : [];
        return jids.some(s => normalizeNumber(s.split('@')[0]) === normalizeNumber(jid.split('@')[0]));
    }

    // Full gate used by the dispatcher: looks up the command's tier in the
    // registry and delegates to tierCheck. Sends its own denial message.
    async function canRunCommand(sock, msg, name) {
        const registry = require('./commands').current;
        const tier = registry?.commands.get(name)?.meta.permission || 'all';
        return tierCheck(sock, msg, tier);
    }

    // The real gate: tierCheck(sock, msg, tier) — tier: 'all'|'activator'|'admin'|'owner'
    async function tierCheck(sock, msg, tier) {
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = getSenderJid(msg);

        if (tier === 'owner') {
            if (isOwnerOrSudo(msg)) return true;
            await sock.sendMessage(from, { text: '❌ Owner only.' });
            return false;
        }
        if (tier === 'activator') {
            if (isOwnerOrSudo(msg) || (isGroup && isActivator(from, sender))) return true;
            await sock.sendMessage(from, { text: '❌ Only the group activator can use this command.' });
            return false;
        }
        if (tier === 'admin') {
            if (isOwnerOrSudo(msg)) return true;
            if (isGroup && (isActivator(from, sender) || await isGroupAdmin(sock, from, sender))) return true;
            await sock.sendMessage(from, { text: '❌ Only group admins or the group activator can use this command.' });
            return false;
        }
        // tier === 'all'
        if (config.mode !== 'private' || isOwnerOrSudo(msg) || (isGroup && (isActivator(from, sender) || await isGroupAdmin(sock, from, sender))) || isBasicUser(sender)) {
            return true;
        }
        await sock.sendMessage(from, { text: '🔒 Bot is in private mode.' });
        return false;
    }

    return {
        isOwner, isSudo, isOwnerOrSudo,
        isGroupAdmin, isActivator, isBasicUser,
        canRunCommand,
        tierCheck,
        stores: { sudoStore, activatorStore, addedUsersStore },
        normalizeNumber
    };
}

module.exports = createPermissions;
module.exports.createPermissions = createPermissions;
