/**
 * Window class for bedrockflayer.
 *
 * Represents any inventory-like UI: player inventory, chest, furnace, etc.
 * Contains an array of slots, each holding an Item or null.
 */

const Item = require('./Item')

class Window {
    /**
     * @param {number} id - Window ID (from container_open packet)
     * @param {string} type - Window type name (e.g., 'inventory', 'chest', 'furnace')
     * @param {string} title - Window title
     * @param {number} slotCount - Total number of slots
     */
    constructor(id, type, title, slotCount) {
        this.id = id
        this.type = type || 'unknown'
        this.title = title || ''
        this.slotCount = slotCount || 0
        this.slots = new Array(slotCount).fill(null)
        this._isValid = true
    }

    invalidate() {
        this._isValid = false
    }

    isValid() {
        return this._isValid
    }

    /**
     * Get all non-null items in this window.
     * @returns {Item[]}
     */
    items() {
        return this.slots.filter(s => s !== null)
    }

    /**
     * Count the total quantity of an item type in this window.
     * @param {number} itemType - Item type ID
     * @param {number} [metadata] - Item metadata (optional)
     * @returns {number}
     */
    count(itemType, metadata) {
        let total = 0
        for (const item of this.slots) {
            if (!item) continue
            if (item.type === itemType) {
                if (metadata !== undefined && item.metadata !== metadata) continue
                total += item.count
            }
        }
        return total
    }

    /**
     * Find the first slot index containing the given item type.
     * @param {number} itemType
     * @param {number} [metadata]
     * @param {boolean} [notFull=false] - If true, find a non-full stack
     * @returns {number} Slot index, or -1 if not found
     */
    findItemSlot(itemType, metadata, notFull = false) {
        for (let i = 0; i < this.slots.length; i++) {
            const item = this.slots[i]
            if (!item) continue
            if (item.type !== itemType) continue
            if (metadata !== undefined && item.metadata !== metadata) continue
            if (notFull && item.count >= item.stackSize) continue
            return i
        }
        return -1
    }

    /**
     * Find the first empty slot.
     * @returns {number} Slot index, or -1 if full
     */
    findEmptySlot() {
        for (let i = 0; i < this.slots.length; i++) {
            if (this.slots[i] === null) return i
        }
        return -1
    }

    /**
     * Find all slots containing the given item type.
     * @param {number} itemType
     * @param {number} [metadata]
     * @returns {Array<{slot: number, item: Item}>}
     */
    findAll(itemType, metadata) {
        const results = []
        for (let i = 0; i < this.slots.length; i++) {
            const item = this.slots[i]
            if (!item) continue
            if (item.type !== itemType) continue
            if (metadata !== undefined && item.metadata !== metadata) continue
            results.push({ slot: i, item })
        }
        return results
    }

    /**
     * Set a slot to an item (or null to clear).
     * @param {number} slotIndex
     * @param {Item|null} item
     */
    setSlot(slotIndex, item) {
        if (typeof slotIndex !== 'number' || !Number.isInteger(slotIndex)) {
            throw new Error(`Invalid slot index: ${slotIndex} (expected integer)`)
        }
        if (slotIndex < 0 || slotIndex >= this.slots.length) {
            throw new Error(`Slot index ${slotIndex} out of bounds (valid: 0-${this.slots.length - 1})`)
        }
        this.slots[slotIndex] = item
    }

    /**
     * Clear a slot.
     * @param {number} slotIndex
     */
    clearSlot(slotIndex) {
        this.setSlot(slotIndex, null)
    }
}

module.exports = Window
