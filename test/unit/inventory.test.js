/**
 * Unit tests for inventory logic: Item, Window, and inventory plugin.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import EventEmitter from 'events'
import Item from '../../lib/classes/Item.js'
import Window from '../../lib/classes/Window.js'
import Furnace from '../../lib/classes/Furnace.js'
import inventoryPlugin from '../../lib/plugins/inventory.js'

function createMockBot() {
    const bot = new EventEmitter()
    bot.username = 'TestBot'
    bot.client = new EventEmitter()
    bot.client.queue = vi.fn()
    bot._runtimeEntityId = 1
    bot._registry = null
    bot.quickBarSlot = 0
    bot.entity = { position: { x: 0, y: 64, z: 0 } }
    inventoryPlugin(bot)
    return bot
}

describe('Item', () => {
    it('should create an item with basic properties', () => {
        const item = new Item(1, 64, 0, null, { name: 'stone', displayName: 'Stone', stackSize: 64 })
        expect(item.type).toBe(1)
        expect(item.count).toBe(64)
        expect(item.name).toBe('stone')
        expect(item.displayName).toBe('Stone')
    })

    it('should extract custom name from NBT', () => {
        const nbt = { display: { value: { Name: { value: 'My Sword' } } } }
        const item = new Item(276, 1, 0, nbt)
        expect(item.customName).toBe('My Sword')
    })

    it('should extract enchantments from NBT', () => {
        const nbt = { ench: [{ value: { id: { value: 16 }, lvl: { value: 5 } } }] }
        const item = new Item(276, 1, 0, nbt)
        expect(item.enchants.length).toBe(1)
        expect(item.enchants[0].id).toBe(16)
        expect(item.enchants[0].lvl).toBe(5)
    })

    it('should convert to network format', () => {
        const item = new Item(1, 32, 0)
        const net = item.toNetwork()
        expect(net.network_id).toBe(1)
        expect(net.count).toBe(32)
    })

    it('fromNetwork should return null for air (id 0)', () => {
        expect(Item.fromNetwork({ network_id: 0 })).toBeNull()
        expect(Item.fromNetwork(null)).toBeNull()
    })

    it('fromNetwork should create an Item from raw data', () => {
        const raw = { network_id: 5, count: 10, metadata: 2 }
        const item = Item.fromNetwork(raw)
        expect(item).not.toBeNull()
        expect(item.type).toBe(5)
        expect(item.count).toBe(10)
    })

    it('toString should show name and count', () => {
        const item = new Item(1, 64, 0, null, { name: 'stone', displayName: 'Stone', stackSize: 64 })
        expect(item.toString()).toBe('Stone x64')
    })
})

describe('Window', () => {
    it('should create a window with slots', () => {
        const win = new Window(1, 'chest', 'Chest', 27)
        expect(win.id).toBe(1)
        expect(win.type).toBe('chest')
        expect(win.slots.length).toBe(27)
    })

    it('should track items in slots', () => {
        const win = new Window(1, 'chest', 'Chest', 27)
        const item = new Item(1, 32, 0, null, { name: 'stone', displayName: 'Stone', stackSize: 64 })
        win.setSlot(0, item)
        expect(win.slots[0]).toBe(item)
        expect(win.items().length).toBe(1)
    })

    it('should count items by type', () => {
        const win = new Window(1, 'chest', 'Chest', 27)
        win.setSlot(0, new Item(1, 32, 0))
        win.setSlot(1, new Item(1, 20, 0))
        win.setSlot(2, new Item(2, 10, 0))
        expect(win.count(1)).toBe(52)
        expect(win.count(2)).toBe(10)
        expect(win.count(99)).toBe(0)
    })

    it('should find item slots', () => {
        const win = new Window(1, 'chest', 'Chest', 27)
        win.setSlot(5, new Item(10, 1, 0))
        expect(win.findItemSlot(10)).toBe(5)
        expect(win.findItemSlot(99)).toBe(-1)
    })

    it('should find empty slots', () => {
        const win = new Window(1, 'chest', 'Chest', 3)
        win.setSlot(0, new Item(1, 1, 0))
        win.setSlot(1, new Item(1, 1, 0))
        expect(win.findEmptySlot()).toBe(2)
    })

    it('should return -1 when no empty slots', () => {
        const win = new Window(1, 'chest', 'Chest', 2)
        win.setSlot(0, new Item(1, 1, 0))
        win.setSlot(1, new Item(1, 1, 0))
        expect(win.findEmptySlot()).toBe(-1)
    })
})

describe('Furnace', () => {
    it('should have input, fuel, output accessors', () => {
        const furnace = new Furnace(1)
        expect(furnace.inputItem).toBeNull()
        expect(furnace.fuelItem).toBeNull()
        expect(furnace.outputItem).toBeNull()
        furnace.setSlot(0, new Item(4, 8, 0)) // cobblestone in input
        expect(furnace.inputItem.type).toBe(4)
    })

    it('should track fuel/progress from updateData', () => {
        const furnace = new Furnace(1)
        furnace.updateData(2, 200) // MAX_FUEL_TIME = 200
        furnace.updateData(1, 100) // REMAINING_FUEL_TIME = 100
        expect(furnace.fuel).toBeCloseTo(0.5)

        furnace.updateData(0, 150) // SMELT_PROGRESS = 150
        expect(furnace.progress).toBeCloseTo(0.75)

        furnace.updateData(3, 10) // STORED_XP = 10
        expect(furnace.xp).toBe(10)
    })
})

describe('Inventory Plugin', () => {
    let bot

    beforeEach(() => {
        bot = createMockBot()
    })

    it('should initialize with 41 inventory slots (36 main + 4 armor + 1 offhand)', () => {
        expect(bot.inventory.slots.length).toBe(41)
    })

    it('should sync inventory from inventory_content packet', () => {
        const items = [
            { network_id: 1, count: 64, metadata: 0 }, // slot 0
            { network_id: 0 },                           // slot 1 (empty)
            { network_id: 5, count: 10, metadata: 0 }    // slot 2
        ]

        bot.client.emit('inventory_content', {
            container: { container_id: 'inventory' },
            window_id: 0,
            input: items
        })

        expect(bot.inventory.slots[0]).not.toBeNull()
        expect(bot.inventory.slots[0].type).toBe(1)
        expect(bot.inventory.slots[0].count).toBe(64)
        expect(bot.inventory.slots[1]).toBeNull()
        expect(bot.inventory.slots[2].type).toBe(5)
    })

    it('should update single slot from inventory_slot packet', () => {
        const handler = vi.fn()
        bot.on('updateSlot', handler)

        bot.client.emit('inventory_slot', {
            container: { container_id: 'inventory' },
            window_id: 0,
            slot: 3,
            item: { network_id: 10, count: 5, metadata: 0 }
        })

        expect(bot.inventory.slots[3]).not.toBeNull()
        expect(bot.inventory.slots[3].type).toBe(10)
        expect(handler).toHaveBeenCalled()
    })

    it('should set quickbar slot and update heldItem', () => {
        bot.inventory.setSlot(3, new Item(276, 1, 0, null, { name: 'diamond_sword' }))
        bot.setQuickBarSlot(3)
        expect(bot.quickBarSlot).toBe(3)
        expect(bot.heldItem).not.toBeNull()
        expect(bot.heldItem.type).toBe(276)
        expect(bot.client.queue).toHaveBeenCalledWith('mob_equipment', expect.any(Object))
    })
})
