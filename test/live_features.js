// Verify block name resolution + item names + ecosystem plugins
const bf = require('../index')

console.log('=== Exports Check ===')
console.log('autoEat:', typeof bf.autoEat)
console.log('collectBlock:', typeof bf.collectBlock)
console.log('guard:', typeof bf.guard)

const bot = bf.createBot({
    host: 'localhost',
    port: 19132,
    username: 'HardenTest',
    offline: true,
    skipPing: true
})

// Load ecosystem plugins
bot.loadPlugin(bf.autoEat)
bot.loadPlugin(bf.collectBlock)
bot.loadPlugin(bf.guard)

bot.on('spawn', () => {
    console.log('\n=== Spawn ===')
    console.log('autoEat:', !!bot.autoEat, '| enabled:', bot.autoEat.enabled)
    console.log('collectBlock:', !!bot.collectBlock)
    console.log('guard:', !!bot.guard, '| enabled:', bot.guard.enabled)
    console.log('Registry palette cache size:', bot.registry._blockStateCache.size)

    if (bot.registry._itemStateCache) {
        console.log('Registry item state cache size:', bot.registry._itemStateCache.size)
    }

    // Wait for world to load
    setTimeout(() => {
        console.log('\n=== Block Name Resolution ===')
        const pos = bot.entity.position
        console.log('Position:', pos.x.toFixed(1), pos.y.toFixed(1), pos.z.toFixed(1))

        // Test blocks at various positions
        for (let dy = -3; dy <= 1; dy++) {
            const block = bot.blockAt(pos.offset(0, dy, 0))
            if (block) {
                console.log(`  Y${dy}: stateId=${block.stateId} name=${block.name} solid=${block.solid} hardness=${block.hardness}`)
            } else {
                console.log(`  Y${dy}: null`)
            }
        }

        // Check inventory items have names
        console.log('\n=== Inventory Items ===')
        const items = bot.inventory.items()
        if (items.length > 0) {
            for (const item of items.slice(0, 5)) {
                console.log(`  ${item.name} x${item.count} (id=${item.type})`)
            }
        } else {
            console.log('  (empty inventory)')
        }

        console.log('\n=== ALL TESTS COMPLETE ===')
        bot.end()
        setTimeout(() => process.exit(0), 500)
    }, 3000)
})

bot.on('error', (err) => {
    console.error('Error:', err.message)
})

setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 25000)
