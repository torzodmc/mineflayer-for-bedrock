/**
 * Placing Plugin for bedrockflayer.
 *
 * Handles block and entity placement using inventory_transaction packets.
 */

function placingPlugin(bot) {
    /**
     * Place a block against a reference block face.
     * @param {Block} referenceBlock - The block to place against
     * @param {Vec3} faceVector - Direction vector of the face (e.g., {x:0,y:1,z:0} for top)
     * @returns {Promise<void>}
     */
    bot.placeBlock = function (referenceBlock, faceVector) {
        return new Promise((resolve, reject) => {
            if (!referenceBlock) return reject(new Error('No reference block'))
            if (!bot.heldItem) return reject(new Error('No item in hand'))

            // Look at the target face
            const targetPos = {
                x: referenceBlock.position.x + (faceVector.x || 0) * 0.5 + 0.5,
                y: referenceBlock.position.y + (faceVector.y || 0) * 0.5 + 0.5,
                z: referenceBlock.position.z + (faceVector.z || 0) * 0.5 + 0.5
            }
            if (bot.lookAt) bot.lookAt(targetPos)

            const face = _vectorToFace(faceVector)

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 'item_use',
                    transaction_data: {
                        action_type: 0, // Click block (place)
                        block_position: {
                            x: Math.floor(referenceBlock.position.x),
                            y: Math.floor(referenceBlock.position.y),
                            z: Math.floor(referenceBlock.position.z)
                        },
                        face,
                        hotbar_slot: bot.quickBarSlot || 0,
                        held_item: bot.heldItem.toNetwork(),
                        player_position: bot.entity ? {
                            x: bot.entity.position.x,
                            y: bot.entity.position.y,
                            z: bot.entity.position.z
                        } : { x: 0, y: 0, z: 0 },
                        click_position: {
                            x: faceVector.x !== undefined ? Math.abs(faceVector.x) * 0.5 + 0.5 : 0.5,
                            y: faceVector.y !== undefined ? Math.abs(faceVector.y) * 0.5 + 0.5 : 0.5,
                            z: faceVector.z !== undefined ? Math.abs(faceVector.z) * 0.5 + 0.5 : 0.5
                        },
                        block_runtime_id: referenceBlock.stateId || 0
                    }
                }
            })

            // Reduce held item count (optimistic)
            if (bot.heldItem) {
                bot.heldItem.count--
                if (bot.heldItem.count <= 0) {
                    bot.heldItem = null
                    if (bot.inventory) {
                        bot.inventory.clearSlot(bot.quickBarSlot)
                    }
                }
            }

            bot.emit('blockPlaced', referenceBlock, faceVector)
            resolve()
        })
    }

    /**
     * Place an entity (boat, minecart, armor stand, etc.).
     * @param {Block} referenceBlock
     * @param {Vec3} faceVector
     * @returns {Promise<void>}
     */
    bot.placeEntity = function (referenceBlock, faceVector) {
        // Same packet format as placeBlock for Bedrock
        return bot.placeBlock(referenceBlock, faceVector)
    }
}

function _vectorToFace(vec) {
    if (!vec) return 1
    if (vec.y === -1) return 0 // bottom
    if (vec.y === 1) return 1  // top
    if (vec.z === -1) return 2 // north
    if (vec.z === 1) return 3  // south
    if (vec.x === -1) return 4 // west
    if (vec.x === 1) return 5  // east
    return 1 // default top
}

module.exports = placingPlugin
