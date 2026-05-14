/**
 * Placing Plugin for bedrockflayer.
 *
 * Handles block and entity placement using inventory_transaction packets.
 */

function placingPlugin(bot) {
    const PLACEMENT_RANGE = 5

    /**
     * Place a block against a reference block face.
     * @param {Block} referenceBlock - The block to place against
     * @param {Vec3} faceVector - Direction vector of the face (e.g., {x:0,y:1,z:0} for top)
     * @returns {Promise<void>}
     */
    bot.placeBlock = function (referenceBlock, faceVector) {
        return new Promise((resolve, reject) => {
            if (!referenceBlock) return reject(new Error('No reference block'))
            if (!referenceBlock.position) return reject(new Error('Reference block has no position'))
            if (!bot.heldItem) return reject(new Error('No item in hand'))

            if (!faceVector || typeof faceVector.x !== 'number' || typeof faceVector.y !== 'number' || typeof faceVector.z !== 'number') {
                return reject(new Error('faceVector must have x, y, z properties'))
            }

            if (bot.entity) {
                const dx = referenceBlock.position.x - bot.entity.position.x
                const dy = referenceBlock.position.y - bot.entity.position.y
                const dz = referenceBlock.position.z - bot.entity.position.z
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
                if (distance > PLACEMENT_RANGE) {
                    return reject(new Error(`Block too far away: ${distance.toFixed(2)} > ${PLACEMENT_RANGE}`))
                }
            }

            const targetPos = {
                x: referenceBlock.position.x + (faceVector.x ?? 0) * 0.5 + 0.5,
                y: referenceBlock.position.y + (faceVector.y ?? 0) * 0.5 + 0.5,
                z: referenceBlock.position.z + (faceVector.z ?? 0) * 0.5 + 0.5
            }
            if (bot.lookAt) bot.lookAt(targetPos, true)

            const face = _vectorToFace(faceVector)

            let resolved = false

            const cleanup = () => {
                clearTimeout(timeout)
                bot.removeListener('inventoryUpdated', onInvUpdate)
                bot.removeListener('updateSlot', onSlotUpdate)
                bot.removeListener('disconnect', onDisconnect)
            }

            const onDisconnect = () => {
                cleanup()
                reject(new Error('Disconnected'))
            }

            const onInvUpdate = () => {
                if (resolved) return
                resolved = true
                cleanup()
                bot.emit('blockPlaced', referenceBlock, faceVector)
                resolve()
            }

            const onSlotUpdate = (window, slot) => {
                if (resolved) return
                if (slot === (bot.quickBarSlot ?? 0)) {
                    resolved = true
                    cleanup()
                    bot.emit('blockPlaced', referenceBlock, faceVector)
                    resolve()
                }
            }

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 2,
                    actions: [],
                    transaction_data: {
                        action_type: 0,
                        block_position: {
                            x: Math.floor(referenceBlock.position.x),
                            y: Math.floor(referenceBlock.position.y),
                            z: Math.floor(referenceBlock.position.z)
                        },
                        face,
                        hotbar_slot: bot.quickBarSlot ?? 0,
                        held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                        player_pos: bot.entity ? {
                            x: bot.entity.position.x,
                            y: bot.entity.position.y,
                            z: bot.entity.position.z
                        } : { x: 0, y: 0, z: 0 },
                        click_pos: {
                            x: faceVector.x != null ? Math.abs(faceVector.x) * 0.5 + 0.5 : 0.5,
                            y: faceVector.y != null ? Math.abs(faceVector.y) * 0.5 + 0.5 : 0.5,
                            z: faceVector.z != null ? Math.abs(faceVector.z) * 0.5 + 0.5 : 0.5
                        },
                        block_runtime_id: referenceBlock.stateId ?? 0
                    }
                }
            })

            const timeout = setTimeout(() => {
                if (!resolved) {
                    cleanup()
                    reject(new Error('Block placement timeout'))
                }
            }, 5000)

            bot.on('inventoryUpdated', onInvUpdate)
            bot.on('updateSlot', onSlotUpdate)
            bot.on('disconnect', onDisconnect)
        })
    }

    /**
     * Place an entity (boat, minecart, armor stand, etc.).
     * @param {Block} referenceBlock
     * @param {Vec3} faceVector
     * @returns {Promise<void>}
     */
    bot.placeEntity = function (referenceBlock, faceVector) {
        return new Promise((resolve, reject) => {
            if (!referenceBlock) return reject(new Error('No reference block'))
            if (!referenceBlock.position) return reject(new Error('Reference block has no position'))
            if (!bot.heldItem) return reject(new Error('No item in hand'))

            if (!faceVector || typeof faceVector.x !== 'number' || typeof faceVector.y !== 'number' || typeof faceVector.z !== 'number') {
                return reject(new Error('faceVector must have x, y, z properties'))
            }

            if (bot.entity) {
                const dx = referenceBlock.position.x - bot.entity.position.x
                const dy = referenceBlock.position.y - bot.entity.position.y
                const dz = referenceBlock.position.z - bot.entity.position.z
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
                if (distance > PLACEMENT_RANGE) {
                    return reject(new Error(`Entity too far away: ${distance.toFixed(2)} > ${PLACEMENT_RANGE}`))
                }
            }

            const targetPos = {
                x: referenceBlock.position.x + (faceVector.x ?? 0) * 0.5 + 0.5,
                y: referenceBlock.position.y + (faceVector.y ?? 0) * 0.5 + 0.5,
                z: referenceBlock.position.z + (faceVector.z ?? 0) * 0.5 + 0.5
            }
            if (bot.lookAt) bot.lookAt(targetPos, true)

            const face = _vectorToFace(faceVector)

            let resolved = false
            const cleanup = () => {
                clearTimeout(timeout)
                bot.removeListener('inventoryUpdated', onInvUpdate)
                bot.removeListener('updateSlot', onSlotUpdate)
                bot.removeListener('disconnect', onDisconnect)
            }

            const timeout = setTimeout(() => {
                cleanup()
                reject(new Error('Entity placement timeout'))
            }, 5000)

            const onDisconnect = () => {
                cleanup()
                reject(new Error('Disconnected'))
            }

            const onInvUpdate = () => {
                if (resolved) return
                resolved = true
                cleanup()
                bot.emit('entityPlaced', referenceBlock, faceVector)
                resolve()
            }

            const onSlotUpdate = (window, slot) => {
                if (resolved) return
                if (slot === (bot.quickBarSlot ?? 0)) {
                    resolved = true
                    cleanup()
                    bot.emit('entityPlaced', referenceBlock, faceVector)
                    resolve()
                }
            }

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 2,
                    actions: [],
                    transaction_data: {
                        action_type: 1,
                        block_position: {
                            x: Math.floor(referenceBlock.position.x),
                            y: Math.floor(referenceBlock.position.y),
                            z: Math.floor(referenceBlock.position.z)
                        },
                        face,
                        hotbar_slot: bot.quickBarSlot ?? 0,
                        held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                        player_pos: bot.entity ? {
                            x: bot.entity.position.x,
                            y: bot.entity.position.y,
                            z: bot.entity.position.z
                        } : { x: 0, y: 0, z: 0 },
                        click_pos: {
                            x: faceVector.x != null ? Math.abs(faceVector.x) * 0.5 + 0.5 : 0.5,
                            y: faceVector.y != null ? Math.abs(faceVector.y) * 0.5 + 0.5 : 0.5,
                            z: faceVector.z != null ? Math.abs(faceVector.z) * 0.5 + 0.5 : 0.5
                        },
                        block_runtime_id: referenceBlock.stateId ?? 0
                    }
                }
            })

            bot.on('inventoryUpdated', onInvUpdate)
            bot.on('updateSlot', onSlotUpdate)
            bot.on('disconnect', onDisconnect)
        })
    }

    bot.on('disconnect', () => {
        bot.removeAllListeners('inventoryUpdated')
    })
}

function _vectorToFace(vec) {
    if (!vec) return 1
    const ax = Math.abs(vec.x)
    const ay = Math.abs(vec.y)
    const az = Math.abs(vec.z)
    if (ay > ax && ay > az) {
        return vec.y < 0 ? 0 : 1
    }
    if (az > ax && az > ay) {
        return vec.z < 0 ? 2 : 3
    }
    return vec.x < 0 ? 4 : 5
}

module.exports = placingPlugin
