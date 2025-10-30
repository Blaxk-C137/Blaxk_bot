// jidUtils.js

/**
 * Remove device suffix like :23 or :25 from a JID
 * Example: "2348117301169:25@s.whatsapp.net" => "2348117301169@s.whatsapp.net"
 */
function bareJid(jid) {
    return jid?.split(':')[0] || jid;
}

/**
 * Check if a JID is a group chat
 */
function isGroupJid(jid) {
    return jid?.endsWith('@g.us');
}

/**
 * Check if a JID is a private (one-on-one) chat
 */
function isPrivateJid(jid) {
    return jid?.endsWith('@s.whatsapp.net');
}

/**
 * Check if the given JID is the bot's own JID
 */
function isBotJid(jid, botId) {
    return bareJid(jid) === bareJid(botId);
}

/**
 * Get the sender of a message (whether in group or private chat)
 */
function getSenderJid(msg, sock) {
    if (msg.key.participant) return msg.key.participant; // group message
    if (msg.key.fromMe) return sock.user?.id;            // self message
    return msg.key.remoteJid;                            // private chat
}

/**
 * Get the chat JID (group or private) where the message was sent
 */
function getChatJid(msg) {
    return msg.key.remoteJid;
}

module.exports = {
    bareJid,
    isGroupJid,
    isPrivateJid,
    isBotJid,
    getSenderJid,
    getChatJid
};
