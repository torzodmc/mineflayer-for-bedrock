/**
 * Registry — Block/Item database for Bedrock Edition.
 *
 * Wraps `minecraft-data` to provide human-readable block and item lookups.
 * Supports runtime ID resolution for blocks using the block state hash system.
 *
 * Usage:
 *   const registry = new Registry('bedrock_1.21.0')
 *   registry.blocksByName['stone']  // → { id, name, hardness, ... }
 *   registry.itemsByName['diamond'] // → { id, name, stackSize, ... }
 *   registry.blocksByStateId[runtimeId] // → block (from update_block cache)
 */

const mcData = require('minecraft-data')

// Bedrock version mapping: BDS engine version → minecraft-data version string
const VERSION_MAP = {
    '1.26': 'bedrock_1.21.0',
    '1.21': 'bedrock_1.21.0',
    '1.20': 'bedrock_1.20.0',
    '1.19': 'bedrock_1.19.80',
}

class Registry {
    /**
     * @param {string} [version] - BDS engine version (e.g. '1.26.14') or minecraft-data version
     */
    constructor(version) {
        this._version = this._resolveVersion(version)
        this._data = null
        this._blockStateCache = new Map()  // runtime_id → block info
        this._init()
    }

    _resolveVersion(version) {
        if (!version) return 'bedrock_1.21.0' // sensible default
        if (version.startsWith('bedrock_')) return version

        // Try exact match first, then prefix match
        for (const [prefix, mcVersion] of Object.entries(VERSION_MAP)) {
            if (version.startsWith(prefix)) return mcVersion
        }

        // Try bedrock_ prefix
        try {
            const v = `bedrock_${version}`
            mcData(v)
            return v
        } catch (e) {
            return 'bedrock_1.21.0' // fallback
        }
    }

    _init() {
        try {
            this._data = mcData(this._version)
        } catch (e) {
            // Fallback to latest available
            const versions = mcData.versions.bedrock
            if (versions && versions.length > 0) {
                this._version = versions[0].minecraftVersion
                this._data = mcData(this._version)
            } else {
                throw new Error('No bedrock minecraft-data versions available')
            }
        }
    }

    // ---- Block lookups ----

    /** @returns {Object} Map of block name → block data */
    get blocksByName() { return this._data.blocksByName || {} }

    /** @returns {Object} Map of block id → block data */
    get blocksById() { return this._data.blocks || {} }

    /** @returns {Array} Array of all blocks */
    get blocksArray() { return this._data.blocksArray || [] }

    /**
     * Look up a block by its runtime state ID (from update_block / chunk data).
     * Since Bedrock uses hash-based runtime IDs that change per version,
     * we cache them as we encounter them via update_block packets.
     * @param {number} runtimeId
     * @returns {Object|null}
     */
    blockByStateId(runtimeId) {
        return this._blockStateCache.get(runtimeId) || null
    }

    /**
     * Register a runtime ID → block mapping (learned from update_block packets).
     * @param {number} runtimeId
     * @param {string} blockName
     */
    registerBlockState(runtimeId, blockName) {
        const block = this.blocksByName[blockName]
        if (block) {
            this._blockStateCache.set(runtimeId, block)
        }
    }

    // ---- Item lookups ----

    /** @returns {Object} Map of item name → item data */
    get itemsByName() { return this._data.itemsByName || {} }

    /** @returns {Object} Map of item id → item data */
    get itemsById() { return this._data.items || {} }

    /** @returns {Array} Array of all items */
    get itemsArray() { return this._data.itemsArray || [] }

    /**
     * Look up an item by network_id.
     * @param {number} networkId
     * @returns {Object|null}
     */
    itemById(networkId) {
        return this._data.items[networkId] || null
    }

    /**
     * Look up an item by name.
     * @param {string} name
     * @returns {Object|null}
     */
    itemByName(name) {
        // Strip minecraft: prefix if present
        const clean = name.replace('minecraft:', '')
        return this._data.itemsByName[clean] || null
    }

    /**
     * Look up a block by name.
     * @param {string} name
     * @returns {Object|null}
     */
    blockByName(name) {
        const clean = name.replace('minecraft:', '')
        return this._data.blocksByName[clean] || null
    }

    // ---- Recipe lookups ----

    /** @returns {Object|null} Recipe database if available */
    get recipes() { return this._data.recipes || null }

    /** @returns {boolean} */
    get hasRecipes() { return !!this._data.recipes }

    // ---- Collision shapes ----

    /** @returns {Object|null} Block collision shapes if available */
    get blockCollisionShapes() { return this._data.blockCollisionShapes || null }

    // ---- Utility ----

    /** @returns {string} The resolved version string */
    get version() { return this._version }

    /**
     * Check if a block is solid (for pathfinding).
     * @param {string} name - Block name
     * @returns {boolean}
     */
    isSolid(name) {
        const block = this.blockByName(name)
        if (!block) return false
        // Blocks with hardness >= 0 and not in the "not solid" list are solid
        const notSolid = ['air', 'water', 'lava', 'flowing_water', 'flowing_lava',
            'tallgrass', 'short_grass', 'tall_grass', 'deadbush', 'dead_bush',
            'seagrass', 'tall_seagrass', 'fire', 'soul_fire',
            'torch', 'wall_torch', 'soul_torch', 'soul_wall_torch',
            'redstone_torch', 'redstone_wall_torch', 'sign', 'wall_sign',
            'hanging_sign', 'wall_hanging_sign', 'flower', 'red_flower',
            'yellow_flower', 'poppy', 'dandelion', 'blue_orchid',
            'rail', 'golden_rail', 'detector_rail', 'activator_rail',
            'powered_rail', 'carpet', 'snow_layer', 'pressure_plate',
            'stone_pressure_plate', 'light_weighted_pressure_plate',
            'heavy_weighted_pressure_plate', 'button', 'stone_button',
            'wooden_button', 'lever', 'tripwire', 'tripwire_hook',
            'redstone_wire', 'cobweb', 'web', 'structure_void', 'barrier',
            'light_block']
        return block.hardness >= 0 && !notSolid.includes(name)
    }

    /**
     * Check if a block is walkable (air or non-solid).
     * @param {string} name
     * @returns {boolean}
     */
    isWalkable(name) {
        return !this.isSolid(name)
    }

    /**
     * Check if a block is climbable.
     * @param {string} name
     * @returns {boolean}
     */
    isClimbable(name) {
        const climbable = ['ladder', 'vine', 'twisting_vines', 'weeping_vines',
            'cave_vines', 'scaffolding']
        return climbable.includes(name)
    }

    /**
     * Check if a block is liquid.
     * @param {string} name
     * @returns {boolean}
     */
    isLiquid(name) {
        return ['water', 'flowing_water', 'lava', 'flowing_lava'].includes(name)
    }
}

module.exports = Registry
