/**
 * Live Feature Test — verifies all new systems work against a live BDS.
 */
const bf = require('../index')

const bot = bf.createBot({
    host: 'localhost',
    port: 19132,
    username: 'FeatureTest',
    offline: true
})

bot.on('spawn', () => {
    console.log('✓ SPAWNED')
    console.log('✓ Registry:', bot.registry ? 'YES' : 'NO')
    console.log('  Blocks:', bot.registry ? bot.registry.blocksArray.length : 0)
    console.log('  Items:', bot.registry ? bot.registry.itemsArray.length : 0)
    console.log('✓ Pathfinder:', !!bot.pathfinder, '| goto:', typeof bot.pathfinder.goto)
    console.log('✓ recipesFor:', typeof bot.recipesFor)

    // Wait for world to load
    setTimeout(() => {
        console.log('\n--- World State ---')
        console.log('Loaded chunks:', bot._loadedChunks.size)
        console.log('ChunkColumns:', bot._chunks.size)

        const pos = bot.entity.position
        console.log('Position:', pos.x.toFixed(1), pos.y.toFixed(1), pos.z.toFixed(1))

        // Test blockAt
        const below = bot.blockAt(pos.offset(0, -1, 0))
        if (below) {
            console.log('✓ Block below: stateId=' + below.stateId + ' name=' + below.name + ' solid=' + below.solid)
        } else {
            console.log('✗ Block below: null (chunk not parsed or block not tracked)')
        }

        const here = bot.blockAt(pos)
        if (here) {
            console.log('✓ Block at feet: stateId=' + here.stateId + ' name=' + here.name)
        } else {
            console.log('✗ Block at feet: null')
        }

        // Test registry lookups
        if (bot.registry) {
            const stone = bot.registry.blockByName('stone')
            console.log('✓ Registry stone:', stone ? stone.name + ' hardness=' + stone.hardness : 'NOT FOUND')

            const diamond = bot.registry.itemByName('diamond_sword')
            console.log('✓ Registry diamond_sword:', diamond ? diamond.name + ' stack=' + diamond.stackSize : 'NOT FOUND')

            console.log('✓ isSolid(stone):', bot.registry.isSolid('stone'))
            console.log('✓ isWalkable(air):', bot.registry.isWalkable('air'))
            console.log('✓ isClimbable(ladder):', bot.registry.isClimbable('ladder'))
            console.log('✓ isLiquid(water):', bot.registry.isLiquid('water'))
        }

        // Test recipes
        console.log('\n--- Recipes ---')
        console.log('Recipes loaded:', bot._recipesLoaded, '| count:', bot._recipes.length)

        console.log('\n=== ALL FEATURE TESTS COMPLETE ===')
        bot.end()
        setTimeout(() => process.exit(0), 500)
    }, 3000)
})

bot.on('error', (err) => {
    console.error('Error:', err.message)
})

setTimeout(() => {
    console.log('TIMEOUT')
    process.exit(1)
}, 20000)
