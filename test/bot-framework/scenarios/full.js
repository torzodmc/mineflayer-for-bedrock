/**
 * Full Scenario — Comprehensive end-to-end test.
 *
 * Tests connectivity, chat, movement, block interaction, inventory,
 * entity tracking, and pathfinding in a single run.
 *
 * PREREQUISITE: A Bedrock server with a flat creative world.
 * The bot should be placed in an open area.
 *
 * Set env vars:
 *   BOT_HOST, BOT_PORT, BOT_USERNAME
 * to override connection settings.
 */

module.exports = {
    name: 'full',

    botConfig: {
        host: process.env.BOT_HOST || 'localhost',
        port: parseInt(process.env.BOT_PORT || '19132', 10),
        username: process.env.BOT_USERNAME || 'FullTestBot',
        offline: true,
    },

    expected: {
        spawned: true,
        chunks_loaded: true,
        smooth_connection: true,
        moved: { minDistance: 5 },
        health_check: true,
        entities_spawned: { min: 0 },
    },

    async setup(bot, inspector) {
        await bot.waitForChunksToLoad()
        const pos = bot.entity.position
        console.log(`    Spawned at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`)
        console.log(`    Game mode: ${bot.game.gameMode}, Dimension: ${bot.game.dimension}`)
        console.log(`    Health: ${bot.health}/20 | Food: ${bot.food}/20`)
    },

    steps: [
        // Step 1: Chat and basic state
        async (bot, inspector) => {
            console.log('\n    === Phase 1: Chat & State ===')
            bot.chat('Full integration test starting...')
            console.log(`    Quickbar slot: ${bot.quickBarSlot}`)
            console.log(`    Held item: ${bot.heldItem ? bot.heldItem.toString() : 'none'}`)
            console.log(`    Entity ID: ${bot.entity.id}`)
            await bot.waitForTicks(20)
        },

        // Step 2: Look around
        async (bot, inspector) => {
            console.log('\n    === Phase 2: Movement Controls ===')
            const pos = bot.entity.position
            const lookTarget = pos.offset(5, 0, 5)

            console.log(`    Looking at (${lookTarget.x.toFixed(0)}, ${lookTarget.y.toFixed(0)}, ${lookTarget.z.toFixed(0)})`)
            if (bot.lookAt) {
                await bot.lookAt(lookTarget)
            }
            await bot.waitForTicks(10)

            console.log('    Walking forward 2 blocks...')
            bot.setControlState('forward', true)
            await bot.waitForTicks(40)
            bot.setControlState('forward', false)
            await bot.waitForTicks(10)

            const newPos = bot.entity.position
            console.log(`    Moved to (${newPos.x.toFixed(1)}, ${newPos.y.toFixed(1)}, ${newPos.z.toFixed(1)})`)
        },

        // Step 3: Jump
        async (bot, inspector) => {
            console.log('\n    === Phase 3: Jump ===')
            if (bot.jump) {
                console.log('    Jumping...')
                await bot.jump()
            }
            await bot.waitForTicks(20)
        },

        // Step 4: Look for blocks nearby
        async (bot, inspector) => {
            console.log('\n    === Phase 4: World Queries ===')
            const pos = bot.entity.position
            const blockBelow = bot.blockAt(pos.offset(0, -1, 0))
            console.log(`    Block below: ${blockBelow ? blockBelow.name : 'none'} (hardness: ${blockBelow ? blockBelow.hardness : 'N/A'})`)

            const blockAtHead = bot.blockAt(pos.offset(0, 1.6, 0))
            console.log(`    Block at head: ${blockAtHead ? blockAtHead.name : 'air'}`)

            if (bot.findBlocks) {
                const nearBlocks = bot.findBlocks({ matching: blockBelow?.name || 'stone', maxDistance: 5, count: 3 })
                console.log(`    Found ${nearBlocks.length} nearby blocks matching "${blockBelow?.name || 'stone'}"`)
            }

            await bot.waitForTicks(10)
        },

        // Step 5: Entity check
        async (bot, inspector) => {
            console.log('\n    === Phase 5: Entity Tracking ===')
            const entityIds = Object.keys(bot.entities)
            console.log(`    Entities tracked: ${entityIds.length}`)
            for (const id of entityIds.slice(0, 5)) {
                const e = bot.entities[id]
                console.log(`      - id=${e.id} type=${e.type} name=${e.name || 'unknown'}`)
            }

            if (entityIds.length > 10) {
                console.log(`      ... and ${entityIds.length - 5} more`)
            }

            console.log(`    Players online: ${Object.keys(bot.players).length}`)
            for (const name of Object.keys(bot.players).slice(0, 5)) {
                console.log(`      - ${name}`)
            }

            await bot.waitForTicks(10)
        },

        // Step 6: Creative inventory check
        async (bot, inspector) => {
            console.log('\n    === Phase 6: Inventory ===')
            if (bot.inventory) {
                const inv = bot.inventory
                const items = inv.items()
                console.log(`    Inventory slots: ${inv.slots.length}`)
                console.log(`    Items in inventory: ${items.length}`)

                if (items.length > 0) {
                    const sample = items.slice(0, 3)
                    for (const item of sample) {
                        console.log(`      - ${item.toString()}`)
                    }
                }

                if (bot.game.gameMode === 1 && bot.creative && bot.creative.setSlot) {
                    console.log('    Creative mode: testing setSlot...')
                    try {
                        bot.creative.setSlot(0, 'diamond_sword', 1)
                        await bot.waitForTicks(10)
                        console.log(`    Held item after setSlot: ${bot.heldItem ? bot.heldItem.toString() : 'none'}`)
                    } catch (err) {
                        inspector.warn(`setSlot failed: ${err.message}`)
                    }
                }
            }
            await bot.waitForTicks(10)
        },

        // Step 7: Stats dump
        async (bot, inspector) => {
            console.log('\n    === Phase 7: Stats ===')
            const eventSummary = inspector._eventSummary ? inspector._eventSummary() : {}
            console.log(`    Total events captured: ${inspector.events.length}`)
            console.log(`    Total ticks: ${inspector.tickCounter}`)
            console.log(`    Total distance: ${inspector.totalDistanceMoved().toFixed(1)}m`)
            console.log(`    Top events:`)
            const sorted = Object.entries(eventSummary)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
            for (const [type, count] of sorted) {
                console.log(`      ${type}: ${count}`)
            }
            await bot.waitForTicks(10)
        },
    ],

    async verify(inspector) {
        const spawned = !!inspector.findFirstEvent('spawn')
        const errors = inspector.errors
        const distMoved = inspector.totalDistanceMoved()
        const chatsSent = inspector.findEvents('action_chat')

        const details = []
        if (!spawned) details.push('Bot did not spawn')
        if (errors.length > 0) details.push(`${errors.length} errors`)
        if (distMoved < 0.5) details.push('Bot did not move')
        if (chatsSent.length === 0) details.push('No chat messages sent')

        return {
            passed: details.length === 0,
            details: details.join('; ') || `Spawned, moved ${distMoved.toFixed(1)}m, ${chatsSent.length} messages sent`,
        }
    },

    async teardown(bot, inspector) {
        console.log('\n    Disconnecting...')
        bot.quit('full test complete')
    },
}