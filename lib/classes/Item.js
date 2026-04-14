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

        // Registry-backed fields
        this.name = registryItem ? registryItem.name : `item_${type}`
        this.displayName = registryItem ? (registryItem.displayName || registryItem.name) : this.name
        this.stackSize = registryItem ? (registryItem.stackSize || 64) : 64
    }

    /**
     * Custom display name from NBT (renamed items).
     * @returns {string|null}
     */
    get customName() {
        return this.nbt ? getCustomName(this.nbt) : null
    }

    /**
     * Custom lore lines from NBT.
     * @returns {string[]|null}
     */
    get customLore() {
        return this.nbt ? getCustomLore(this.nbt) : null
    }

    /**
     * Parsed enchantment array from NBT.
     * @returns {Array<{id: number|string, lvl: number}>}
     */
    get enchants() {
        return this.nbt ? getEnchantments(this.nbt) : []
    }

    /**
     * Durability used (damage taken). 0 = brand new.
     * @returns {number}
     */
    get durabilityUsed() {
        if (this.nbt) {
            const damage = this.nbt.Damage || this.nbt.damage
            if (damage !== undefined) {
                return typeof damage === 'object' ? (damage.value || 0) : damage
            }
        }
        return this.metadata // fallback to metadata
    }

    /**
     * The effective display name (custom name or registry name).
     * @returns {string}
     */
    get effectiveName() {
        return this.customName || this.displayName
    }

    /**
     * Create an Item from a raw bedrock-protocol item object.
     * @param {object} rawItem - { network_id, count, metadata, has_stack_id, stack_id, block_runtime_id, extra }
     * @param {object} [registry] - prismarine-registry instance
     * @returns {Item|null}
     */
    static fromNetwork(rawItem, registry) {
        if (!rawItem || rawItem.network_id === 0) return null

        const id = rawItem.network_id || rawItem.id || 0
        const count = rawItem.count || 1
        const metadata = rawItem.metadata || 0
        const nbt = rawItem.extra ? (rawItem.extra.nbt || rawItem.extra) : null

        let registryItem = null
        if (registry) {
            try {
                registryItem = registry.itemById ? registry.itemById(id) : (registry.items ? registry.items[id] : null)
            } catch { /* registry lookup failed */ }
        }

        const item = new Item(id, count, metadata, nbt, registryItem)
        item.stackId = rawItem.stack_id || null
        item.blockRuntimeId = rawItem.block_runtime_id || 0
        return item
    }

    /**
     * Serialize to a bedrock-protocol network item format.
     * @returns {object}
     */
    toNetwork() {
        return {
            network_id: this.type,
            count: this.count,
            metadata: this.metadata,
            has_stack_id: !!this.stackId,
            stack_id: this.stackId || 0,
            block_runtime_id: this.blockRuntimeId || 0,
            extra: this.nbt ? { nbt: this.nbt } : { has_nbt: false, can_place_on: [], can_destroy: [] }
        }
    }

    toString() {
        return `${this.effectiveName} x${this.count}`
    }
}

module.exports = Item
