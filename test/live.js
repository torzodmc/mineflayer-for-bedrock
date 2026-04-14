// Full integration test against live BDS
const bf = require('../index')

const bot = bf.createBot({
    host: 'localhost',
    port: 19132,
    username: 'FullTest',
    offline: true,
    hideErrors: true,
    physicsEnabled: false
})

let spawnCount = 0

process.on('uncaughtException', (e) => {
    console.log('ERR:', e.message)
    console.log(e.stack.split('\n').slice(0, 5).join('\n'))
    process.exit(1)
})

bot.on('connect', () => console.log('1. CONNECT'))

bot.on('login', () => {
    console.log('2. LOGIN')
    console.log('   Position:', bot.position.toString())
    console.log('   GameMode:', bot.game.gameMode)
    console.log('   Dimension:', bot.game.dimension)
    console.log('   Brand:', bot.game.serverBrand)
    console.log('   World:', bot.game.worldName)
})

bot.on('spawn', () => {
    spawnCount++
    console.log(`3. SPAWN #${spawnCount}`)
    console.log('   HP:', bot.health, 'Food:', bot.food, 'Sat:', bot.foodSaturation)
    console.log('   Players:', Object.keys(bot.players).join(', '))
    console.log('   Inv slots:', bot.inventory.slots.length, 'items:', bot.inventory.items().length)
    console.log('   Hotbar slot:', bot.quickBarSlot, 'held:', bot.heldItem ? bot.heldItem.name : 'empty')
    console.log('   Entity attrs:', Object.keys(bot.entity.attributes).length)
    console.log('   Time:', bot.time.timeOfDay)
    console.log('   Spawn point:', bot.spawnPoint ? bot.spawnPoint.toString() : 'none')

    if (spawnCount === 1) {
        bot.chat('Integration test passed!')

        setTimeout(() => {
            console.log('\n=== FINAL STATE ===')
            console.log('Chunks loaded:', bot._loadedChunks.size)
            console.log('Total entities:', Object.keys(bot.entities).length)
            console.log('Spawn events:', spawnCount)

            // Validate critical state
            const checks = [
                ['Position exists', !!bot.position],
                ['Entity exists', !!bot.entity],
                ['Game mode set', bot.game.gameMode !== undefined],
                ['Dimension string', typeof bot.game.dimension === 'string'],
                ['HP is number', typeof bot.health === 'number'],
                ['Players tracked', Object.keys(bot.players).length > 0],
                ['Inv initialized', bot.inventory.slots.length === 41],
                ['Attrs populated', Object.keys(bot.entity.attributes).length > 0],
                ['Time tracking', bot.time.timeOfDay > 0],
                ['Single spawn', spawnCount === 1],
                ['Chunks loaded', bot._loadedChunks.size > 0],
            ]

            let allPassed = true
            for (const [name, pass] of checks) {
                console.log(`${pass ? '✓' : '✗'} ${name}`)
                if (!pass) allPassed = false
            }

            console.log(allPassed ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED')
            bot.quit()
            process.exit(allPassed ? 0 : 1)
        }, 4000)
    }
})

setTimeout(() => {
    console.log('TIMEOUT - spawn count:', spawnCount)
    process.exit(1)
}, 20000)
