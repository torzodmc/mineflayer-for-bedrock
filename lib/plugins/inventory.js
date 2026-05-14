/**
 * Inventory Plugin for bedrockflayer.
 *
 * Tracks the bot's own inventory (36 slots + armor + offhand),
 * handles inventory sync packets, and provides equip/toss/transfer methods.
 *
 * Bedrock inventory slot layout (within player inventory window):
 *   0–8:   Hotbar
 *   9–35:  Main inventory
 *
 * Armor is in a SEPARATE window (window_id 120 per Bedrock protocol)
 * with slot mapping: 0=Mainhand, 1=Offhand, 2=Helmet, 3=Chest, 4=Legs, 5=Feet, 6=Body
 *
 * Offhand is also separately tracked via window_id 119.
 */

const Window = require('../classes/Window')
const Item = require('../classes/Item')

const HOTBAR_START = 0
const HOTBAR_END = 8
const INVENTORY_START = 9
const INVENTORY_END = 35
const OFFHAND_PLAYER_SLOT = 40
const TOTAL_PLAYER_SLOTS = 41

const PLAYER_ARMOR_WINDOW_ID = 120
const PLAYER_OFFHAND_WINDOW_ID = 119

function inventoryPlugin(bot) {
    bot.inventory = new Window(0, 'inventory', 'Inventory', TOTAL_PLAYER_SLOTS)
    bot.heldItem = null
    bot.quickBarSlot = 0

    bot.client.on('inventory_content', (packet) => {
        const windowId = packet.window_id
        const containerId = packet.container?.container_id
        const items = packet.input || []

        if (containerId === 'inventory' || windowId === 0) {
            _syncPlayerInventory(bot, items)
        } else if (containerId === 'hotbar' || windowId === 122) {
            _syncHotbar(bot, items)
        } else if (containerId === 'armor' || windowId === PLAYER_ARMOR_WINDOW_ID) {
            _syncArmor(bot, items)
        } else if (containerId === 'offhand' || windowId === PLAYER_OFFHAND_WINDOW_ID) {
            if (items.length > 0) {
                const item = Item.fromNetwork(items[0], bot._registry)
                bot.inventory.setSlot(OFFHAND_PLAYER_SLOT, item)
                if (bot.quickBarSlot >= 0 && bot.quickBarSlot <= 8) {
                    const hotbarItem = bot.inventory.slots[bot.quickBarSlot]
                    bot.heldItem = hotbarItem || null
                }
            }
        } else {
            bot.emit('_containerContent', windowId, items)
        }

        bot.emit('inventoryUpdated')
    })

    bot.client.on('inventory_slot', (packet) => {
        const windowId = packet.window_id
        const containerId = packet.container?.container_id
        const slotIndex = packet.slot ?? 0
        const item = Item.fromNetwork(packet.item, bot._registry)

        if (containerId === 'inventory' || windowId === 0) {
            bot.inventory.setSlot(slotIndex, item)
            bot.emit('updateSlot', bot.inventory, slotIndex, item)
            if (slotIndex === bot.quickBarSlot) {
                bot.heldItem = item
            }
        } else if (containerId === 'hotbar' || windowId === 122) {
            if (slotIndex >= 0 && slotIndex <= 8) {
                bot.inventory.setSlot(slotIndex, item)
                bot.emit('updateSlot', bot.inventory, slotIndex, item)
                if (slotIndex === bot.quickBarSlot) {
                    bot.heldItem = item
                }
            }
        } else if (containerId === 'armor' || windowId === PLAYER_ARMOR_WINDOW_ID) {
            if (slotIndex >= 2 && slotIndex <= 6) {
                const armorIndex = slotIndex - 2
                const armorSlot = 36 + armorIndex
                bot.inventory.setSlot(armorSlot, item)
                bot.emit('updateSlot', bot.inventory, armorSlot, item)
            }
        } else if (containerId === 'offhand' || windowId === PLAYER_OFFHAND_WINDOW_ID) {
            bot.inventory.setSlot(OFFHAND_PLAYER_SLOT, item)
            bot.emit('updateSlot', bot.inventory, OFFHAND_PLAYER_SLOT, item)
        } else {
            bot.emit('_containerSlot', windowId, slotIndex, item)
        }
    })

    bot.client.on('player_hotbar', (packet) => {
        const slot = packet.selected_slot ?? 0
        if (slot < 0 || slot > 8) return
        bot.quickBarSlot = slot
        bot.heldItem = bot.inventory.slots[slot] || null
        bot.emit('heldItemChanged', bot.heldItem)
    })

    bot.client.on('mob_armor_equipment', (packet) => {
        const slotMap = [
            { slot: 36, item: packet.helmet },
            { slot: 37, item: packet.chestplate },
            { slot: 38, item: packet.leggings },
            { slot: 39, item: packet.boots }
        ]
        for (const { slot, item } of slotMap) {
            if (item) {
                const parsedItem = Item.fromNetwork(item, bot._registry)
                bot.inventory.setSlot(slot, parsedItem)
                bot.emit('updateSlot', bot.inventory, slot, parsedItem)
            }
        }
    })

    bot.setQuickBarSlot = function (slot) {
        if (slot < 0 || slot > 8) return
        bot.quickBarSlot = slot
        bot.heldItem = bot.inventory.slots[slot] || null

        bot.client.queue('mob_equipment', {
            runtime_entity_id: bot._runtimeEntityId,
            item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
            slot: slot,
            selected_slot: slot,
            window_id: 0
        })

        bot.emit('heldItemChanged', bot.heldItem)
    }

    bot.equip = async function (item, destination) {
        try {
            if (!item) throw new Error('No item provided')
            const srcSlot = bot.inventory.findItemSlot(item.type, item.metadata)
            if (srcSlot === -1) throw new Error(`Item ${item.name} not in inventory`)

            let destSlot
            switch (destination) {
                case 'hand': destSlot = bot.quickBarSlot; break
                case 'head': destSlot = 36; break
                case 'torso': destSlot = 37; break
                case 'legs': destSlot = 38; break
                case 'feet': destSlot = 39; break
                case 'off-hand': destSlot = OFFHAND_PLAYER_SLOT; break
                default: throw new Error(`Unknown destination: ${destination}`)
            }

            await bot.moveSlotItem(srcSlot, destSlot)
        } catch (err) {
            throw err
        }
    }

    bot.unequip = async function (destination) {
        try {
            let srcSlot
            switch (destination) {
                case 'hand': srcSlot = bot.quickBarSlot; break
                case 'head': srcSlot = 36; break
                case 'torso': srcSlot = 37; break
                case 'legs': srcSlot = 38; break
                case 'feet': srcSlot = 39; break
                case 'off-hand': srcSlot = OFFHAND_PLAYER_SLOT; break
                default: throw new Error(`Unknown destination: ${destination}`)
            }

            const emptySlot = bot.inventory.findEmptySlot()
            if (emptySlot === -1) throw new Error('No empty slot available')
            await bot.moveSlotItem(srcSlot, emptySlot)
        } catch (err) {
            throw err
        }
    }

    bot.moveSlotItem = async function (srcSlot, destSlot) {
        return new Promise((resolve, reject) => {
            const srcItem = bot.inventory.slots[srcSlot]
            const destItem = bot.inventory.slots[destSlot]

            const timeout = setTimeout(() => {
                bot.removeListener('updateSlot', onSlotUpdate)
                bot.removeListener('disconnect', onDisconnect)
                reject(new Error('Inventory transaction timeout'))
            }, 5000)

            const onDisconnect = () => {
                clearTimeout(timeout)
                reject(new Error('Disconnected'))
            }

            const onSlotUpdate = (window, slot) => {
                if (slot === srcSlot || slot === destSlot) {
                    clearTimeout(timeout)
                    bot.removeListener('updateSlot', onSlotUpdate)
                    bot.removeListener('disconnect', onDisconnect)

                    if (srcSlot === bot.quickBarSlot || destSlot === bot.quickBarSlot) {
                        bot.heldItem = bot.inventory.slots[bot.quickBarSlot] || null
                    }
                    resolve()
                }
            }

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 0,
                    actions: [
                        {
                            source_type: 0,
                            inventory_id: 0,
                            slot: srcSlot,
                            old_item: srcItem ? srcItem.toNetwork() : { network_id: 0 },
                            new_item: destItem ? destItem.toNetwork() : { network_id: 0 }
                        },
                        {
                            source_type: 0,
                            inventory_id: 0,
                            slot: destSlot,
                            old_item: destItem ? destItem.toNetwork() : { network_id: 0 },
                            new_item: srcItem ? srcItem.toNetwork() : { network_id: 0 }
                        }
                    ]
                }
            })

            bot.on('updateSlot', onSlotUpdate)
            bot.on('disconnect', onDisconnect)
        })
    }

    bot.toss = async function (itemType, metadata, count) {
        try {
            let remaining = count || Infinity
            const slots = bot.inventory.findAll(itemType, metadata)

            for (const { slot, item } of slots) {
                if (remaining <= 0) break
                const toDrop = Math.min(remaining, item.count)
                await _sendDropItem(bot, slot, toDrop)
                remaining -= toDrop
            }
        } catch (err) {
            throw err
        }
    }

    bot.tossStack = async function (item) {
        try {
            const slot = bot.inventory.findItemSlot(item.type, item.metadata)
            if (slot === -1) return
            await _sendDropItem(bot, slot, item.count)
        } catch (err) {
            throw err
        }
    }

    const cleanup = () => {
        bot.client.removeAllListeners('inventory_content')
        bot.client.removeAllListeners('inventory_slot')
        bot.client.removeAllListeners('player_hotbar')
        bot.client.removeAllListeners('mob_armor_equipment')
        bot.inventory = null
        bot.heldItem = null
    }
    bot.on('disconnect', cleanup)
    bot.once('close', cleanup)
}

