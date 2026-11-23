// Baileys can wrap both incoming commands and quoted media in disappearing/view-once envelopes.
function unwrapMessage(message) {
    for (let depth = 0; message && depth < 20; depth++) {
        const wrapped = message.ephemeralMessage || message.viewOnceMessage ||
            message.viewOnceMessageV2 || message.viewOnceMessageV2Extension || message.documentWithCaptionMessage;
        if (!wrapped?.message) return message;
        message = wrapped.message;
    }
    return message;
}

function getMessageText(message) {
    const content = unwrapMessage(message);
    return content?.conversation || content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption || content?.videoMessage?.caption || '';
}

module.exports = { unwrapMessage, getMessageText };
