/**
 * Windows Plugin for bedrockflayer.
 *
 * Handles opening and closing containers (chests, furnaces, enchantment tables,
 * anvils, villager trades) via container_open/container_close packets.
 */

const Window = require('../classes/Window')
const Furnace = require('../classes/Furnace')
const Item = require('../classes/Item')

// Bedrock container type IDs → friendly names and slot counts
const CONTAINER_TYPES = {
    0: { name: 'inventory', slots: 41 },
    1: { name: 'chest', slots: 27 },
    2: { name: 'large_chest', slots: 54 },
    3: { name: 'furnace', slots: 3 },
    4: { name: 'enchantment_table', slots: 2 },
    5: { name: 'brewing_stand', slots: 5 },
    6: { name: 'anvil', slots: 3 },
    7: { name: 'dispenser', slots: 9 },
    8: { name: 'dropper', slots: 9 },
    9: { name: 'hopper', slots: 5 },
    12: { name: 'beacon', slots: 1 },
    15: { name: 'villager', slots: 3 },
    16: { name: 'horse', slots: 2 },
    21: { name: 'shulker_box', slots: 27 },
    23: { name: 'barrel', slots: 27 },
    24: { name: 'smoker', slots: 3 },
    25: { name: 'blast_furnace', slots: 3 },
    26: { name: 'cartography_table', slots: 3 },
    27: { name: 'grindstone', slots: 3 },
    28: { name: 'stonecutter', slots: 2 },
    33: { name: 'smithing_table', slots: 3 },
    34: { name: 'crafting_table', slots: 10 }
}

