/**
 * Collect Block Plugin for bedrockflayer.
 *
 * Provides bot.collectBlock.collect(block|blockType) — finds, digs, and
 * picks up the item drop from a target block.
 *
 * Usage:
 *   bot.loadPlugin(require('./plugins/collect_block'))
 *
 *   // Collect a specific block
 *   await bot.collectBlock.collect(bot.blockAt(pos))
 *
 *   // Find and collect by name
 *   await bot.collectBlock.collect('diamond_ore')
 *
 *   // Collect multiple
 *   await bot.collectBlock.collect('oak_log', { count: 10 })
 */

const { Vec3 } = require('../utils/vec3')

function collectBlockPlugin(bot) {
    bot.collectBlock = {
        /**
         * Find, dig, and collect item drops from a target block.
         *
         * @param {Block|string|number} target - Block object, block name, or block type ID
         * @param {object} [options]
         * @param {number} [options.count=1] - Number of blocks to collect
         * @param {number} [options.maxDistance=32] - Maximum search distance
         * @param {number} [options.pickupDelay=500] - Ms to wait for item drop after digging
         * @returns {Promise<number>} Number of blocks successfully collected
         */
        async collect(target, options = {}) {
            const count = options.count || 1
            const maxDist = options.maxDistance || 32
            const pickupDelay = options.pickupDelay || 500
            let collected = 0

            for (let i = 0; i < count; i++) {
                // Find the block
                let block = null

                if (typeof target === 'string') {
                    block = bot.findBlock({
                        matching: target,
                        maxDistance: maxDist
                    })
                } else if (typeof target === 'number') {
                    block = bot.findBlock({
                        matching: target,
                        maxDistance: maxDist
                    })
                } else if (target && target.position) {
                    block = target
                }

                if (!block) {
                    bot.emit('collectBlock_noTarget', target)
                    break
                }

                try {
                    // Navigate to the block (within reach distance of 4.5)
                    if (bot.pathfinder && bot.entity) {
                        const dist = bot.entity.position.distanceTo(block.position)
                        if (dist > 4.5) {
                            const { GoalNear } = require('./pathfinder')
                            await bot.pathfinder.goto(new GoalNear(
                                block.position.x,
                                block.position.y,
                                block.position.z,
                                3
                            ))
                        }
                    }

                    // Dig the block
                    if (bot.dig) {
                        bot.emit('collectBlock_digging', block)
                        await bot.dig(block)
                    }

                    // Wait for item drop to spawn
                    await new Promise(resolve => setTimeout(resolve, pickupDelay))

                    // Move to the block position to pick up the item
                    if (bot.pathfinder && bot.entity) {
                        const dropPos = block.position.offset(0.5, 0, 0.5)
                        const dist = bot.entity.position.distanceTo(dropPos)
                        if (dist > 1) {
                            const { GoalBlock } = require('./pathfinder')
                            try {
                                await bot.pathfinder.goto(new GoalBlock(
                                    Math.floor(dropPos.x),
                                    Math.floor(dropPos.y),
                                    Math.floor(dropPos.z)
                                ))
                            } catch (e) {
                                // May already be close enough
                            }
                        }
                    }

                    // Wait for pickup
                    await new Promise(resolve => setTimeout(resolve, 300))

                    collected++
                    bot.emit('collectBlock_collected', block, collected)
                } catch (e) {
                    bot.emit('collectBlock_error', e, block)
                    break
                }
            }

            return collected
        }
    }
}

module.exports = collectBlockPlugin
