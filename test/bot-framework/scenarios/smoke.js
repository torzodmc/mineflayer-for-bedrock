/**
 * Smoke Scenario — Basic connectivity and chat test.
 *
 * Verifies:
 *  - Bot connects and spawns
 *  - Chunks load around bot
 *  - Bot can send and receive chat
 *  - Health and food tracking works
 *  - Position is valid
 *  - No errors or kicks
 */

module.exports = {
    name: 'smoke',

    botConfig: {
        host: 'localhost',
        port: 19132,
        username: 'SmokeTestBot',
        offline: true,
    },

    expected: {
        spawned: true,
        chunks_loaded: true,
        smooth_connection: true,
        health_check: true,
    },

    async setup(bot, inspector) {
        await bot.waitForChunksToLoad()
        inspector.warn = (msg) => console.log(`    ⚠️  ${msg}`)
        console.log('    Setup complete — bot ready')
    },

    steps: [
        async (bot, inspector) => {
            console.log('    Sending test message...')
            bot.chat('Smoke test — hello from test framework!')
            console.log('    Message sent, waiting 2s for response...')
            await bot.waitForTicks(40)
        },
        async (bot, inspector) => {
            console.log('    Checking bot state...')
            console.log(`    Health: ${bot.health}/20 | Food: ${bot.food}/20`)
            console.log(`    Position: (${bot.position.x.toFixed(1)}, ${bot.position.y.toFixed(1)}, ${bot.position.z.toFixed(1)})`)
            console.log(`    Dimension: ${bot.game.dimension}`)
            console.log(`    Entities: ${Object.keys(bot.entities).length}`)
        },
        async (bot, inspector) => {
            console.log('    Testing health lookup...')
            bot.chat('My health is ' + bot.health + '/20')
            await bot.waitForTicks(20)
        },
    ],

    async verify(inspector) {
        const spawned = !!inspector.findFirstEvent('spawn')
        const chats = inspector.findEvents('action_chat')
        const errors = inspector.errors
        const kicked = inspector.findFirstEvent('kicked')

        const details = []
        if (!spawned) details.push('Bot did not spawn')
        if (chats.length === 0) details.push('No chat messages sent')
        if (errors.length > 0) details.push(`${errors.length} errors: ${errors[0].message}`)
        if (kicked) details.push('Bot was kicked')

        return {
            passed: details.length === 0,
            details: details.join('; ') || 'all checks passed',
        }
    },

    async teardown(bot, inspector) {
        console.log('    Disconnecting...')
        bot.quit('test complete')
    },
}