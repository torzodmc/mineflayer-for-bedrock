/**
 * Combat Plugin for bedrockflayer.
 *
 * Handles attacking entities, using items, activating blocks/entities,
 * consuming food, fishing, and item interactions.
 */

function combatPlugin(bot) {
    // ============================================================
    //  Attack
    // ============================================================

    /**
     * Attack an entity.
     * @param {Entity} entity - Target entity
     * @param {boolean} [swing=true] - Show arm swing animation
     */
    bot.attack = function (entity, swing = true) {
        if (!entity) return

        // Send attack via inventory_transaction
        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 'item_use_on_entity',
                transaction_data: {
                    entity_runtime_id: entity.id,
                    action_type: 1, // Attack
                    hotbar_slot: bot.quickBarSlot || 0,
                    held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                    player_position: bot.entity ? {
                        x: bot.entity.position.x,
                        y: bot.entity.position.y,
                        z: bot.entity.position.z
                    } : { x: 0, y: 0, z: 0 },
                    click_position: {
                        x: entity.position.x,
                        y: entity.position.y + (entity.height || 1) * 0.5,
                        z: entity.position.z
                    }
                }
            }
        })

        // Arm swing
        if (swing) bot.swingArm()

        bot.emit('attackedTarget', entity)
    }

    /**
     * Swing the bot's arm (visual animation, no damage).
     * @param {'right'|'left'} [hand='right']
     */
    bot.swingArm = function (hand = 'right') {
        bot.client.queue('animate', {
            action_id: 1, // Swing arm
            runtime_entity_id: bot._runtimeEntityId
        })
    }

    // ============================================================
    //  Use / Interact
    // ============================================================

    /**
     * Interact with an entity (right-click). Used for villagers, animals, etc.
     * @param {Entity} entity
     */
    bot.useOn = function (entity) {
        if (!entity) return

        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 'item_use_on_entity',
                transaction_data: {
                    entity_runtime_id: entity.id,
                    action_type: 0, // Interact
                    hotbar_slot: bot.quickBarSlot || 0,
                    held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                    player_position: bot.entity ? {
                        x: bot.entity.position.x,
                        y: bot.entity.position.y,
                        z: bot.entity.position.z
                    } : { x: 0, y: 0, z: 0 },
                    click_position: {
                        x: entity.position.x,
                        y: entity.position.y + (entity.height || 1) * 0.5,
                        z: entity.position.z
                    }
                }
            }
        })
    }

    /**
     * Activate (use/right-click) the held item in air.
     * Used for: eating, drinking, throwing ender pearls, shooting bows, etc.
     * @param {boolean} [offHand=false]
     */
    bot.activateItem = function (offHand = false) {
        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 'item_use',
                transaction_data: {
                    action_type: 1, // Click air (use item)
                    block_position: { x: 0, y: 0, z: 0 },
                    face: -1,
                    hotbar_slot: bot.quickBarSlot || 0,
                    held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                    player_position: bot.entity ? {
                        x: bot.entity.position.x,
                        y: bot.entity.position.y,
                        z: bot.entity.position.z
                    } : { x: 0, y: 0, z: 0 },
                    click_position: { x: 0, y: 0, z: 0 },
                    block_runtime_id: 0
                }
            }
        })

        bot.emit('activateItem')
    }

    /**
     * Deactivate (release) a currently held item.
     * Used for: releasing bow, stopping eating/drinking, etc.
     */
    bot.deactivateItem = function () {
        bot.client.queue('player_action', {
            runtime_entity_id: bot._runtimeEntityId,
            action: 'release_item',
            position: { x: 0, y: 0, z: 0 },
            result_position: { x: 0, y: 0, z: 0 },
            face: 0
        })

        bot.emit('deactivateItem')
    }

    /**
     * Activate a block (right-click). Used for: levers, buttons, doors, trapdoors.
     * @param {Block} block
     */
    bot.activateBlock = function (block) {
        if (!block) return

        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 'item_use',
                transaction_data: {
                    action_type: 0, // Click block
                    block_position: {
                        x: Math.floor(block.position.x),
                        y: Math.floor(block.position.y),
                        z: Math.floor(block.position.z)
                    },
                    face: 1,
                    hotbar_slot: bot.quickBarSlot || 0,
                    held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                    player_position: bot.entity ? {
                        x: bot.entity.position.x,
                        y: bot.entity.position.y,
                        z: bot.entity.position.z
                    } : { x: 0, y: 0, z: 0 },
                    click_position: { x: 0.5, y: 1, z: 0.5 },
                    block_runtime_id: block.stateId || 0
                }
            }
        })

        bot.emit('activateBlock', block)
    }

    /**
     * Activate (interact with) an entity. Same as useOn but with different naming.
     * @param {Entity} entity
     */
    bot.activateEntity = function (entity) {
        bot.useOn(entity)
        bot.emit('activateEntity', entity)
    }

    // ============================================================
    //  Consuming (eat/drink)
    // ============================================================

    /**
     * Use (consume) the held food or drinkable item.
     * Waits for consumption to complete (~1.6 seconds for food).
     * @returns {Promise<void>}
     */
    bot.consume = function () {
        return new Promise((resolve, reject) => {
            if (!bot.heldItem) return reject(new Error('No item in hand'))

            bot.activateItem()

            // Food takes 32 ticks (1.6s), potions take 32 ticks too
            // Dried kelp is 16 ticks (0.8s)
            const consumeTime = 1600

            setTimeout(() => {
                // Item should be consumed by now (server will update inventory)
                bot.emit('consume')
                resolve()
            }, consumeTime)
        })
    }

    // ============================================================
    //  Fishing
    // ============================================================

    /**
     * Cast a fishing rod and wait for a bite (simplified).
     * @returns {Promise<void>}
     */
    bot.fish = function () {
        return new Promise((resolve, reject) => {
            if (!bot.heldItem) return reject(new Error('No item in hand'))

            // Cast
            bot.activateItem()

            // Listen for entity event (bobber splash) — simplified detection
            const onSound = (packet) => {
                const name = packet.sound || packet.name || ''
                if (name.includes('random.splash') || name.includes('bucket.fill_fish')) {
                    bot.client.removeListener('level_sound_event', onSound)
                    // Reel in
                    setTimeout(() => {
                        bot.activateItem()
                        bot.emit('fishCaught')
                        resolve()
                    }, 200)
                }
            }

            bot.client.on('level_sound_event', onSound)

            // Timeout after 60 seconds
            setTimeout(() => {
                bot.client.removeListener('level_sound_event', onSound)
                bot.activateItem() // reel in anyway
                reject(new Error('Fishing timed out'))
            }, 60000)
        })
    }

    // ============================================================
    //  Entity at cursor
    // ============================================================

    /**
     * Get the nearest entity the bot is looking at.
     * @param {number} [maxDistance=5]
     * @returns {Entity|null}
     */
    bot.entityAtCursor = function (maxDistance = 5) {
        if (!bot.entity) return null

        const eye = bot.entity.position.offset
            ? bot.entity.position.offset(0, 1.62, 0)
            : { x: bot.entity.position.x, y: bot.entity.position.y + 1.62, z: bot.entity.position.z }

        const yaw = bot.entity.yaw
        const pitch = bot.entity.pitch
        const dx = -Math.sin(yaw) * Math.cos(pitch)
        const dy = -Math.sin(pitch)
        const dz = Math.cos(yaw) * Math.cos(pitch)

        let closest = null
        let closestDist = maxDistance

        for (const id in bot.entities) {
            const entity = bot.entities[id]
            if (entity.id === bot._runtimeEntityId) continue

            const toEntity = {
                x: entity.position.x - eye.x,
                y: entity.position.y + (entity.height || 1) * 0.5 - eye.y,
                z: entity.position.z - eye.z
            }

            const dist = Math.sqrt(toEntity.x * toEntity.x + toEntity.y * toEntity.y + toEntity.z * toEntity.z)
            if (dist > closestDist) continue

            // Project onto look direction
            const dot = toEntity.x * dx + toEntity.y * dy + toEntity.z * dz
            if (dot < 0) continue // behind us

            // Check perpendicular distance from ray
            const crossX = toEntity.y * dz - toEntity.z * dy
            const crossY = toEntity.z * dx - toEntity.x * dz
            const crossZ = toEntity.x * dy - toEntity.y * dx
            const perpDist = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ)

            const hitRadius = (entity.width || 0.6) / 2 + 0.3 // entity width + tolerance
            if (perpDist < hitRadius) {
                closestDist = dist
                closest = entity
            }
        }

        return closest
    }
}

module.exports = combatPlugin
