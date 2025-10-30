const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, 'bot.log');

function logMessage(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${message}\n`;
    console.log(logEntry.trim());
    fs.appendFileSync(logFilePath, logEntry);
}

function logError(error) {
    const timestamp = new Date().toISOString();
    const errorEntry = `${timestamp} - ERROR: ${error}\n`;
    console.error(errorEntry.trim());
    fs.appendFileSync(logFilePath, errorEntry);
}

module.exports = {
    logMessage,
    logError,
};