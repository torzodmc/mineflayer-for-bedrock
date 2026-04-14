/**
 * Creative Mode Plugin for bedrockflayer.
 *
 * Provides creative-mode-specific features:
 * - Setting items in creative inventory slots
 * - Flying toggle (via player_action)
 * - Instant block break in creative
 */

const Item = require('../classes/Item')

function creativePlugin(bot) {
    // ---- State ----
    bot.creative = {
        flying: false
    }

    // ============================================================
    //  Methods
    // ============================================================

    /**
     * Set a creative inventory slot to an item.
     * Only works in creative mode (gameMode === 1).
     * @param {number} slot - Slot index
     * @param {Item|null} item - Item to place (null to clear)
     */
    bot.creative.setSlot = function (slot, item) {
        if (bot.game && bot.game.gameMode !== 1) {
            throw new Error('Not in creative mode')
        }

        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 'normal',
                transactions: [{
                    source_type: 'creative',
                    source_flags: 0,
                    slot,
                    old_item: { network_id: 0 },
                    new_item: item ? item.toNetwork() : { network_id: 0 }
                }]
            }
        })

        // Update local inventory
        if (bot.inventory && slot >= 0 && slot < bot.inventory.slots.length) {
            bot.inventory.setSlot(slot, item)
        }
    }

    /**
     * Give the bot an item in creative mode.
     * Places it in the first empty hotbar/inventory slot.
     * @param {number} itemId - Item type ID
     * @param {number} [count=1]
     * @param {number} [metadata=0]
     */
    bot.creative.giveItem = function (itemId, count = 1, metadata = 0) {
        const item = new Item(itemId, count, metadata)
        const slot = bot.inventory ? bot.inventory.findEmptySlot() : 0
        if (slot === -1) throw new Error('No empty slot')
        bot.creative.setSlot(slot, item)
    }

    /**
     * Clear a creative inventory slot.
     * @param {number} slot
     */
    bot.creative.clearSlot = function (slot) {
        bot.creative.setSlot(slot, null)
    }

    /**
     * Toggle flying in creative mode.
     * @param {boolean} flying
     */
    bot.creative.startFlying = function () {
        bot.creative.flying = true
        bot.client.queue('player_action', {
            runtime_entity_id: bot._runtimeEntityId,
            action: 'start_flying',
            position: { x: 0, y: 0, z: 0 },
            result_position: { x: 0, y: 0, z: 0 },
            face: 0
        })
    }

    bot.creative.stopFlying = function () {
        bot.creative.flying = false
        bot.client.queue('player_action', {
            runtime_entity_id: bot._runtimeEntityId,
            action: 'stop_flying',
            position: { x: 0, y: 0, z: 0 },
            result_position: { x: 0, y: 0, z: 0 },
            face: 0
        })
    }

    /**
     * Fly to a position (sets velocity directly, creative only).
     * @param {Vec3} target
     * @param {number} [speed=1]
     */
    bot.creative.flyTo = function (target, speed = 1) {
        if (!bot.entity) return
        if (!bot.creative.flying) bot.creative.startFlying()

        const dx = target.x - bot.entity.position.x
        const dy = target.y - bot.entity.position.y
        const dz = target.z - bot.entity.position.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        if (dist < 0.5) return // close enough

        const factor = speed / dist
        bot.entity.velocity.x = dx * factor
        bot.entity.velocity.y = dy * factor
        bot.entity.velocity.z = dz * factor
    }
}

module.exports = creativePlugin
