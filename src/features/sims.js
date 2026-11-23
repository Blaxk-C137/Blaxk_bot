// sims.js — BlaxkBot's classic "evil" payload toys (all simulated, all in good fun)
// Bidi-override abuse: RLO/LRO + isolate chars make clients render the text
// in a scrambled order — classic "text looks reversed/corrupted" prank.
function generateOverrideAbuse() {
    const RLO = '‮'; // right-to-left override
    const LRO = '‭'; // left-to-left override
    const PDF = '‬'; // pop directional formatting (ends the override)
    const FSI = '⁦'; // first strong isolate
    const PDI = '⁩'; // pop directional isolate
    return (
        `Normal text ${RLO}reversed looking text${PDF} normal again\n` +
        `${FSI}isolated fragment${PDI} after isolate\n` +
        `${RLO}BlaxkBot${PDF} ${LRO}was${PDF} ${RLO}here${PDF}`
    );
}

// Simulated "nuke": one message stuffed with a wall of emoji + zero-width
// fillers so it renders as a massive glitchy block.
function generateNukePayload() {
    const ZWSP = '​'; // zero-width space — invisible, pads length
    let payload = '🚨 [SIMULATED NUKE] 🚨\n';
    payload += '👹'.repeat(100) + '\n';
    payload += ('💥' + ZWSP).repeat(100) + '\n';
    payload += '☠️ BLAXKBOT STRIKE ☠️\n';
    payload += 'X'.repeat(500);
    return payload;
}

// HTML junk: WhatsApp shows this as raw text, but the tag soup looks like a
// broken page dump in the chat.
function generateHtmlJunk() {
    const attrs = 'style="font-size:100px;color:red;position:fixed;top:0;left:0"';
    return (
        `<div ${attrs}>\n` +
        `  <h1>` + 'X'.repeat(6000) + `</h1>\n` +
        `  <marquee><blink>BLAXKBOT</blink></marquee>\n` +
        `  <script>alert('x'.repeat(50))</script>\n` +
        `  <img src="` + 'x'.repeat(1000) + `" onerror="infiniteLoop()">\n` +
        `</div>`
    );
}

// Crash: wall of emoji (the classic heavy-payload test)
function generateCrashPayload() {
    return '👹'.repeat(10000);
}

module.exports = function registerSims({ registry, config }) {
    registry = registry.withCategory('sims');
    const reply = (sock, msg, text) => sock.sendMessage(msg.key.remoteJid, { text });

    registry.registerCommand('crash', 'Send a simulated crash payload (wall of emoji)', async (sock, msg) => {
        try {
            await reply(sock, msg, generateCrashPayload());
        } catch (err) {
            console.error('❌ Crash error:', err);
            await reply(sock, msg, '⚠️ Failed to send crash payload.');
        }
    }, { permission: 'all' });

    registry.registerCommand('bugbot', 'Send 5 bug-test messages in a cycle', async (sock, msg) => {
        try {
            for (let i = 1; i <= 5; i++) {
                await reply(sock, msg, `🐞 BlaxkBot Bug Test #${i}`);
            }
            await reply(sock, msg, '✅ Bugbot cycle complete.');
        } catch (err) {
            console.error('❌ Bugbot error:', err);
            await reply(sock, msg, '⚠️ Bugbot failed.');
        }
    }, { permission: 'all' });

    registry.registerCommand('override', 'Send a bidi-override text scramble', async (sock, msg) => {
        try {
            await reply(sock, msg, generateOverrideAbuse());
        } catch (err) {
            console.error('❌ Override error:', err);
            await reply(sock, msg, '⚠️ Failed to send override payload.');
        }
    }, { permission: 'all' });

    registry.registerCommand('nuke', 'Send a simulated nuke payload', async (sock, msg) => {
        try {
            await reply(sock, msg, generateNukePayload());
        } catch (err) {
            console.error('❌ Nuke error:', err);
            await reply(sock, msg, '⚠️ Failed to send nuke payload.');
        }
    }, { permission: 'all' });

    registry.registerCommand('htmljunk', 'Send HTML tag-soup junk', async (sock, msg) => {
        try {
            await reply(sock, msg, generateHtmlJunk());
        } catch (err) {
            console.error('❌ Htmljunk error:', err);
            await reply(sock, msg, '⚠️ Failed to send htmljunk payload.');
        }
    }, { permission: 'all' });
};

module.exports.generateOverrideAbuse = generateOverrideAbuse;
module.exports.generateNukePayload = generateNukePayload;
module.exports.generateHtmlJunk = generateHtmlJunk;
module.exports.generateCrashPayload = generateCrashPayload;
