/**
 * Comprehensive Bot Example — Showcases all bedrockflayer features.
 *
 * Usage:
 *   node examples/full_bot.js
 *
 * Requires a Bedrock Dedicated Server on localhost:19132 with online-mode=false.
 */

const bedrockflayer = require('../index')

const bot = bedrockflayer.createBot({
    host: 'localhost',
    port: 19132,
    username: 'BedrockBot',
    offline: true
})

// ═══════════════════════════════════════════
//  Connection & Spawn
// ═══════════════════════════════════════════

bot.on('connect', () => console.log('[+] Connected'))
bot.on('login', () => console.log('[+] Logged in'))

bot.on('spawn', () => {
    console.log(`[+] Spawned at ${bot.position}`)
    console.log(`[+] Game mode: ${bot.game.gameMode}, Dimension: ${bot.game.dimension}`)
    console.log(`[+] Health: ${bot.health}, Food: ${bot.food}`)
    bot.chat('Hello! I am a bedrockflayer bot.')
})

// ═══════════════════════════════════════════
//  Chat Commands
// ═══════════════════════════════════════════

bot.on('chat', (username, message) => {
    if (username === bot.username) return // ignore own messages

    const args = message.split(' ')
    const cmd = args[0].toLowerCase()

    switch (cmd) {
        // --- Info ---
        case '!pos':
            bot.chat(`Position: ${bot.position.x.toFixed(1)}, ${bot.position.y.toFixed(1)}, ${bot.position.z.toFixed(1)}`)
            break
        case '!health':
            bot.chat(`HP: ${bot.health}/20, Food: ${bot.food}/20, XP: ${bot.experience.level}`)
            break
        case '!time':
            bot.chat(bot.timeOfDayString())
            break
        case '!weather':
            bot.chat(`Rain: ${bot.isRaining()}, Thunder: ${bot.isThundering()}`)
            break
        case '!players':
            bot.chat(`Online: ${Object.keys(bot.players).join(', ')}`)
            break

        // --- Inventory ---
        case '!inventory':
            const items = bot.inventory.items()
            if (items.length === 0) {
                bot.chat('Inventory is empty')
            } else {
                bot.chat(`${items.length} items: ${items.map(i => i.toString()).join(', ')}`)
            }
            break
        case '!equip':
            if (args[1]) {
                const slot = parseInt(args[1])
                if (!isNaN(slot)) {
                    bot.setQuickBarSlot(slot)
                    bot.chat(`Switched to hotbar slot ${slot}`)
                }
            }
            break

        // --- Movement ---
        case '!come':
            const player = bot.players[username]
            if (player && player.entity) {
                bot.lookAt(player.entity.position)
                bot.setControlState('forward', true)
                bot.setControlState('sprint', true)
                setTimeout(() => {
                    bot.clearControlStates()
                    bot.chat('Arrived!')
                }, 3000)
            } else {
                bot.chat("I can't see you")
            }
            break
        case '!jump':
            bot.jump().then(() => bot.chat('Jumped!'))
            break
        case '!stop':
            bot.clearControlStates()
            bot.chat('Stopped')
            break

        // --- Combat ---
        case '!attack':
            const target = bot.nearestEntity(e => e.type !== 'player')
            if (target) {
                bot.lookAt(target.position)
                bot.attack(target)
                bot.chat(`Attacked ${target.name || target.type}!`)
            } else {
                bot.chat('No entity nearby')
            }
            break

        // --- World ---
        case '!block':
            const below = bot.blockAt(bot.position.offset(0, -1, 0))
            if (below) {
                bot.chat(`Standing on: ${below.name} (id=${below.type}, solid=${below.solid})`)
            } else {
                bot.chat('No block data loaded')
            }
            break
        case '!dig':
            const cursor = bot.blockAtCursor(5)
            if (cursor && bot.canDigBlock(cursor)) {
                bot.chat(`Digging ${cursor.name}...`)
                bot.dig(cursor)
                    .then(() => bot.chat('Done digging!'))
                    .catch(e => bot.chat(`Dig failed: ${e.message}`))
            } else {
                bot.chat('No diggable block in sight')
            }
            break

        // --- Scores ---
        case '!scores':
            const scores = bot.getSidebarScores()
            if (scores) {
                bot.chat(`Sidebar: ${scores.map(s => `${s.name}=${s.value}`).join(', ')}`)
            } else {
                bot.chat('No sidebar scoreboard')
            }
            break

        // --- Creative ---
        case '!fly':
            if (bot.game.gameMode === 1) {
                bot.creative.startFlying()
                bot.chat('Flying enabled!')
            } else {
                bot.chat('Not in creative mode')
            }
            break
        case '!land':
            bot.creative.stopFlying()
            bot.chat('Stopped flying')
            break

        case '!quit':
            bot.chat('Goodbye!')
            setTimeout(() => bot.quit(), 500)
            break

        default:
            if (cmd.startsWith('!')) {
                bot.chat('Commands: !pos !health !time !weather !players !inventory !equip <slot> !come !jump !stop !attack !block !dig !scores !fly !land !quit')
            }
    }
})

// ═══════════════════════════════════════════
//  Event Logging
// ═══════════════════════════════════════════

bot.on('death', () => {
    console.log('[!] Bot died, respawning...')
    bot.respawn()
})

bot.on('health', () => {
    if (bot.health < 5) bot.chat('I need food!')
})

bot.on('playerJoined', (player) => console.log(`[+] ${player.username} joined`))
bot.on('playerLeft', (player) => console.log(`[-] ${player.username} left`))

bot.on('rain', () => console.log(`[~] Rain: ${bot.isRaining()}`))
bot.on('entitySpawn', (e) => console.log(`[+] Entity: ${e.type} (id=${e.id})`))

bot.on('kicked', (reason) => console.log(`[!] Kicked: ${reason}`))
bot.on('end', (reason) => console.log(`[!] Disconnected: ${reason}`))
bot.on('error', (err) => console.error(`[!] Error: ${err.message}`))
