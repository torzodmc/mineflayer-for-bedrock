/**
 * Digging Plugin for bedrockflayer.
 *
 * Handles block breaking with proper timing based on tool and block hardness.
 * Uses player_action packets (StartBreak, AbortBreak, StopBreak) and
 * inventory_transaction for the final break confirmation.
 */

function diggingPlugin(bot) {
    // ---- State ----
    bot.targetDigBlock = null
    bot._digging = false
    bot._digTimer = null
    let _digResolve = null

    // ---- Server acknowledgments ----
    bot.client.on('level_event', (packet) => {
        if (packet.event === 2001 && bot.targetDigBlock && bot._digging) {
            const pos = bot.targetDigBlock.position
            if (packet.position &&
                Math.floor(packet.position.x) === Math.floor(pos.x) &&
                Math.floor(packet.position.y) === Math.floor(pos.y) &&
                Math.floor(packet.position.z) === Math.floor(pos.z)) {
                const block = bot.targetDigBlock
                const face = bot._digFace || 1
                const digPos = bot._digPos
                if (_digResolve && bot._digging) {
                    _finishDig(bot, block, digPos, face, _digResolve)
                }
            }
        }
    })

    // Cleanup on bot destruction
    bot.once('close', () => {
        if (bot._digTimer) {
            clearTimeout(bot._digTimer)
            bot._digTimer = null
        }
    })

    // ============================================================
    //  Methods
    // ============================================================

    /**
     * Calculate the time to dig a block in milliseconds.
     * @param {Block} block - The block to dig
     * @returns {number} Time in milliseconds (0 = instant)
     */
    bot.digTime = function (block) {
        if (!block || !block.diggable) return Infinity

        const hardness = block.hardness
        if (hardness < 0) return Infinity // unbreakable
        if (hardness === 0) return 0      // instant break

        // Base dig speed
        let speedMultiplier = 1

        // Check held tool effectiveness
        const heldItem = bot.heldItem
        if (heldItem) {
            const toolSpeed = _getToolSpeed(heldItem, block)
            if (toolSpeed > 1) speedMultiplier = toolSpeed
        }

        // Efficiency enchantment
        if (heldItem && heldItem.enchants) {
            const efficiency = heldItem.enchants.find(e =>
                e.id === 15 || e.id === 'efficiency'
            )
            if (efficiency) {
                speedMultiplier += efficiency.lvl * efficiency.lvl + 1
            }
        }

        // Haste effect
        if (bot.entity && bot.entity.effects) {
            const haste = bot.entity.effects[3] // Haste effect ID
            if (haste) {
                speedMultiplier *= 1 + (haste.amplifier + 1) * 0.2
            }
            const fatigue = bot.entity.effects[4] // Mining fatigue
            if (fatigue) {
                const penalties = [0.3, 0.09, 0.0027, 0.00081]
                const level = Math.min(fatigue.amplifier, 3)
                speedMultiplier *= penalties[level]
            }
        }

        // In water penalty (if not aqua affinity)
        // On ground penalty
        // For simplicity, we use the standard formula:
        let damage = speedMultiplier / hardness

        // Check if the tool is correct for the block
        const canHarvest = _canHarvest(heldItem, block)
        if (canHarvest) {
            damage *= 30
        } else {
            damage /= 100
        }

        if (damage >= 1) return 0 // instant break

        const ticks = Math.ceil(1 / damage)
        return ticks * 50 // convert ticks to ms
    }

    /**
     * Check if a block can be dug.
     * @param {Block} block
     * @returns {boolean}
     */
    bot.canDigBlock = function (block) {
        if (!block) return false
        if (!block.diggable) return false
        if (block.hardness < 0) return false
        // Check distance (max reach = 5 blocks in survival)
        if (bot.entity) {
            const dist = bot.entity.position.distanceTo
                ? bot.entity.position.distanceTo(block.position)
                : Math.sqrt(
                    Math.pow(bot.entity.position.x - block.position.x, 2) +
                    Math.pow(bot.entity.position.y - block.position.y, 2) +
                    Math.pow(bot.entity.position.z - block.position.z, 2)
                )
            if (dist > 5) return false
        }
        return true
    }

    /**
     * Start digging a block. Resolves when the block is broken.
     * @param {Block} block - The block to dig
     * @param {boolean} [forceLook=true] - Look at the block before digging
     * @param {'auto'|'top'|'bottom'|'north'|'south'|'east'|'west'} [digFace='auto']
     * @returns {Promise<void>}
     */
    bot.dig = function (block, forceLook = true, digFace = 'auto') {
        return new Promise((resolve, reject) => {
            if (!block) {
                reject(new Error('No block specified'))
                return
            }
            if (!block.position) {
                reject(new Error('Block has no position'))
                return
            }
            if (bot._digging) {
                reject(new Error('Already digging'))
                return
            }
            if (!bot.canDigBlock(block)) {
                reject(new Error('Cannot dig this block'))
                return
            }

            // Look at the block
            if (forceLook && bot.lookAt) {
                bot.lookAt(block.position.offset
                    ? block.position.offset(0.5, 0.5, 0.5)
                    : { x: block.position.x + 0.5, y: block.position.y + 0.5, z: block.position.z + 0.5 }
                )
            }

            bot.targetDigBlock = block
            bot._digging = true
            _digResolve = resolve

            const face = _resolveFace(digFace)
            bot._digFace = face
            const pos = {
                x: Math.floor(block.position.x),
                y: Math.floor(block.position.y),
                z: Math.floor(block.position.z)
            }
            bot._digPos = pos

            // Send StartBreak
            bot.client.queue('player_action', {
                runtime_entity_id: bot._runtimeEntityId,
                action: 'start_break',
                position: pos,
                result_position: { x: 0, y: 0, z: 0 },
                face
            })

            bot.emit('diggingStarted', block)

            // Calculate dig time
            const digTimeMs = bot.digTime(block)

            if (digTimeMs <= 0) {
                // Instant break
                _finishDig(bot, block, pos, face, resolve)
                return
            }

            // Wait for dig time then complete
            bot._digTimer = setTimeout(() => {
                if (!bot._digging) return
                _finishDig(bot, block, pos, face, resolve)
            }, digTimeMs)
        })
    }

    /**
     * Stop digging the current block.
     */
    bot.stopDigging = function () {
        if (!bot._digging || !bot.targetDigBlock) return

        if (bot._digTimer) {
            clearTimeout(bot._digTimer)
            bot._digTimer = null
        }

        const block = bot.targetDigBlock
        const pos = bot._digPos || {
            x: Math.floor(block.position.x),
            y: Math.floor(block.position.y),
            z: Math.floor(block.position.z)
        }

        bot.client.queue('player_action', {
            runtime_entity_id: bot._runtimeEntityId,
            action: 'abort_break',
            position: pos,
            result_position: { x: 0, y: 0, z: 0 },
            face: 0
        })

        bot._digging = false
        bot.targetDigBlock = null
        bot._digFace = null
        bot._digPos = null
        _digResolve = null
        bot.emit('diggingAborted', block)
    }
}