function windowsPlugin(bot) {
    // ---- State ----
    bot.currentWindow = null
    bot._pendingWindowResolve = null

    // ---- Container Open ----
    bot.client.on('container_open', (packet) => {
        const windowId = packet.window_id
        const typeId = packet.type || 0
        const containerInfo = CONTAINER_TYPES[typeId] || { name: `container_${typeId}`, slots: 27 }

        let window
        if (containerInfo.name === 'furnace' || containerInfo.name === 'smoker' || containerInfo.name === 'blast_furnace') {
            window = new Furnace(windowId)
            window.type = containerInfo.name
        } else {
            window = new Window(windowId, containerInfo.name, containerInfo.name, containerInfo.slots)
        }

        // Store position if available
        if (packet.coordinates) {
            window.position = {
                x: packet.coordinates.x,
                y: packet.coordinates.y,
                z: packet.coordinates.z
            }
        }

        bot.currentWindow = window
        bot.emit('windowOpen', window)

        // Resolve pending open promise
        if (bot._pendingWindowResolve) {
            bot._pendingWindowResolve(window)
            bot._pendingWindowResolve = null
        }
    })

    // ---- Container Close ----
    bot.client.on('container_close', (packet) => {
        const window = bot.currentWindow
        if (window) {
            bot.currentWindow = null
            bot.emit('windowClose', window)
        }
    })

    // ---- Container content (forwarded from inventory plugin) ----
    bot.on('_containerContent', (windowId, items) => {
        if (bot.currentWindow && bot.currentWindow.id === windowId) {
            for (let i = 0; i < items.length && i < bot.currentWindow.slotCount; i++) {
                bot.currentWindow.setSlot(i, Item.fromNetwork(items[i], bot._registry))
            }
            bot.emit('windowContentUpdated', bot.currentWindow)
        }
    })

    // ---- Container slot update ----
    bot.on('_containerSlot', (windowId, slotIndex, item) => {
        if (bot.currentWindow && bot.currentWindow.id === windowId) {
            bot.currentWindow.setSlot(slotIndex, item)
            bot.emit('updateSlot', bot.currentWindow, slotIndex, item)
        }
    })

    // ---- Container set data (furnace fuel/progress) ----
    bot.client.on('container_set_data', (packet) => {
        if (bot.currentWindow && bot.currentWindow.id === packet.window_id) {
            if (typeof bot.currentWindow.updateData === 'function') {
                bot.currentWindow.updateData(packet.property, packet.value)
            }
        }
    })

    // ============================================================
    //  Methods
    // ============================================================

    /**
     * Open a container by interacting with a block.
     * @param {Block} block - The container block (chest, furnace, etc.)
     * @returns {Promise<Window>}
     */
    bot.openContainer = function (block) {
        return new Promise((resolve, reject) => {
            bot._pendingWindowResolve = resolve

            // Send interact packet to open container
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
                        face: 1, // Top face
                        hotbar_slot: bot.quickBarSlot,
                        held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                        player_position: {
                            x: bot.entity.position.x,
                            y: bot.entity.position.y,
                            z: bot.entity.position.z
                        },
                        click_position: { x: 0.5, y: 1, z: 0.5 },
                        block_runtime_id: block.stateId || 0
                    }
                }
            })

            // Timeout after 5 seconds
            setTimeout(() => {
                if (bot._pendingWindowResolve === resolve) {
                    bot._pendingWindowResolve = null
                    reject(new Error('Timed out waiting for container to open'))
                }
            }, 5000)
        })
    }

    /**
     * Open a chest.
     * @param {Block} block
     * @returns {Promise<Window>}
     */
    bot.openChest = function (block) {
        return bot.openContainer(block)
    }

    /**
     * Open a furnace.
     * @param {Block} block
     * @returns {Promise<Furnace>}
     */
    bot.openFurnace = function (block) {
        return bot.openContainer(block)
    }

    /**
     * Open a villager trade window.
     * @param {Entity} villager
     * @returns {Promise<Window>}
     */
    bot.openVillager = function (villager) {
        return new Promise((resolve, reject) => {
            bot._pendingWindowResolve = resolve

            bot.client.queue('interact', {
                target_entity_id: villager.id,
                action_id: 0 // Interact
            })

            setTimeout(() => {
                if (bot._pendingWindowResolve === resolve) {
                    bot._pendingWindowResolve = null
                    reject(new Error('Timed out waiting for villager window'))
                }
            }, 5000)
        })
    }

    /**
     * Close the currently open window.
     * @param {Window} [window] - Window to close (defaults to currentWindow)
     */
    bot.closeWindow = function (window) {
        const target = window || bot.currentWindow
        if (!target) return

        bot.client.queue('container_close', {
            window_id: target.id,
            server: false
        })

        bot.currentWindow = null
        bot.emit('windowClose', target)
    }

    /**
     * Deposit items from inventory into the currently open container.
     * @param {number} itemType
     * @param {number} [metadata]
     * @param {number} [count] - null = all
     * @returns {Promise<void>}
     */
    bot.deposit = async function (itemType, metadata, count) {
        if (!bot.currentWindow) throw new Error('No window open')

        let remaining = count || Infinity
        const slots = bot.inventory.findAll(itemType, metadata)

        for (const { slot, item } of slots) {
            if (remaining <= 0) break
            const destSlot = bot.currentWindow.findEmptySlot()
            if (destSlot === -1) break

            const toMove = Math.min(remaining, item.count)

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 'normal',
                    transactions: [
                        {
                            source_type: 'container',
                            window_id: 0,
                            source_flags: 0,
                            slot,
                            old_item: item.toNetwork(),
                            new_item: toMove >= item.count
                                ? { network_id: 0 }
                                : { ...item.toNetwork(), count: item.count - toMove }
                        },
                        {
                            source_type: 'container',
                            window_id: bot.currentWindow.id,
                            source_flags: 0,
                            slot: destSlot,
                            old_item: { network_id: 0 },
                            new_item: { ...item.toNetwork(), count: toMove }
                        }
                    ]
                }
            })

            remaining -= toMove
        }
    }

    /**
     * Withdraw items from the currently open container into inventory.
     * @param {number} itemType
     * @param {number} [metadata]
     * @param {number} [count]
     * @returns {Promise<void>}
     */
    bot.withdraw = async function (itemType, metadata, count) {
        if (!bot.currentWindow) throw new Error('No window open')

        let remaining = count || Infinity
        const slots = bot.currentWindow.findAll(itemType, metadata)

        for (const { slot, item } of slots) {
            if (remaining <= 0) break
            const destSlot = bot.inventory.findEmptySlot()
            if (destSlot === -1) break

            const toMove = Math.min(remaining, item.count)

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 'normal',
                    transactions: [
                        {
                            source_type: 'container',
                            window_id: bot.currentWindow.id,
                            source_flags: 0,
                            slot,
                            old_item: item.toNetwork(),
                            new_item: toMove >= item.count
                                ? { network_id: 0 }
                                : { ...item.toNetwork(), count: item.count - toMove }
                        },
                        {
                            source_type: 'container',
                            window_id: 0,
                            source_flags: 0,
                            slot: destSlot,
                            old_item: { network_id: 0 },
                            new_item: { ...item.toNetwork(), count: toMove }
                        }
                    ]
                }
            })

            remaining -= toMove
        }
    }
}

module.exports = windowsPlugin
