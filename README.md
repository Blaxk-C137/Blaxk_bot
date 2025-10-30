# WhatsApp Bot

This project is a WhatsApp bot built using the Baileys library. It listens for incoming messages in both group and private chats, logs all activity, and responds to specific commands.

## Features

- Persistent session management
- Logs all incoming messages and bot activity
- Responds to the `!ping` command with bot information
- Easily extendable for additional commands in the future

## Project Structure

```
whatsapp-bot
├── src
│   ├── bot.js                # Main entry point for the WhatsApp bot
│   ├── commands
│   │   └── index.js          # Command handling functions
│   ├── session
│   │   └── sessionStore.js    # Session storage management
│   └── utils
│       └── logger.js          # Logging utilities
├── package.json               # npm configuration file
└── README.md                  # Project documentation
```

## Setup Instructions

1. Clone the repository:
   ```
   git clone <repository-url>
   cd whatsapp-bot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the bot:
   ```
   node src/bot.js
   ```

## Usage

Once the bot is running, you can interact with it by sending messages in WhatsApp. The bot will respond to the `!ping` command with its information.

## Future Enhancements

This bot is designed to be easily extendable. Additional commands and features can be implemented in the `src/commands/index.js` file.