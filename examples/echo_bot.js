/**
 * Echo Bot Example — bedrockflayer
 *
 * Repeats everything players say back to them.
 *
 * Usage:
 *   node examples/echo_bot.js
 */

const bedrockflayer = require('../index')

const bot = bedrockflayer.createBot({
    host: 'localhost',
    port: 19132,
    username: 'EchoBot',
    offline: true,
    skipPing: true
})

bot.on('spawn', () => {
    console.log('[EchoBot] Ready! I will repeat everything you say.')
    bot.chat('EchoBot online! Say something and I will repeat it.')
})

bot.on('chat', (username, message) => {
    // Don't echo our own messages
    if (username === bot.username) return
    bot.chat(`${username} said: ${message}`)
})

bot.on('error', (err) => {
    console.error('[Error]', err.message)
})

bot.on('end', () => {
    console.log('[EchoBot] Disconnected.')
})
