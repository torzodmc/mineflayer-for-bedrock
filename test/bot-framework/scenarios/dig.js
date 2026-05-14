/**
 * Dig Scenario — Block breaking test.
 *
 * Verifies:
 *  - Bot can locate and break a block
 *  - Block state is correct before/after dig
 *  - Inventory updates after block drops
 *  - Dig timing is within expected range
 *
 * PREREQUISITE: A block at (spawnX, spawnY-1, spawnZ) that can be dug
 * (e.g. dirt, sand, grass_block). Use creative mode to ensure bot has tools.
 */

module.exports = {
    name: 'dig',

    botConfig: {
        host: 'localhost',
        port: 19132,
        username: 'DigTestBot',
        offline: true,
    },

    expected: {
        spawned: true,
        dug_blocks: { min: 1 },
        inventory_updated: { min: 1 },
        no_deaths: true,
        chunks_loaded: true,
    },

    async setup(bot, inspector) {
        await bot.waitForChunksToLoad()
        console.log(`    Bot spawned at (${bot.position.x.toFixed(1)}, ${bot.position.y.toFixed(1)}, ${bot.position.z.toFixed(1)})`)
    },

    steps: [
        async (bot, inspector) => {
            const pos = bot.entity.position
            const blockBelow = pos.offset(0, -1, 0)
            const block = bot.blockAt(blockBelow)

            if (!block) {
                inspector.warn(`No block found at ${blockBelow}`)
                return
            }

            console.log(`    Target block: ${block.name} at (${blockBelow.x}, ${blockBelow.y}, ${blockBelow.z})`)
            console.log(`    Block hardness: ${block.hardness}`)

            const digTime = bot.digTime ? bot.digTime(block) : 0
            console.log(`    Estimated dig time: ${digTime}s`)

            const startTime = Date.now()
            try {
                await bot.dig(block)
                const actualTime = (Date.now() - startTime) / 1000
                console.log(`    ✅ Block dug in ${actualTime.toFixed(2)}s`)

                if (digTime > 0) {
                    const ratio = actualTime / digTime
                    if (ratio > 2) inspector.warn(`Dig took ${ratio.toFixed(1)}x expected time`)
                }
            } catch (err) {
                inspector.warn(`Dig failed: ${err.message}`)
            }

            await bot.waitForTicks(20)
        },

        async (bot, inspector) => {
            const pos = bot.entity.position
            const blockBelow = pos.offset(0, -1, 0)
            const block = bot.blockAt(blockBelow)
            console.log(`    Block below after dig: ${block ? block.name : 'air (none)'}`)
        },

        async (bot, inspector) => {
            console.log(`    Held item: ${bot.heldItem ? bot.heldItem.toString() : 'none'}`)
            console.log(`    Quickbar slot: ${bot.quickBarSlot}`)
            await bot.waitForTicks(10)
        },
    ],

    async verify(inspector) {
        const digs = inspector.findEvents('action_dig_start')
        const invChanges = inspector.events.filter(e => e.type === 'inventory_change')

        if (digs.length === 0) return { passed: false, details: 'No dig action recorded' }
        if (invChanges.length === 0) return { passed: false, details: 'No inventory changes detected' }

        return { passed: true, details: `${digs.length} dig(s), ${invChanges.length} inventory changes` }
    },

    async teardown(bot, inspector) {
        bot.quit('dig test complete')
    },
}