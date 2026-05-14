/**
 * Follow Bot — follows a specific player around the world.
 *
 * Usage:
 *   node examples/follow_bot.js
 *
 * Then in-game, type:
 *   !follow        — bot starts following you
 *   !stop          — bot stops following
 *   !come          — bot pathfinds to your current position once
 *   !status        — bot reports its position and state
 */

const { createBot, GoalFollow, GoalNear, GoalBlock } = require('../index')

// ---- CONFIG ----
const TARGET_PLAYER = null  // Set to a player name, or null to follow whoever says "!follow"
const FOLLOW_RANGE = 2      // How close to stay (in blocks)
// ----------------

const bot = createBot({
    host: 'localhost',
    port: 19132,
    username: 'FollowBot',
    offline: true,
    skipPing: true,
    physicsEnabled: false  // Disable physics to avoid bad_packet kick
})

let following = null
let followInterval = null

bot.on('spawn', () => {
    console.log('[Bot] Spawned! Waiting for commands...')
    console.log('[Bot] Type "!follow" in-game to make me follow you.')
    bot.chat('FollowBot ready! Say !follow to make me follow you.')
})

bot.on('chat', async (username, message) => {
    console.log(`[Chat] <${username}> ${message}`)

    if (message === '!follow') {
        startFollowing(username)
    }

    if (message === '!stop') {
        stopFollowing()
        bot.chat('Stopped following.')
    }

    if (message === '!come') {
        const target = findPlayer(username)
        if (target) {
            bot.chat(`Coming to you, ${username}!`)
            try {
                await bot.pathfinder.goto(new GoalNear(
                    target.position.x,
                    target.position.y,
                    target.position.z,
                    FOLLOW_RANGE
                ))
                bot.chat('I arrived!')
            } catch (e) {
                bot.chat('Could not find a path: ' + e.message)
            }
        } else {
            bot.chat(`Can't find you, ${username}!`)
        }
    }

    if (message === '!status') {
        const pos = bot.entity ? bot.entity.position : bot.position
        const state = following ? `following ${following}` : 'idle'
        bot.chat(`Pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)} | State: ${state}`)
    }

    if (message === '!health') {
        bot.chat(`HP: ${bot.health}/20 | Food: ${bot.food}/20`)
    }
})

function findPlayer(name) {
    for (const entity of Object.values(bot.entities)) {
        if (entity.type === 'player' && entity.username === name) {
            return entity
        }
    }
    return null
}

function startFollowing(playerName) {
    following = playerName
    bot.chat(`Following ${playerName}!`)
    console.log(`[Bot] Now following: ${playerName}`)

    // Stop existing follow loop
    if (followInterval) clearInterval(followInterval)

    // Follow loop — re-pathfind every 2 seconds
    followInterval = setInterval(async () => {
        if (!following) return

        const target = findPlayer(following)
        if (!target) {
            console.log(`[Bot] Lost sight of ${following}`)
            return
        }

        const dist = bot.entity ? bot.entity.position.distanceTo(target.position) : 999

        // Only re-path if target moved far enough
        if (dist > FOLLOW_RANGE + 1) {
            try {
                await bot.pathfinder.goto(new GoalNear(
                    target.position.x,
                    target.position.y,
                    target.position.z,
                    FOLLOW_RANGE
                ))
            } catch (e) {
                // Path failed — target may have moved, will retry next tick
            }
        }
    }, 2000)
}

function stopFollowing() {
    following = null
    if (followInterval) {
        clearInterval(followInterval)
        followInterval = null
    }
    if (bot.pathfinder) bot.pathfinder.stop()
    console.log('[Bot] Stopped following.')
}

// --- Error handling ---
bot.on('error', (err) => console.error('[Error]', err.message))
bot.on('kicked', (reason) => console.log('[Kicked]', reason))
bot.on('end', (reason) => {
    console.log('[Disconnected]', reason)
    stopFollowing()
})

console.log('[FollowBot] Connecting to localhost:19132...')
