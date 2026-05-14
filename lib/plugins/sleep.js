/**
 * Sleep Plugin for bedrockflayer.
 *
 * Handles bed sleeping/waking mechanics.
 */

function sleepPlugin(bot) {
    // ---- State ----
    bot.isSleeping = false
    bot.bedPosition = null

    // ---- Detect sleep via player_action from server ----
    // Bedrock uses animate packets and player position changes
    // to indicate sleeping state.

    bot.client.on('set_entity_data', (packet) => {
        if (Number(packet.runtime_entity_id) !== bot._runtimeEntityId) return
        const metadata = packet.metadata || []

        // Check for sleeping flag in metadata
        // Entity flags (key 0) contains the sleeping bit
        for (const entry of (Array.isArray(metadata) ? metadata : [])) {
            if (entry.key === 0 || entry.type === 0) {
                // Bit 2 = sleeping in Bedrock metadata flags
                const flags = typeof entry.value === 'number' ? entry.value : (entry.value ? Number(entry.value) : 0)
                const wasSleeping = bot.isSleeping
                bot.isSleeping = !!(flags & (1 << 2))
                if (!wasSleeping && bot.isSleeping) bot.emit('sleep')
                if (wasSleeping && !bot.isSleeping) bot.emit('wake')
            }
        }
    })

    // ============================================================
    //  Methods
    // ============================================================

    /**
     * Go to sleep in a nearby bed.
     * @param {Block} bedBlock - The bed block to sleep in
     * @returns {Promise<void>}
     */
    bot.sleep = function (bedBlock) {
        return new Promise(async (resolve, reject) => {
            if (!bedBlock) return reject(new Error('No bed block specified'))
            if (!bedBlock.position) return reject(new Error('Bed block has no position'))

            // Look at the bed and wait for it to complete
            if (bot.lookAt) {
                const targetPos = bedBlock.position.offset
                    ? bedBlock.position.offset(0.5, 0.5, 0.5)
                    : bedBlock.position
                await new Promise((res) => {
                    bot.lookAt(targetPos)
                    setTimeout(res, 100)
                })
            }

            // Interact with the bed (right-click)
            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 2,
                    actions: [],
                    transaction_data: {
                        action_type: 0,
                        block_position: {
                            x: Math.floor(bedBlock.position.x),
                            y: Math.floor(bedBlock.position.y),
                            z: Math.floor(bedBlock.position.z)
                        },
                        face: 1,
                        hotbar_slot: bot.quickBarSlot ?? 0,
                        held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                        player_pos: bot.entity ? {
                            x: bot.entity.position.x,
                            y: bot.entity.position.y,
                            z: bot.entity.position.z
                        } : { x: 0, y: 0, z: 0 },
                        click_pos: { x: 0.5, y: 0.5, z: 0.5 },
                        block_runtime_id: bedBlock.stateId || 0
                    }
                }
            })

            bot.bedPosition = bedBlock.position

            // Wait for sleep event
            const onSleep = () => {
                bot.removeListener('sleep', onSleep)
                resolve()
            }
            bot.on('sleep', onSleep)

            setTimeout(() => {
                bot.removeListener('sleep', onSleep)
                if (!bot.isSleeping) reject(new Error('Failed to sleep — not night or monsters nearby'))
            }, 3000)
        })
    }

/**
     * Wake up from sleep.
     */
    bot.wake = function () {
        if (!bot.isSleeping) return

        const bedPos = bot.bedPosition
        bot.client.queue('player_action', {
            runtime_entity_id: bot._runtimeEntityId,
            action: 'stop_sleeping',
            position: bedPos ? {
                x: Math.floor(bedPos.x),
                y: Math.floor(bedPos.y),
                z: Math.floor(bedPos.z)
            } : { x: 0, y: 0, z: 0 },
            result_position: { x: 0, y: 0, z: 0 },
            face: 0
        })

        const onWake = () => {
            bot.removeListener('wake', onWake)
            bot.isSleeping = false
            bot.bedPosition = null
        }
        bot.on('wake', onWake)

        setTimeout(() => {
            bot.removeListener('wake', onWake)
            if (bot.isSleeping) {
                bot.isSleeping = false
                bot.bedPosition = null
            }
        }, 2000)
}
}

module.exports = sleepPlugin
