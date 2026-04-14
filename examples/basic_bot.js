/**
 * Basic Bot Example — bedrockflayer
 *
 * Connects to a local Bedrock server, logs all chat,
 * and sends "Hello!" when spawned.
 *
 * Usage:
 *   node examples/basic_bot.js
 *
 * Prerequisites:
 *   - A Bedrock Dedicated Server running on localhost:19132
 *   - online-mode=false in server.properties (for offline mode)
 */

const bedrockflayer = require('../index')

const bot = bedrockflayer.createBot({
    host: 'localhost',
    port: 19132,
    username: 'BedrockBot',
    offline: true,
    skipPing: true
})

// --- Lifecycle events ---

bot.on('connect', () => {
    console.log('[Bot] Connected to server!')
})

bot.on('login', () => {
    console.log('[Bot] Login successful!')
    console.log(`[Bot] Spawn position: ${bot.position}`)
    console.log(`[Bot] Game mode: ${bot.game.gameMode}`)
    console.log(`[Bot] Dimension: ${bot.game.dimension}`)
})

bot.on('spawn', () => {
    console.log('[Bot] Spawned in the world!')
    bot.chat('Hello! I am a bedrockflayer bot!')
})

// --- Chat events ---

bot.on('chat', (username, message) => {
    console.log(`[Chat] <${username}> ${message}`)

    // Echo anything said to us
    if (message === 'hello') {
        bot.chat(`Hey there, ${username}!`)
    }

    // Respond to commands
    if (message === '!health') {
        bot.chat(`HP: ${bot.health}/20 | Food: ${bot.food}/20 | XP Level: ${bot.experience.level}`)
    }

    if (message === '!pos') {
        const pos = bot.entity ? bot.entity.position : bot.position
        if (pos) {
            bot.chat(`Position: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`)
        } else {
            bot.chat('Position unknown!')
        }
    }

    if (message === '!players') {
        const names = Object.keys(bot.players)
        bot.chat(`Online (${names.length}): ${names.join(', ')}`)
    }

    if (message === '!quit') {
        bot.chat('Goodbye!')
        setTimeout(() => bot.quit(), 500)
    }
})

bot.on('whisper', (username, message) => {
    console.log(`[Whisper] ${username} -> ${message}`)
})

bot.on('message', (jsonMsg, type) => {
    if (type !== 'chat' && type !== 'whisper') {
        console.log(`[System] [${type}] ${jsonMsg.toString()}`)
    }
})

// --- State events ---

bot.on('health', () => {
    console.log(`[Health] HP: ${bot.health} | Food: ${bot.food} | Saturation: ${bot.foodSaturation}`)
})

bot.on('death', () => {
    console.log('[Bot] I died!')
    // Auto-respawn after 2 seconds
    setTimeout(() => bot.respawn(), 2000)
})

bot.on('playerJoined', (player) => {
    console.log(`[Players] ${player.username} joined the game`)
})

bot.on('playerLeft', (player) => {
    console.log(`[Players] ${player.username} left the game`)
})

// --- Error handling ---

bot.on('error', (err) => {
    console.error('[Error]', err.message)
})

bot.on('kicked', (reason) => {
    console.log(`[Kicked] ${reason}`)
})

bot.on('end', (reason) => {
    console.log(`[Disconnected] ${reason}`)
})

console.log(`[bedrockflayer v${bedrockflayer.version}] Connecting to localhost:19132...`)
