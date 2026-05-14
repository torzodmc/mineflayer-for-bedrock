// Test: full createBot with all default plugins, but NO chat on spawn
const bf = require('../index')

const bot = bf.createBot({
    host: 'localhost',
    port: 19132,
    username: 'QuietBot',
    offline: true,
    skipPing: true,
    physicsEnabled: false
})

bot.on('spawn', () => {
    console.log('[+] spawn — NO chat, all plugins loaded, waiting 15 seconds...')
    // Intentionally NOT calling bot.chat() here
})

bot.on('kicked', (reason) => {
    console.log('[KICKED]', reason)
})

bot.on('end', (reason) => {
    console.log('[END]', reason)
    process.exit(0)
})

bot.on('error', (e) => console.error('[ERR]', e.message))

setTimeout(() => {
    console.log('[+] Survived 15 seconds!')
    bot.end()
    setTimeout(() => process.exit(0), 500)
}, 15000)
