/**
 * Combat Plugin for bedrockflayer.
 *
 * Handles attacking entities, using items, activating blocks/entities,
 * consuming food, fishing, and item interactions.
 */

const OFFHAND_PLAYER_SLOT = 40

function combatPlugin(bot) {
    // ============================================================
    //  Attack
    // ============================================================

    /**
     * Attack an entity.
     * @param {Entity} entity - Target entity
     * @param {boolean} [swing=true] - Show arm swing animation
     * @returns {boolean} success
     */
    bot.attack = function (entity, swing = true) {
        if (!entity) return false
        if (!entity.position) return false
        if (!entity.isValid) return false

        // Distance check (max reach 5 blocks)
        if (bot.entity) {
            const dist = Math.sqrt(
                Math.pow(bot.entity.position.x - entity.position.x, 2) +
                Math.pow(bot.entity.position.y - entity.position.y, 2) +
                Math.pow(bot.entity.position.z - entity.position.z, 2)
            )
            if (dist > 5) return false
        }

        const playerPos = bot.entity ? {
            x: bot.entity.position.x,
            y: bot.entity.position.y + 1.62,
            z: bot.entity.position.z
        } : { x: 0, y: 0, z: 0 }

        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 3,
                actions: [],
                transaction_data: {
                    entity_runtime_id: entity.id,
                    action_type: 1,
                    hotbar_slot: bot.quickBarSlot ?? 0,
                    held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                    player_pos: playerPos,
                    click_pos: {
                        x: entity.position.x,
                        y: entity.position.y + (entity.height || 1) * 0.5,
                        z: entity.position.z
                    }
                }
            }
        }).catch((err) => { bot.emit('error', err) })

        if (swing) bot.swingArm()

        bot.emit('attackedTarget', entity)
        return true
    }

    /**
     * Swing the bot's arm (visual animation, no damage).
     * @param {'right'|'left'} [hand='right']
     */
    bot.swingArm = function (hand = 'right') {
        // Bedrock animate packet: action_id 1 = swing arm (no left/right distinction)
        bot.client.queue('animate', {
            action_id: 1,
            runtime_entity_id: bot._runtimeEntityId
        }).catch((err) => { bot.emit('error', err) })
    }

    // ============================================================
    //  Use / Interact
    // ============================================================

    /**
     * Interact with an entity (right-click). Used for villagers, animals, etc.
     * @param {Entity} entity
     * @returns {boolean} success
     */
    bot.useOn = function (entity) {
        if (!entity) return false
        if (!entity.position) return false
        if (!entity.isValid) return false

        // Distance check
        if (bot.entity) {
            const dist = Math.sqrt(
                Math.pow(bot.entity.position.x - entity.position.x, 2) +
                Math.pow(bot.entity.position.y - entity.position.y, 2) +
                Math.pow(bot.entity.position.z - entity.position.z, 2)
            )
            if (dist > 5) return false
        }

        const playerPos = bot.entity ? {
            x: bot.entity.position.x,
            y: bot.entity.position.y + 1.62,
            z: bot.entity.position.z
        } : { x: 0, y: 0, z: 0 }

        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 3,
                actions: [],
                transaction_data: {
                    entity_runtime_id: entity.id,
                    action_type: 0,
                    hotbar_slot: bot.quickBarSlot ?? 0,
                    held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                    player_pos: playerPos,
                    click_pos: {
                        x: entity.position.x,
                        y: entity.position.y + (entity.height || 1) * 0.5,
                        z: entity.position.z
                    }
                }
            }
        }).catch((err) => { bot.emit('error', err) })

        return true
    }

    /**
     * Activate (use/right-click) the held item in air.
     * Used for: eating, drinking, throwing ender pearls, shooting bows, etc.
     * @param {boolean} [offHand=false]
     * @returns {boolean} success
     */
    bot.activateItem = function (offHand = false) {
        const heldItem = offHand ? bot.inventory.slots[OFFHAND_PLAYER_SLOT] : bot.heldItem
        const slot = offHand ? OFFHAND_PLAYER_SLOT : (bot.quickBarSlot ?? 0)

        const playerPos = bot.entity ? {
            x: bot.entity.position.x,
            y: bot.entity.position.y + 1.62,
            z: bot.entity.position.z
        } : { x: 0, y: 0, z: 0 }

        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 2,
                actions: [],
                transaction_data: {
                    action_type: 1,
                    block_position: { x: 0, y: 0, z: 0 },
                    face: -1,
                    hotbar_slot: slot,
                    held_item: heldItem ? heldItem.toNetwork() : { network_id: 0 },
                    player_pos: playerPos,
                    click_pos: { x: 0, y: 0, z: 0 },
                    block_runtime_id: 0,
                    ...(offHand && { use_slot: 1 })
                }
            }
        }).catch((err) => { bot.emit('error', err) })

        bot.emit('activateItem')
        return true
    }

    /**
     * Deactivate (release) a currently held item.
     * Used for: releasing bow, stopping eating/drinking, etc.
     */
    bot.deactivateItem = function () {
        const headPos = bot.entity ? {
            x: bot.entity.position.x,
            y: bot.entity.position.y + 1.62,
            z: bot.entity.position.z
        } : { x: 0, y: 0, z: 0 }

        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 4, // item_release
                actions: [],
                transaction_data: {
                    action_type: 0, // release
                    hotbar_slot: bot.quickBarSlot ?? 0,
                    held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                    head_pos: headPos
                }
            }
        }).catch((err) => { bot.emit('error', err) })

        bot.emit('deactivateItem')
    }

    /**
     * Activate a block (right-click). Used for: levers, buttons, doors, trapdoors.
     * @param {Block} block
     * @returns {boolean} success
     */
    bot.activateBlock = function (block) {
        if (!block) return false
        if (!block.position) return false

        const face = _calculateFace(block)

        const playerPos = bot.entity ? {
            x: bot.entity.position.x,
            y: bot.entity.position.y + 1.62,
            z: bot.entity.position.z
        } : { x: 0, y: 0, z: 0 }

        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 2,
                actions: [],
                transaction_data: {
                    action_type: 0,
                    block_position: {
                        x: Math.floor(block.position.x),
                        y: Math.floor(block.position.y),
                        z: Math.floor(block.position.z)
                    },
                    face,
                    hotbar_slot: bot.quickBarSlot ?? 0,
                    held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                    player_pos: playerPos,
                    click_pos: { x: 0.5, y: 0.5, z: 0.5 },
                    block_runtime_id: block.stateId || 0
                }
            }
        }).catch((err) => { bot.emit('error', err) })

        bot.emit('activateBlock', block)
        return true
    }

    function _calculateFace(block) {
        if (!bot.entity) return 1

        const playerPos = bot.entity.position
        const blockPos = block.position

        const dx = playerPos.x - blockPos.x
        const dy = playerPos.y + 1.62 - blockPos.y
        const dz = playerPos.z - blockPos.z

        const ax = Math.abs(dx)
        const ay = Math.abs(dy)
        const az = Math.abs(dz)

        if (ay > ax && ay > az) {
            return dy > 0 ? 0 : 1 // bottom : top
        } else if (ax > az) {
            return dx > 0 ? 4 : 5 // west : east
        } else {
            return dz > 0 ? 3 : 2 // north : south
        }
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
     * Waits for server inventory update to confirm consumption.
     * @returns {Promise<void>}
     */
    bot.consume = function () {
        return new Promise((resolve, reject) => {
            if (!bot.heldItem) {
                reject(new Error('No item in hand'))
                return
            }

            const itemName = bot.heldItem.name || ''
            const itemType = bot.heldItem.type

            let consumeTime = 1600 // default 32 ticks
            if (itemName.includes('dried_kelp') || itemName.includes('suspicious_stew')) {
                consumeTime = 800 // 16 ticks
            } else if (itemName.includes('honey_bottle')) {
                consumeTime = 2000 // 40 ticks
            }

            let resolved = false
            const cleanup = () => {
                bot.removeListener('inventoryUpdate', onInvUpdate)
            }

            const onInvUpdate = (update) => {
                // Check if held item changed (consumed)
                const currentHeld = bot.heldItem
                if (!currentHeld || (currentHeld.slot !== (bot.quickBarSlot ?? 0))) {
                    resolved = true
                    cleanup()
                    bot.emit('consume')
                    resolve()
                }
            }

            // Also use timeout as fallback
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    cleanup()
                    bot.emit('consume')
                    resolve()
                }
            }, consumeTime + 500) // Add buffer for server delay

            // Override cleanup to also clear timeout
            const origCleanup = cleanup
            cleanup = () => {
                origCleanup()
                clearTimeout(timeoutId)
            }

            bot.on('inventoryUpdate', onInvUpdate)
            bot.activateItem()
        })
    }

    // ============================================================
    //  Fishing
    // ============================================================

    /**
     * Cast a fishing rod and wait for a bite.
     * @returns {Promise<void>}
     */
    bot.fish = function () {
        return new Promise((resolve, reject) => {
            if (!bot.heldItem) {
                reject(new Error('No item in hand'))
                return
            }

            bot.activateItem().catch((err) => bot.emit('error', err))

            let fishing = true

            let fishCaught = false
            const cleanup = () => {
                fishing = false
                bot.client.removeListener('level_sound_event', onSound)
                bot.client.removeListener('level_event', onLevelEvent)
            }

            const onSound = (packet) => {
                if (!fishing || fishCaught) return

                const name = (packet.sound || packet.name || '').toLowerCase()
                const isSplash = name === 'random.splash' || name.includes('splash')
                const isFishBite = !name.includes('fishing.throw') &&
                                   (name.includes('splash') || name.includes('fish.'))

                if (isSplash || isFishBite) {
                    const playerPos = bot.entity?.position
                    const soundPos = packet.position
                    if (playerPos && soundPos) {
                        const dx = playerPos.x - soundPos.x
                        const dy = playerPos.y - soundPos.y
                        const dz = playerPos.z - soundPos.z
                        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
                        if (dist > 30) return
                    }
                    fishCaught = true
                    cleanup()
                    clearTimeout(timeoutId)
                    bot.client.queue('inventory_transaction', {
                        transaction: {
                            transaction_type: 4, // item_release
                            actions: [],
                            transaction_data: {
                                action_type: 0, // release
                                hotbar_slot: bot.quickBarSlot ?? 0,
                                held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                                head_pos: bot.entity ? {
                                    x: bot.entity.position.x,
                                    y: bot.entity.position.y + 1.62,
                                    z: bot.entity.position.z
                                } : { x: 0, y: 0, z: 0 }
                            }
                        }
                    }).catch((err) => bot.emit('error', err))
                    bot.emit('fishCaught')
                    resolve()
                }
            }

            const onLevelEvent = (packet) => {
                if (!fishing || fishCaught) return
                const event = packet.event
                if (event === 1001) {
                    const playerPos = bot.entity?.position
                    const eventPos = packet.position
                    if (playerPos && eventPos) {
                        const dx = playerPos.x - eventPos.x
                        const dy = playerPos.y - eventPos.y
                        const dz = playerPos.z - eventPos.z
                        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
                        if (dist > 30) return
                    }
                    fishCaught = true
                    cleanup()
                    clearTimeout(timeoutId)
                    bot.client.queue('inventory_transaction', {
                        transaction: {
                            transaction_type: 4, // item_release
                            actions: [],
                            transaction_data: {
                                action_type: 0, // release
                                hotbar_slot: bot.quickBarSlot ?? 0,
                                held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                                head_pos: bot.entity ? {
                                    x: bot.entity.position.x,
                                    y: bot.entity.position.y + 1.62,
                                    z: bot.entity.position.z
                                } : { x: 0, y: 0, z: 0 }
                            }
                        }
                    }).catch((err) => bot.emit('error', err))
                    bot.emit('fishCaught')
                    resolve()
                }
            }

            bot.client.on('level_sound_event', onSound)
            bot.client.on('level_event', onLevelEvent)

            const timeoutId = setTimeout(() => {
                if (!fishing) return
                cleanup()
                bot.client.queue('inventory_transaction', {
                    transaction: {
                        transaction_type: 4, // item_release
                        actions: [],
                        transaction_data: {
                            action_type: 0, // release
                            hotbar_slot: bot.quickBarSlot ?? 0,
                            held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                            head_pos: bot.entity ? {
                                x: bot.entity.position.x,
                                y: bot.entity.position.y + 1.62,
                                z: bot.entity.position.z
                            } : { x: 0, y: 0, z: 0 }
                        }
                    }
                }).catch((err) => bot.emit('error', err))
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
            if (!entity.isValid) continue
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
