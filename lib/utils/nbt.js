/**
 * NBT parsing helpers for bedrockflayer.
 * Bedrock uses little-endian NBT format.
 */

/**
 * Safely extract a nested value from an NBT compound.
 * @param {object} nbt - The NBT compound object
 * @param {...string} keys - Path of keys to traverse
 * @returns {*} The value at the path, or undefined
 */
function getNbtValue(nbt, ...keys) {
    let current = nbt
    for (const key of keys) {
        if (current == null || typeof current !== 'object') return undefined
        if (current.value != null && typeof current.value === 'object') {
            current = current.value[key]
        } else {
            current = current[key]
        }
    }
    if (current != null && current.value !== undefined) return current.value
    return current
}

/**
 * Extract the display name from an item's NBT data.
 * @param {object} nbt
 * @returns {string|null}
 */
function getCustomName(nbt) {
    return getNbtValue(nbt, 'display', 'Name') || null
}

/**
 * Extract the lore lines from an item's NBT data.
 * @param {object} nbt
 * @returns {string[]|null}
 */
function getCustomLore(nbt) {
    const lore = getNbtValue(nbt, 'display', 'Lore')
    if (Array.isArray(lore)) return lore
    if (lore && lore.value && Array.isArray(lore.value)) return lore.value
    return null
}

/**
 * Extract enchantments from an item's NBT data.
 * @param {object} nbt
 * @returns {Array<{id: number|string, lvl: number}>}
 */
function getEnchantments(nbt) {
    const ench = getNbtValue(nbt, 'ench') || getNbtValue(nbt, 'Enchantments')
    if (!Array.isArray(ench)) return []
    return ench.map(e => ({
        id: e.value ? (e.value.id ? e.value.id.value : e.value.id) : e.id,
        lvl: e.value ? (e.value.lvl ? e.value.lvl.value : e.value.lvl) : e.lvl
    }))
}

module.exports = {
    getNbtValue,
    getCustomName,
    getCustomLore,
    getEnchantments
}
