// Test remaining plugins — the first 6 are safe
const bf = require('../index')

const bot = bf.createBot({
    host: 'localhost',
    port: 19132,
    username: 'PluginTest2',
    offline: true,
    skipPing: true,
    loadInternalPlugins: false,
    physicsEnabled: false
})

// Safe plugins first
const safePlugins = [
    require('../lib/plugins/chat'),
    require('../lib/plugins/health'),
    require('../lib/plugins/entities'),
    require('../lib/plugins/world'),
    require('../lib/plugins/controls'),
    require('../lib/plugins/inventory'),
]

// Suspect plugins — test these
const suspectPlugins = {
    windows: require('../lib/plugins/windows'),
    digging: require('../lib/plugins/digging'),
    placing: require('../lib/plugins/placing'),
    combat: require('../lib/plugins/combat'),
    crafting: require('../lib/plugins/crafting'),
    vehicles: require('../lib/plugins/vehicles'),
    sleep: require('../lib/plugins/sleep'),
    time: require('../lib/plugins/time'),
    scoreboard: require('../lib/plugins/scoreboard'),
    sound: require('../lib/plugins/sound'),
    creative: require('../lib/plugins/creative'),
    resource_pack: require('../lib/plugins/resource_pack'),
    pathfinder: require('../lib/plugins/pathfinder'),
    recipes: require('../lib/plugins/recipes'),
}

bot.on('login', () => {
    // Load safe first
    for (const p of safePlugins) bot.loadPlugin(p)
    console.log('[+] Safe plugins loaded')

    // Load suspects
    for (const [name, plugin] of Object.entries(suspectPlugins)) {
        try {
            bot.loadPlugin(plugin)
            console.log(`  loaded: ${name}`)
        } catch (e) {
            console.log(`  FAILED: ${name} — ${e.message}`)
        }
    }
})

bot.on('spawn', () => {
    console.log('[+] spawn — waiting 10 seconds with ALL plugins...')
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
    console.log('[+] Survived 10 seconds with ALL plugins!')
    bot.end()
    setTimeout(() => process.exit(0), 500)
}, 10000)