// ---- Internal helpers ----

function _finishDig(bot, block, pos, face, resolve) {
    if (!bot._digging || bot.targetDigBlock !== block) return

    // Send StopBreak (crack animation complete)
    bot.client.queue('player_action', {
        runtime_entity_id: bot._runtimeEntityId,
        action: 'stop_break',
        position: pos,
        result_position: { x: 0, y: 0, z: 0 },
        face
    })

    // Send the actual break via inventory_transaction
    bot.client.queue('inventory_transaction', {
        transaction: {
            transaction_type: 2,
            actions: [],
            transaction_data: {
                action_type: 2,
                block_position: pos,
                face,
                hotbar_slot: bot.quickBarSlot ?? 0,
                held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                player_pos: bot.entity ? {
                    x: bot.entity.position.x,
                    y: bot.entity.position.y,
                    z: bot.entity.position.z
                } : { x: 0, y: 0, z: 0 },
                click_pos: { x: 0.5, y: 0.5, z: 0.5 },
                block_runtime_id: block.stateId || 0
            }
        }
    })

    bot._digging = false
    bot._digTimer = null
    bot.targetDigBlock = null
    bot._digFace = null
    bot._digPos = null
    const resolveFn = _digResolve
    _digResolve = null
    bot.emit('diggingCompleted', block)
    if (resolveFn) resolveFn()
}

function _resolveFace(face) {
    switch (face) {
        case 'bottom': return 0
        case 'top': return 1
        case 'north': return 2
        case 'south': return 3
        case 'west': return 4
        case 'east': return 5
        default: return 1 // auto = top
    }
}

function _getToolSpeed(item, block) {
    const name = item.name || ''
    // Simplified tool-material speed table
    if (name.includes('wooden')) return 2
    if (name.includes('stone') || name.includes('cobblestone')) return 4
    if (name.includes('iron')) return 6
    if (name.includes('diamond')) return 8
    if (name.includes('netherite')) return 9
    if (name.includes('golden') || name.includes('gold')) return 12
    return 1
}

function _canHarvest(item, block) {
    // Simplified: most blocks can be broken with anything
    // In reality, this depends on block material + tool type
    if (!block.material) return true
    const material = block.material
    if (material === 'rock' || material === 'iron' || material === 'diamond') {
        if (!item) return false
        const name = item.name || ''
        return name.includes('pickaxe')
    }
    return true
}

module.exports = diggingPlugin
