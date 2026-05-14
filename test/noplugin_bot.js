// Test with bedrockflayer createBot but NO plugins loaded
const bf = require('../index')

const bot = bf.createBot({
    host: 'localhost',
    port: 19132,
    username: 'NoPluginBot',
    offline: true,
    skipPing: true,
    loadInternalPlugins: false,  // No plugins at all
    physicsEnabled: false
})

bot.on('login', () => {
    console.log('[+] login')
})

bot.on('spawn', () => {
    console.log('[+] spawn — no plugins, just alive')
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
    console.log('[+] Survived 15 seconds! Plugins are the issue.')
    bot.end()
    setTimeout(() => process.exit(0), 500)
}, 15000)
