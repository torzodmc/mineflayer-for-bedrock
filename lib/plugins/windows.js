/**
 * Windows Plugin for bedrockflayer.
 *
 * Handles opening and closing containers (chests, furnaces, enchantment tables,
 * anvils, villager trades) via container_open/container_close packets.
 */

const Window = require('../classes/Window')
const Furnace = require('../classes/Furnace')
const Item = require('../classes/Item')

const CONTAINER_TYPES = {
    0: { name: 'container', slots: 27 },
    1: { name: 'workbench', slots: 10 },
    2: { name: 'furnace', slots: 3 },
    3: { name: 'enchantment', slots: 2 },
    4: { name: 'brewing_stand', slots: 5 },
    5: { name: 'anvil', slots: 3 },
    6: { name: 'dispenser', slots: 9 },
    7: { name: 'dropper', slots: 9 },
    8: { name: 'hopper', slots: 5 },
    9: { name: 'cauldron', slots: 0 },
    10: { name: 'minecart_chest', slots: 27 },
    11: { name: 'minecart_hopper', slots: 5 },
    12: { name: 'horse', slots: 2 },
    13: { name: 'beacon', slots: 1 },
    14: { name: 'structure_editor', slots: 0 },
    15: { name: 'trading', slots: 3 },
    16: { name: 'command_block', slots: 1 },
    17: { name: 'jukebox', slots: 1 },
    18: { name: 'armor', slots: 7 },
    19: { name: 'hand', slots: 1 },
    20: { name: 'compound_creator', slots: 9 },
    21: { name: 'element_constructor', slots: 15 },
    22: { name: 'material_reducer', slots: 15 },
    23: { name: 'lab_table', slots: 7 },
    24: { name: 'loom', slots: 4 },
    25: { name: 'lectern', slots: 1 },
    26: { name: 'grindstone', slots: 3 },
    27: { name: 'blast_furnace', slots: 3 },
    28: { name: 'smoker', slots: 3 },
    29: { name: 'stonecutter', slots: 2 },
    30: { name: 'cartography', slots: 3 },
    31: { name: 'hud', slots: 0 },
    32: { name: 'jigsaw_editor', slots: 0 },
    33: { name: 'smithing_table', slots: 3 },
    34: { name: 'chest_boat', slots: 27 },
    35: { name: 'decorated_pot', slots: 1 },
    36: { name: 'crafter', slots: 9 },
    37: { name: 'large_chest', slots: 54 },
    38: { name: 'shulker_box', slots: 27 },
    39: { name: 'barrel', slots: 27 }
}

