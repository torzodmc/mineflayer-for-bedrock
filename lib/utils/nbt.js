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

function parseJsonName(text) {
    if (typeof text !== 'string') return text
    if (text.startsWith('{') && text.endsWith('}')) {
        try {
            const parsed = JSON.parse(text)
            return parsed.text || text
        } catch {
            return text
        }
    }
    return text
}

/**
 * Extract the display name from an item's NBT data.
 * @param {object} nbt
 * @returns {string|undefined}
 */
function getCustomName(nbt) {
    const name = getNbtValue(nbt, 'display', 'Name')
    if (!name) return undefined
    const text = typeof name === 'string' ? name : (name.value || name)
    return parseJsonName(text)
}

/**
 * Extract the lore lines from an item's NBT data.
 * @param {object} nbt
 * @returns {string[]|undefined}
 */
function getCustomLore(nbt) {
    const lore = getNbtValue(nbt, 'display', 'Lore')
    if (!lore) return undefined
    const arr = Array.isArray(lore) ? lore : (lore.value || [])
    return arr.map(line => {
        const text = typeof line === 'string' ? line : (line.value || line)
        if (typeof text === 'string' && text.startsWith('{') && text.endsWith('}')) {
            try {
                const parsed = JSON.parse(text)
                return parsed.text || text
            } catch {
                return text
            }
        }
        return text
    })
}

function extractNestedValue(e, key) {
    if (e[key] !== undefined) return e[key]
    if (e.value && e.value[key] !== undefined) {
        const v = e.value[key]
        return v.value !== undefined ? v.value : v
    }
    return undefined
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
        id: extractNestedValue(e, 'id'),
        lvl: extractNestedValue(e, 'lvl') || 0
    }))
}

module.exports = {
    getNbtValue,
    getCustomName,
    getCustomLore,
    getEnchantments
}
