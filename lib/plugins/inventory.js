/**
 * Inventory Plugin for bedrockflayer.
 *
 * Tracks the bot's own inventory (36 slots + armor + offhand),
 * handles inventory sync packets, and provides equip/toss/transfer methods.
 *
 * Bedrock inventory slot layout:
 *   0–8:   Hotbar
 *   9–35:  Main inventory
 *   36–39: Armor (helmet, chestplate, leggings, boots)
 *   40:    Offhand
 */

const Window = require('../classes/Window')
const Item = require('../classes/Item')

const HOTBAR_START = 0
const HOTBAR_END = 8
const INVENTORY_START = 9
const INVENTORY_END = 35
const ARMOR_HELMET = 36
const ARMOR_CHESTPLATE = 37
const ARMOR_LEGGINGS = 38
const ARMOR_BOOTS = 39
const OFFHAND = 40
const TOTAL_SLOTS = 41

function inventoryPlugin(bot) {
    // ---- State ----
    bot.inventory = new Window(0, 'inventory', 'Inventory', TOTAL_SLOTS)
    bot.heldItem = null
    bot.quickBarSlot = 0

    // ---- Full inventory sync ----
    // From packet dump: window_id is a STRING like "inventory", "armor", "offhand"
    // NOT a hex number like 0x7C
    bot.client.on('inventory_content', (packet) => {
        const windowId = packet.window_id
        const items = packet.input || []

        if (windowId === 'inventory') {
            // Player inventory (main inventory + hotbar)
            _syncInventory(bot, items)
        } else if (windowId === 'hotbar') {
            _syncHotbar(bot, items)
        } else if (windowId === 'armor') {
            _syncArmor(bot, items)
        } else if (windowId === 'offhand') {
            if (items.length > 0) {
                bot.inventory.setSlot(OFFHAND, Item.fromNetwork(items[0], bot._registry))
            }
        } else {
            // Container/window inventory — emit for windows plugin
            bot.emit('_containerContent', windowId, items)
        }

        bot.emit('inventoryUpdated')
    })

    // ---- Single slot update ----
    bot.client.on('inventory_slot', (packet) => {
        const windowId = packet.window_id
        const slotIndex = packet.slot || 0
        const item = Item.fromNetwork(packet.item, bot._registry)

        if (windowId === 'inventory') {
            bot.inventory.setSlot(slotIndex, item)
            bot.emit('updateSlot', bot.inventory, slotIndex, item)
        } else if (windowId === 'hotbar') {
            if (slotIndex >= 0 && slotIndex <= 8) {
                bot.inventory.setSlot(slotIndex, item)
                bot.emit('updateSlot', bot.inventory, slotIndex, item)
            }
        } else {
            bot.emit('_containerSlot', windowId, slotIndex, item)
        }
    })

    // ---- Equipment updates (own held item) ----
    // From packet dump: player_hotbar has selected_slot (not selected_hotbar_slot)
    bot.client.on('player_hotbar', (packet) => {
        const slot = packet.selected_slot || 0
        bot.quickBarSlot = slot
        bot.heldItem = bot.inventory.slots[slot] || null
        bot.emit('heldItemChanged', bot.heldItem)
    })

    // ============================================================
    //  Methods
    // ============================================================

    /**
     * Set the active hotbar slot (0–8).
     * @param {number} slot
     */
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

    /**
     * Equip an item to a destination slot.
     * @param {Item} item - Item to equip
     * @param {'hand'|'head'|'torso'|'legs'|'feet'|'off-hand'} destination
     * @returns {Promise<void>}
     */
    bot.equip = async function (item, destination) {
        const srcSlot = bot.inventory.findItemSlot(item.type, item.metadata)
        if (srcSlot === -1) throw new Error(`Item ${item.name} not in inventory`)

        let destSlot
        switch (destination) {
            case 'hand': destSlot = bot.quickBarSlot; break
            case 'head': destSlot = ARMOR_HELMET; break
            case 'torso': destSlot = ARMOR_CHESTPLATE; break
            case 'legs': destSlot = ARMOR_LEGGINGS; break
            case 'feet': destSlot = ARMOR_BOOTS; break
            case 'off-hand': destSlot = OFFHAND; break
            default: throw new Error(`Unknown destination: ${destination}`)
        }

        await bot.moveSlotItem(srcSlot, destSlot)
    }

    /**
     * Unequip an item from a destination.
     * @param {'hand'|'head'|'torso'|'legs'|'feet'|'off-hand'} destination
     * @returns {Promise<void>}
     */
    bot.unequip = async function (destination) {
        let srcSlot
        switch (destination) {
            case 'hand': srcSlot = bot.quickBarSlot; break
            case 'head': srcSlot = ARMOR_HELMET; break
            case 'torso': srcSlot = ARMOR_CHESTPLATE; break
            case 'legs': srcSlot = ARMOR_LEGGINGS; break
            case 'feet': srcSlot = ARMOR_BOOTS; break
            case 'off-hand': srcSlot = OFFHAND; break
            default: throw new Error(`Unknown destination: ${destination}`)
        }

        const emptySlot = bot.inventory.findEmptySlot()
        if (emptySlot === -1) throw new Error('No empty slot available')
        await bot.moveSlotItem(srcSlot, emptySlot)
    }

    /**
     * Move an item from one slot to another using inventory_transaction.
     * @param {number} srcSlot
     * @param {number} destSlot
     * @returns {Promise<void>}
     */
    bot.moveSlotItem = async function (srcSlot, destSlot) {
        const srcItem = bot.inventory.slots[srcSlot]
        const destItem = bot.inventory.slots[destSlot]

        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 'normal',
                transactions: [
                    {
                        source_type: 'container',
                        window_id: 0,
                        source_flags: 0,
                        slot: srcSlot,
                        old_item: srcItem ? srcItem.toNetwork() : { network_id: 0 },
                        new_item: destItem ? destItem.toNetwork() : { network_id: 0 }
                    },
                    {
                        source_type: 'container',
                        window_id: 0,
                        source_flags: 0,
                        slot: destSlot,
                        old_item: destItem ? destItem.toNetwork() : { network_id: 0 },
                        new_item: srcItem ? srcItem.toNetwork() : { network_id: 0 }
                    }
                ]
            }
        })

        // Optimistic update
        bot.inventory.setSlot(destSlot, srcItem)
        bot.inventory.setSlot(srcSlot, destItem)
        bot.emit('updateSlot', bot.inventory, srcSlot, destItem)
        bot.emit('updateSlot', bot.inventory, destSlot, srcItem)
    }

    /**
     * Toss (drop) items of a type.
     * @param {number} itemType
     * @param {number} [metadata]
     * @param {number} [count] - How many to drop. Null = all.
     * @returns {Promise<void>}
     */
    bot.toss = async function (itemType, metadata, count) {
        let remaining = count || Infinity
        const slots = bot.inventory.findAll(itemType, metadata)

        for (const { slot, item } of slots) {
            if (remaining <= 0) break
            const toDrop = Math.min(remaining, item.count)
            _sendDropItem(bot, slot, toDrop)
            remaining -= toDrop
        }
    }

    /**
     * Toss a full stack from a specific slot.
     * @param {Item} item - The item to toss (must be in inventory)
     * @returns {Promise<void>}
     */
    bot.tossStack = async function (item) {
        const slot = bot.inventory.findItemSlot(item.type, item.metadata)
        if (slot === -1) return
        _sendDropItem(bot, slot, item.count)
    }
}

// ---- Internal helpers ----

function _syncInventory(bot, items) {
    for (let i = 0; i < items.length && i < TOTAL_SLOTS; i++) {
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
    for (let i = 0; i < items.length && i < 4; i++) {
        const item = Item.fromNetwork(items[i], bot._registry)
        bot.inventory.setSlot(ARMOR_HELMET + i, item)
    }
}

function _sendDropItem(bot, slot, count) {
    const item = bot.inventory.slots[slot]
    if (!item) return

    bot.client.queue('inventory_transaction', {
        transaction: {
            transaction_type: 'normal',
            transactions: [
                {
                    source_type: 'world',
                    source_flags: 0,
                    slot: 0,
                    old_item: { network_id: 0 },
                    new_item: { ...item.toNetwork(), count }
                },
                {
                    source_type: 'container',
                    window_id: 0,
                    source_flags: 0,
                    slot,
                    old_item: item.toNetwork(),
                    new_item: count >= item.count
                        ? { network_id: 0 }
                        : { ...item.toNetwork(), count: item.count - count }
                }
            ]
        }
    })

    // Optimistic update
    if (count >= item.count) {
        bot.inventory.clearSlot(slot)
    } else {
        item.count -= count
    }
}

module.exports = inventoryPlugin
