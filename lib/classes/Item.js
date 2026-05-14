/**
 * Item class for bedrockflayer.
 *
 * Represents a single item stack in an inventory slot.
 * Provides NBT-backed properties for enchantments, custom names, lore, and durability.
 */

const { getCustomName, getCustomLore, getEnchantments } = require('../utils/nbt')

class Item {
    /**
     * @param {number} type - Numeric item ID
     * @param {number} count - Stack count
     * @param {number} metadata - Damage/metadata value
     * @param {object} [nbt] - NBT compound data
     * @param {object} [registryItem] - Registry lookup for this item type
     */
    constructor(type, count, metadata, nbt, registryItem) {
        this.type = type
        this.count = count || 1
        this.metadata = metadata || 0
        this.nbt = nbt || null
        this.hasStackId = false

        this.name = registryItem ? registryItem.name : `item_${type}`
        this.displayName = registryItem ? (registryItem.displayName || registryItem.name) : this.name
        this.stackSize = registryItem ? (registryItem.stackSize || 64) : 64
    }

    get customName() {
        return this.nbt ? getCustomName(this.nbt) : null
    }

    get customLore() {
        return this.nbt ? getCustomLore(this.nbt) : null
    }

    get enchants() {
        return this.nbt ? getEnchantments(this.nbt) : []
    }

    get durabilityUsed() {
        if (this.nbt) {
            const damage = this.nbt.Damage || this.nbt.damage
            if (damage !== undefined) {
                return typeof damage === 'object' ? (damage.value || 0) : damage
            }
        }
        return this.metadata
    }

    get effectiveName() {
        return this.customName || this.displayName
    }

    static fromNetwork(rawItem, registry) {
        if (!rawItem || Number(rawItem.network_id) === 0) return null

        const id = rawItem.network_id || rawItem.id || 0
        if (id === 0) return null

        const count = rawItem.count || 1
        const metadata = rawItem.metadata || 0
        const nbt = rawItem.extra?.nbt || null

        let registryItem = null
        if (registry) {
            try {
                registryItem = registry.itemByNetworkId ? registry.itemByNetworkId(id)
                    : (registry.itemById ? registry.itemById(id) : null)
            } catch { /* registry lookup failed */ }
        }

        const item = new Item(id, count, metadata, nbt, registryItem)
        item.stackId = rawItem.stack_id || null
        item.hasStackId = !!rawItem.stack_id
        item.blockRuntimeId = rawItem.block_runtime_id || 0

        if (rawItem.extra) {
            if (rawItem.extra.can_place_on && Array.isArray(rawItem.extra.can_place_on)) {
                item.canPlaceOn = rawItem.extra.can_place_on
            }
            if (rawItem.extra.can_destroy && Array.isArray(rawItem.extra.can_destroy)) {
                item.canDestroy = rawItem.extra.can_destroy
            }
            if (rawItem.extra.nbt) {
                if (rawItem.extra.nbt.can_place_on && Array.isArray(rawItem.extra.nbt.can_place_on)) {
                    item.canPlaceOn = rawItem.extra.nbt.can_place_on
                }
                if (rawItem.extra.nbt.can_destroy && Array.isArray(rawItem.extra.nbt.can_destroy)) {
                    item.canDestroy = rawItem.extra.nbt.can_destroy
                }
            }
        }

        return item
    }

    toNetwork() {
        if (this.type === 0 || !this.type) {
            return null
        }
        let extra
        if (this.nbt) {
            extra = { nbt: this.nbt }
            if (this.nbt.can_place_on) {
                extra.can_place_on = this.nbt.can_place_on
            }
            if (this.nbt.can_destroy) {
                extra.can_destroy = this.nbt.can_destroy
            }
        } else {
            extra = { has_nbt: false }
        }

        if (this.canPlaceOn && Array.isArray(this.canPlaceOn) && this.canPlaceOn.length > 0) {
            extra.can_place_on = this.canPlaceOn
        }
        if (this.canDestroy && Array.isArray(this.canDestroy) && this.canDestroy.length > 0) {
            extra.can_destroy = this.canDestroy
        }

        return {
            network_id: this.type,
            count: this.count,
            metadata: this.metadata,
            has_stack_id: this.hasStackId ? 1 : 0,
            stack_id: this.stackId || 0,
            block_runtime_id: this.blockRuntimeId || 0,
            extra
        }
    }

    toString() {
        return `${this.effectiveName} x${this.count}`
    }
}

module.exports = Item