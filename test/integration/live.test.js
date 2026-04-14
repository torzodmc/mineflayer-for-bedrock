/**
 * Integration tests for bedrockflayer against a live Bedrock Dedicated Server.
 *
 * Prerequisites:
 *   - BDS running on localhost:19132 with online-mode=false
 *
 * Run:
 *   npx vitest run test/integration/live.test.js --reporter=verbose
 */

import { describe, it, expect, afterAll } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const bedrockflayer = require('../../index')

const HOST = 'localhost'
const PORT = 19132
const USERNAME = 'IntegrationBot'

// Helper: create a bot and wait for spawn
function connectBot(name = USERNAME) {
    return new Promise((resolve, reject) => {
        const bot = bedrockflayer.createBot({
            host: HOST,
            port: PORT,
            username: name,
            offline: true,
            physicsEnabled: false
        })

        const timeout = setTimeout(() => {
            try { bot.quit() } catch { }
            reject(new Error('Bot failed to spawn within 15 seconds'))
        }, 15000)

        bot.once('spawn', () => {
            clearTimeout(timeout)
            resolve(bot)
        })

        bot.once('error', (err) => {
            clearTimeout(timeout)
            reject(err)
        })

        bot.once('kicked', (reason) => {
            clearTimeout(timeout)
            reject(new Error(`Kicked: ${reason}`))
        })
    })
}

describe('Integration: Live BDS', () => {
    let bot = null

    afterAll(async () => {
        if (bot) {
            try { bot.quit() } catch { }
            await new Promise(r => setTimeout(r, 500))
        }
    })

    // ── Connect ──

    it('should connect and spawn', async () => {
        bot = await connectBot()
        expect(bot).toBeDefined()
        expect(bot.username).toBe(USERNAME)
        console.log('  ✓ Connected as', bot.username)
    }, 20000)

    // ── Position ──

    it('should have a valid position after spawn', () => {
        expect(bot).not.toBeNull()
        expect(bot.position).toBeDefined()
        expect(bot.position.y).toBeGreaterThan(-64)
        console.log(`  ✓ Position: ${bot.position.x.toFixed(1)}, ${bot.position.y.toFixed(1)}, ${bot.position.z.toFixed(1)}`)
    })

    // ── Entity ──

    it('should have a bot entity object', () => {
        expect(bot.entity).toBeDefined()
        expect(bot.entity.id).toBeDefined()
        console.log(`  ✓ Entity ID: ${bot.entity.id}`)
    })

    // ── Game State ──

    it('should have game state', () => {
        expect(bot.game).toBeDefined()
        expect(bot.game.gameMode).toBeDefined()
        console.log(`  ✓ GameMode: ${bot.game.gameMode}, Dimension: ${bot.game.dimension}`)
    })

    // ── Health ──

    it('should have health > 0', () => {
        expect(bot.health).toBeGreaterThan(0)
        expect(bot.health).toBeLessThanOrEqual(20)
        console.log(`  ✓ HP: ${bot.health}, Food: ${bot.food}`)
    })

    // ── Chat ──

    it('should send chat without error', () => {
        expect(() => bot.chat('Integration test — hello from bedrockflayer!')).not.toThrow()
        console.log('  ✓ Chat sent')
    })

    // ── Inventory ──

    it('should have a 41-slot inventory', () => {
        expect(bot.inventory).toBeDefined()
        expect(bot.inventory.slots.length).toBe(41)
        console.log(`  ✓ Inventory: ${bot.inventory.items().length} items`)
    })

    // ── Time ──

    it('should have time tracking', () => {
        expect(bot.time).toBeDefined()
        expect(bot.time.timeOfDay).toBeDefined()
        console.log(`  ✓ Time: ${bot.time.timeOfDay}, Day: ${bot.time.day}`)
    })

    // ── Players ──

    it('should track players', () => {
        expect(bot.players).toBeDefined()
        const names = Object.keys(bot.players)
        expect(names.length).toBeGreaterThan(0)
        console.log(`  ✓ Players: ${names.join(', ')}`)
    })

    // ── World / Chunks ──

    it('should load chunks', async () => {
        await new Promise(r => setTimeout(r, 3000))
        expect(bot._loadedChunks.size).toBeGreaterThan(0)
        console.log(`  ✓ Loaded chunks: ${bot._loadedChunks.size}`)
    }, 10000)

    // ── Controls ──

    it('should have movement control methods', () => {
        expect(typeof bot.setControlState).toBe('function')
        expect(typeof bot.clearControlStates).toBe('function')
        expect(typeof bot.look).toBe('function')
        expect(typeof bot.lookAt).toBe('function')
        expect(typeof bot.jump).toBe('function')
        console.log('  ✓ Controls API present')
    })

    // ── Combat ──

    it('should have combat methods', () => {
        expect(typeof bot.attack).toBe('function')
        expect(typeof bot.activateItem).toBe('function')
        expect(typeof bot.consume).toBe('function')
        console.log('  ✓ Combat API present')
    })

    // ── Digging ──

    it('should have digging methods', () => {
        expect(typeof bot.dig).toBe('function')
        expect(typeof bot.canDigBlock).toBe('function')
        expect(typeof bot.digTime).toBe('function')
        console.log('  ✓ Digging API present')
    })

    // ── Crafting ──

    it('should have crafting methods', () => {
        expect(typeof bot.recipesFor).toBe('function')
        expect(typeof bot.craft).toBe('function')
        console.log(`  ✓ Crafting: ${bot.recipes.length} recipes loaded`)
    })

    // ── Disconnect (LAST test) ──

    it('should disconnect cleanly', () => {
        expect(() => bot.quit('test complete')).not.toThrow()
        bot = null
        console.log('  ✓ Disconnected')
    })
})
