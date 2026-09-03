// activity.js — per-group message-count tracking for .report / .topactive
const fs = require('fs');
const path = require('path');

const activityFile = path.resolve(__dirname, 'activityCounts.json');
let activityCounts = {};

function saveActivityCounts() {
    fs.writeFileSync(activityFile, JSON.stringify(activityCounts, null, 2));
}

function loadActivityCounts() {
    if (fs.existsSync(activityFile)) {
        try {
            activityCounts = JSON.parse(fs.readFileSync(activityFile));
        } catch (e) {
            activityCounts = {};
        }
    }
}

function trackMessage(groupJid, senderJid) {
    if (!activityCounts[groupJid]) activityCounts[groupJid] = {};
    if (!activityCounts[groupJid][senderJid]) activityCounts[groupJid][senderJid] = 0;
    activityCounts[groupJid][senderJid]++;
    saveActivityCounts();
}

loadActivityCounts();

module.exports = {
    activityCounts,
    saveActivityCounts,
    loadActivityCounts,
    trackMessage
};