function windowsPlugin(bot) {
    bot.currentWindow = null
    bot._pendingWindowResolve = null

    bot.client.on('container_open', (packet) => {
        const windowId = packet.window_id
        const windowType = packet.window_type
        const containerInfo = CONTAINER_TYPES[windowType] || { name: `container_${windowType}`, slots: 27 }

        let window
        if (containerInfo.name === 'furnace' || containerInfo.name === 'smoker' || containerInfo.name === 'blast_furnace') {
            window = new Furnace(windowId)
            window.type = containerInfo.name
        } else {
            window = new Window(windowId, containerInfo.name, containerInfo.name, containerInfo.slots)
        }

        if (packet.coordinates) {
            window.position = {
                x: packet.coordinates.x,
                y: packet.coordinates.y,
                z: packet.coordinates.z
            }
        }

        if (packet.runtime_entity_id !== undefined && packet.runtime_entity_id !== null) {
            window.entityRuntimeId = Number(packet.runtime_entity_id)
        }

        bot.currentWindow = window
        bot.emit('windowOpen', window)

        if (bot._pendingWindowResolve) {
            bot._pendingWindowResolve(window)
            bot._pendingWindowResolve = null
        }
    })

    bot.client.on('container_close', (packet) => {
        const window = bot.currentWindow
        if (window) {
            window.invalidate()
            bot.currentWindow = null
            bot.emit('windowClose', window)
        }
    })

    bot.on('_containerContent', (windowId, items) => {
        if (bot.currentWindow && bot.currentWindow.id === windowId) {
            for (let i = 0; i < items.length && i < bot.currentWindow.slotCount; i++) {
                bot.currentWindow.setSlot(i, Item.fromNetwork(items[i], bot._registry))
            }
            bot.emit('windowContentUpdated', bot.currentWindow)
        }
    })

    bot.on('_containerSlot', (windowId, slotIndex, item) => {
        if (bot.currentWindow && bot.currentWindow.id === windowId) {
            bot.currentWindow.setSlot(slotIndex, item)
            bot.emit('updateSlot', bot.currentWindow, slotIndex, item)
        }
    })

    bot.client.on('container_set_data', (packet) => {
        if (bot.currentWindow && bot.currentWindow.id === packet.window_id) {
            if (typeof bot.currentWindow.updateData === 'function') {
                bot.currentWindow.updateData(packet.property, packet.value)
            }
        }
    })

    bot.openContainer = function (block) {
        return new Promise((resolve, reject) => {
            bot._pendingWindowResolve = resolve

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 2,
                    actions: [],
                    transaction_data: {
                        action_type: 0, // click_block
                        block_position: {
                            x: Math.floor(block.position.x),
                            y: Math.floor(block.position.y),
                            z: Math.floor(block.position.z)
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
                        block_runtime_id: block.stateId || 0
                    }
                }
            })

            setTimeout(() => {
                if (bot._pendingWindowResolve === resolve) {
                    bot._pendingWindowResolve = null
                    reject(new Error('Timed out waiting for container to open'))
                }
            }, 5000)
        })
    }

    bot.openChest = function (block) {
        return bot.openContainer(block)
    }

    bot.openFurnace = function (block) {
        return bot.openContainer(block)
    }

    bot.openVillager = function (villager) {
        return new Promise((resolve, reject) => {
            bot._pendingWindowResolve = resolve

            // Interact with villager via inventory_transaction (item_use_on_entity)
            // The interact packet only supports action_ids 3-6 (leave_vehicle, mouse_over, npc_open, open_inventory)
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
                        entity_runtime_id: villager.id,
                        action_type: 0, // interact (right-click)
                        hotbar_slot: bot.quickBarSlot ?? 0,
                        held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                        player_pos: playerPos,
                        click_pos: {
                            x: villager.position.x,
                            y: villager.position.y + (villager.height || 1) * 0.5,
                            z: villager.position.z
                        }
                    }
                }
            })

            setTimeout(() => {
                if (bot._pendingWindowResolve === resolve) {
                    bot._pendingWindowResolve = null
                    reject(new Error('Timed out waiting for villager window'))
                }
            }, 5000)
        })
    }

    bot.closeWindow = function (window) {
        const target = window || bot.currentWindow
        if (!target) return

        bot.client.queue('container_close', {
            window_id: target.id,
            window_type: target.type || 0,
            server: false
        })

        target.invalidate()
        bot.currentWindow = null
        bot.emit('windowClose', target)
    }

    bot.deposit = async function (itemType, metadata, count) {
        if (!bot.currentWindow) throw new Error('No window open')
        if (!bot.currentWindow.isValid()) throw new Error('Window no longer valid')

        let remaining = count || Infinity
        const slots = bot.inventory.findAll(itemType, metadata)

        for (const { slot, item } of slots) {
            if (remaining <= 0) break
            const destSlot = bot.currentWindow.findEmptySlot()
            if (destSlot === -1) break

            const toMove = Math.min(remaining, item.count)

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 0,
                    actions: [
                        {
                            source_type: 0,
                            inventory_id: 0,
                            slot,
                            old_item: item.toNetwork(),
                            new_item: toMove >= item.count
                                ? { network_id: 0 }
                                : { ...item.toNetwork(), count: item.count - toMove }
                        },
                        {
                            source_type: 0,
                            inventory_id: bot.currentWindow.id,
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

    bot.withdraw = async function (itemType, metadata, count) {
        if (!bot.currentWindow) throw new Error('No window open')
        if (!bot.currentWindow.isValid()) throw new Error('Window no longer valid')

        let remaining = count || Infinity
        const slots = bot.currentWindow.findAll(itemType, metadata)

        for (const { slot, item } of slots) {
            if (remaining <= 0) break
            const destSlot = bot.inventory.findEmptySlot()
            if (destSlot === -1) break

            const toMove = Math.min(remaining, item.count)

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 0,
                    actions: [
                        {
                            source_type: 0,
                            inventory_id: bot.currentWindow.id,
                            slot,
                            old_item: item.toNetwork(),
                            new_item: toMove >= item.count
                                ? { network_id: 0 }
                                : { ...item.toNetwork(), count: item.count - toMove }
                        },
                        {
                            source_type: 0,
                            inventory_id: 0,
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