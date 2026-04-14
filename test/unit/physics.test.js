/**
 * Unit tests for the physics engine.
 * Tests gravity, jumping, ground collision, and movement without a real server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import EventEmitter from 'events'
import AABB from '../../lib/physics/aabb.js'
import C from '../../lib/physics/constants.js'

// We test the collision system directly rather than the full engine
// to avoid needing a real connection
import { moveEntity, isOnGround } from '../../lib/physics/collision.js'

/**
 * Create a mock bot with a simple flat world:
 * Solid blocks at y=0, air above.
 */
function createMockWorld() {
    const blocks = new Map()

    // Place a flat floor of solid blocks at y=0 from x=-5..5, z=-5..5
    for (let x = -5; x <= 5; x++) {
        for (let z = -5; z <= 5; z++) {
            blocks.set(`${x},0,${z}`, { solid: true, name: 'stone', isAir: false })
        }
    }

    const bot = {
        blockAt(point) {
            const x = Math.floor(point.x)
            const y = Math.floor(point.y)
            const z = Math.floor(point.z)
            const key = `${x},${y},${z}`
            return blocks.get(key) || { solid: false, name: 'air', isAir: true }
        },
        _blocks: blocks
    }

    return bot
}

describe('Physics', () => {
    describe('Gravity', () => {
        it('entity in air should fall due to gravity', () => {
            const bot = createMockWorld()
            const entity = {
                position: { x: 0, y: 5, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                width: 0.6,
                height: 1.8,
                onGround: false
            }

            // Apply gravity manually
            entity.velocity.y -= C.GRAVITY

            const result = moveEntity(bot, entity, entity.velocity)
            expect(result.position.y).toBeLessThan(5)
            expect(result.onGround).toBe(false) // still in air
        })

        it('entity should land on a solid block', () => {
            const bot = createMockWorld()
            const entity = {
                position: { x: 0, y: 1.5, z: 0 }, // slightly above the floor (block at y=0, top at y=1)
                velocity: { x: 0, y: -0.6, z: 0 }, // falling
                width: 0.6,
                height: 1.8,
                onGround: false
            }

            const result = moveEntity(bot, entity, entity.velocity)
            expect(result.position.y).toBeCloseTo(1) // should land on top of block at y=0 (top is y=1)
            expect(result.onGround).toBe(true)
        })
    })

    describe('Jump', () => {
        it('jump velocity should move entity upward', () => {
            const bot = createMockWorld()
            const entity = {
                position: { x: 0, y: 1, z: 0 }, // standing on block
                velocity: { x: 0, y: C.JUMP_VELOCITY, z: 0 },
                width: 0.6,
                height: 1.8,
                onGround: true
            }

            const result = moveEntity(bot, entity, entity.velocity)
            expect(result.position.y).toBeGreaterThan(1) // should rise
            expect(result.velocity.y).toBe(C.JUMP_VELOCITY) // no ceiling collision
        })
    })

    describe('Horizontal Movement', () => {
        it('should move horizontally in clear air', () => {
            const bot = createMockWorld()
            const entity = {
                position: { x: 0, y: 1, z: 0 },
                velocity: { x: 0.1, y: 0, z: 0.1 },
                width: 0.6,
                height: 1.8,
                onGround: true
            }

            const result = moveEntity(bot, entity, entity.velocity)
            expect(result.position.x).toBeGreaterThan(0)
            expect(result.position.z).toBeGreaterThan(0)
        })

        it('should stop at a wall', () => {
            const bot = createMockWorld()
            // Place a wall at x=2
            for (let y = 1; y <= 3; y++) {
                bot._blocks.set(`2,${y},0`, { solid: true, name: 'stone', isAir: false })
            }

            const entity = {
                position: { x: 0, y: 1, z: 0 },
                velocity: { x: 5, y: 0, z: 0 }, // trying to blast through wall
                width: 0.6,
                height: 1.8,
                onGround: true
            }

            const result = moveEntity(bot, entity, entity.velocity)
            expect(result.position.x).toBeLessThan(2) // should stop before wall
            expect(result.velocity.x).toBe(0) // velocity zeroed on collision
        })
    })

    describe('isOnGround', () => {
        it('should return true when standing on a block', () => {
            const bot = createMockWorld()
            const entity = {
                position: { x: 0, y: 1, z: 0 }, // on top of block at y=0
                width: 0.6,
                height: 1.8
            }
            expect(isOnGround(bot, entity)).toBe(true)
        })

        it('should return false when in mid-air', () => {
            const bot = createMockWorld()
            const entity = {
                position: { x: 0, y: 5, z: 0 }, // high in air
                width: 0.6,
                height: 1.8
            }
            expect(isOnGround(bot, entity)).toBe(false)
        })
    })
})
