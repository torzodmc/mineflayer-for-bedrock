/**
 * Unit tests for the AABB class.
 */

import { describe, it, expect } from 'vitest'
import AABB from '../../lib/physics/aabb.js'

describe('AABB', () => {
    describe('constructor and clone', () => {
        it('should store min/max coordinates', () => {
            const bb = new AABB(1, 2, 3, 4, 5, 6)
            expect(bb.minX).toBe(1)
            expect(bb.minY).toBe(2)
            expect(bb.minZ).toBe(3)
            expect(bb.maxX).toBe(4)
            expect(bb.maxY).toBe(5)
            expect(bb.maxZ).toBe(6)
        })

        it('should create an independent clone', () => {
            const bb = new AABB(0, 0, 0, 1, 1, 1)
            const clone = bb.clone()
            clone.minX = 5
            expect(bb.minX).toBe(0) // original unchanged
        })
    })

    describe('offset', () => {
        it('should shift the AABB by the given amounts', () => {
            const bb = new AABB(0, 0, 0, 1, 1, 1)
            const shifted = bb.offset(2, 3, 4)
            expect(shifted.minX).toBe(2)
            expect(shifted.minY).toBe(3)
            expect(shifted.minZ).toBe(4)
            expect(shifted.maxX).toBe(3)
            expect(shifted.maxY).toBe(4)
            expect(shifted.maxZ).toBe(5)
        })
    })

    describe('expand', () => {
        it('should expand the AABB in each direction', () => {
            const bb = new AABB(1, 1, 1, 2, 2, 2)
            const expanded = bb.expand(0.5, 0.5, 0.5)
            expect(expanded.minX).toBe(0.5)
            expect(expanded.maxX).toBe(2.5)
        })
    })

    describe('intersects', () => {
        it('should detect overlapping AABBs', () => {
            const a = new AABB(0, 0, 0, 2, 2, 2)
            const b = new AABB(1, 1, 1, 3, 3, 3)
            expect(a.intersects(b)).toBe(true)
        })

        it('should NOT detect non-overlapping AABBs', () => {
            const a = new AABB(0, 0, 0, 1, 1, 1)
            const b = new AABB(2, 2, 2, 3, 3, 3)
            expect(a.intersects(b)).toBe(false)
        })

        it('should NOT detect touching-but-not-overlapping AABBs', () => {
            const a = new AABB(0, 0, 0, 1, 1, 1)
            const b = new AABB(1, 0, 0, 2, 1, 1) // touching on X face
            expect(a.intersects(b)).toBe(false)
        })
    })

    describe('computeOffsetY', () => {
        it('should clamp downward movement to stop at a block below', () => {
            const player = new AABB(-0.3, 1, -0.3, 0.3, 2.8, 0.3)
            const block = AABB.fromBlock(0, 0, 0) // block at y=0 to y=1

            const dy = player.computeOffsetY(block, -2) // trying to fall by 2
            expect(dy).toBeCloseTo(0) // should stop at y=1 (block top)
        })

        it('should clamp upward movement to stop at a block above', () => {
            const player = new AABB(-0.3, 0, -0.3, 0.3, 1.8, 0.3)
            const block = AABB.fromBlock(0, 2, 0) // block at y=2 to y=3

            const dy = player.computeOffsetY(block, 5) // trying to go up 5
            expect(dy).toBeCloseTo(0.2) // should stop at y=2 - 1.8 = 0.2
        })

        it('should not affect movement when blocks are on different X/Z', () => {
            const player = new AABB(-0.3, 1, -0.3, 0.3, 2.8, 0.3)
            const block = AABB.fromBlock(5, 0, 5) // far away block

            const dy = player.computeOffsetY(block, -2)
            expect(dy).toBe(-2) // no collision
        })
    })

    describe('computeOffsetX', () => {
        it('should clamp horizontal movement when hitting a wall', () => {
            const player = new AABB(-0.3, 0, -0.3, 0.3, 1.8, 0.3)
            const block = AABB.fromBlock(1, 0, 0) // wall at x=1

            const dx = player.computeOffsetX(block, 2) // trying to move right by 2
            expect(dx).toBeCloseTo(0.7) // should stop at x=1 - 0.3 = 0.7
        })
    })

    describe('fromBlock', () => {
        it('should create a 1x1x1 AABB at block position', () => {
            const bb = AABB.fromBlock(5, 10, 15)
            expect(bb.minX).toBe(5)
            expect(bb.minY).toBe(10)
            expect(bb.minZ).toBe(15)
            expect(bb.maxX).toBe(6)
            expect(bb.maxY).toBe(11)
            expect(bb.maxZ).toBe(16)
        })
    })

    describe('fromPlayer', () => {
        it('should create an AABB centered on the X/Z position', () => {
            const bb = AABB.fromPlayer({ x: 0, y: 64, z: 0 }, 0.6, 1.8)
            expect(bb.minX).toBeCloseTo(-0.3)
            expect(bb.maxX).toBeCloseTo(0.3)
            expect(bb.minY).toBe(64)
            expect(bb.maxY).toBeCloseTo(65.8)
        })
    })

    describe('union', () => {
        it('should merge two AABBs into their bounding box', () => {
            const a = new AABB(0, 0, 0, 1, 1, 1)
            const b = new AABB(2, 2, 2, 3, 3, 3)
            const merged = a.union(b)
            expect(merged.minX).toBe(0)
            expect(merged.maxX).toBe(3)
            expect(merged.minY).toBe(0)
            expect(merged.maxY).toBe(3)
        })
    })
})
