// ecosystem.config.js — pm2 process definition for BlaxkBot
module.exports = {
    apps: [
        {
            name: 'blaxkbot',
            script: 'src/index.js',
            instances: 1,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            watch: false,
            max_memory_restart: '512M',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