function _syncPlayerInventory(bot, items) {
    for (let i = 0; i < items.length && i < TOTAL_PLAYER_SLOTS; i++) {
        const item = Item.fromNetwork(items[i], bot._registry)
        bot.inventory.setSlot(i, item)
    }
    bot.heldItem = bot.inventory.slots[bot.quickBarSlot] || null
}

function _syncHotbar(bot, items) {
    for (let i = 0; i < items.length && i <= HOTBAR_END; i++) {
        const item = Item.fromNetwork(items[i], bot._registry)
        bot.inventory.setSlot(HOTBAR_START + i, item)
    }
    bot.heldItem = bot.inventory.slots[bot.quickBarSlot] || null
}

function _syncArmor(bot, items) {
    for (let i = 0; i < items.length && i < 7; i++) {
        if (i >= 2 && i <= 5) {
            const item = Item.fromNetwork(items[i], bot._registry)
            bot.inventory.setSlot(36 + (i - 2), item)
        }
    }
}

function _sendDropItem(bot, slot, count) {
    return new Promise((resolve, reject) => {
        const item = bot.inventory.slots[slot]
        if (!item) {
            reject(new Error('No item in slot'))
            return
        }

        const timeout = setTimeout(() => {
            bot.removeListener('updateSlot', onSlotUpdate)
            bot.removeListener('disconnect', onDisconnect)
            reject(new Error('Drop transaction timeout'))
        }, 5000)

        const onDisconnect = () => {
            clearTimeout(timeout)
            reject(new Error('Disconnected'))
        }

        const onSlotUpdate = (window, updatedSlot) => {
            if (updatedSlot === slot) {
                clearTimeout(timeout)
                bot.removeListener('updateSlot', onSlotUpdate)
                bot.removeListener('disconnect', onDisconnect)
                resolve()
            }
        }

        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 2,
                actions: [
                    {
                        source_type: 2,
                        flags: 0,
                        slot: 0,
                        old_item: { network_id: 0 },
                        new_item: { ...item.toNetwork(), count }
                    }
                ],
                transaction_data: {
                    action_type: 0,
                    block_position: { x: 0, y: 0, z: 0 },
                    face: -1,
                    hotbar_slot: bot.quickBarSlot,
                    held_item: item.toNetwork(),
                    player_pos: bot.entity ? {
                        x: bot.entity.position.x,
                        y: bot.entity.position.y,
                        z: bot.entity.position.z
                    } : { x: 0, y: 0, z: 0 },
                    click_pos: { x: 0, y: 0, z: 0 },
                    block_runtime_id: 0
                }
            }
        })

        bot.on('updateSlot', onSlotUpdate)
        bot.on('disconnect', onDisconnect)
    })
}

module.exports = inventoryPlugin