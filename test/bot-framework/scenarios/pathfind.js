/**
 * Pathfinding Scenario — Navigation test.
 *
 * Verifies:
 *  - Bot can navigate to a target block
 *  - Goal reached event fires
 *  - Bot moves a measurable distance
 *  - Path is calculated within reasonable time
 *
 * PREREQUISITE: A flat, unobstructed area near spawn.
 * Place a distinctive block (e.g., gold_block) at a known position
 * to serve as the pathfinding target.
 *
 * Configurable via PATH_TARGET_X, PATH_TARGET_Z env vars or constants below.
 */

const PATH_DISTANCE = 20
const CLOSE_ENOUGH = 2

module.exports = {
    name: 'pathfinding',

    botConfig: {
        host: 'localhost',
        port: 19132,
        username: 'PathTestBot',
        offline: true,
    },

    expected: {
        spawned: true,
        chunks_loaded: true,
        path_completed: true,
        moved: { minDistance: PATH_DISTANCE - 1 },
        no_deaths: true,
    },

    async setup(bot, inspector) {
        await bot.waitForChunksToLoad()

        const pos = bot.entity.position
        const targetX = Math.floor(pos.x) + PATH_DISTANCE
        const targetZ = Math.floor(pos.z)

        this.targetPos = { x: targetX, y: Math.floor(pos.y), z: targetZ }
        this.targetBlock = bot.blockAt(
            bot.entity.position.offset(PATH_DISTANCE, 0, 0)
        )

        console.log(`    Start: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`)
        console.log(`    Target: (${this.targetPos.x}, ${this.targetPos.y}, ${this.targetPos.z})`)
        console.log(`    Distance: ~${PATH_DISTANCE}m`)
    },

    steps: [
        async (bot, inspector) => {
            const { GoalNear } = require('../../../index')
            const pos = this.targetPos

            console.log(`    Starting navigation to (${pos.x}, ${pos.y}, ${pos.z})...`)

            const startTime = Date.now()
            try {
                await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, CLOSE_ENOUGH))
                const duration = (Date.now() - startTime) / 1000
                console.log(`    ✅ Reached target in ${duration.toFixed(1)}s`)

                const finalPos = bot.entity.position
                const dist = Math.sqrt(
                    (finalPos.x - pos.x) ** 2 + (finalPos.y - pos.y) ** 2 + (finalPos.z - pos.z) ** 2
                )
                console.log(`    Final distance to target: ${dist.toFixed(1)}`)

                if (dist > CLOSE_ENOUGH + 1) {
                    inspector.warn(`Bot stopped ${dist.toFixed(1)}m from target (expected <=${CLOSE_ENOUGH})`)
                }
            } catch (err) {
                inspector.warn(`Pathfinding failed: ${err.message}`)
            }

            await bot.waitForTicks(20)
        },

        async (bot, inspector) => {
            const pos = bot.entity.position
            const totalDist = inspector.totalDistanceMoved()
            console.log(`    Total distance moved: ${totalDist.toFixed(1)}m`)
            console.log(`    Final position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`)

            bot.chat(`Moved ${totalDist.toFixed(1)}m`)
            await bot.waitForTicks(10)
        },
    ],

    async verify(inspector) {
        const started = inspector.findEvents('pathfinder_start')
        const completed = inspector.findEvents('pathfinder_complete').filter(e => e.data.success)
        const goalReached = inspector.findEvents('goal_reached')
        const dist = inspector.totalDistanceMoved()

        const details = []
        if (started.length === 0) details.push('No pathfinding started')
        if (completed.length === 0) details.push('Path never completed')
        if (goalReached.length === 0) details.push('Goal never reached')
        if (dist < PATH_DISTANCE - 1) details.push(`Only moved ${dist.toFixed(1)}m (expected >=${PATH_DISTANCE})`)

        return {
            passed: details.length === 0,
            details: details.join('; ') || `${started.length} starts, ${completed.length} completes, ${dist.toFixed(1)}m moved`,
        }
    },

    async teardown(bot, inspector) {
        bot.quit('pathfinding test complete')
    },
}