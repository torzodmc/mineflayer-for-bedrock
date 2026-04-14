/**
 * Block class for bedrockflayer.
 *
 * Wraps block data from prismarine-block / prismarine-registry for Bedrock.
 * Represents a single block at a specific position in the world.
 */

const { Vec3 } = require('../utils/vec3')

class Block {
    /**
     * @param {object} blockData - Block data from registry
     * @param {Vec3} position - World position
     * @param {number} stateId - Block state ID
     */
    constructor(blockData, position, stateId) {
        // Identity
        this.type = blockData ? blockData.id : 0
        this.name = blockData ? blockData.name : 'air'
        this.displayName = blockData ? (blockData.displayName || blockData.name) : 'Air'
        this.stateId = stateId || 0

        // Position
        this.position = position ? position.clone() : new Vec3(0, 0, 0)

        // Properties
        this.hardness = blockData ? (blockData.hardness !== undefined ? blockData.hardness : -1) : 0
        this.diggable = blockData ? (blockData.diggable !== undefined ? blockData.diggable : false) : false
        this.material = blockData ? blockData.material : undefined
        this.transparent = blockData ? (blockData.transparent || false) : true
        this.emitLight = blockData ? (blockData.emitLight || 0) : 0
        this.filterLight = blockData ? (blockData.filterLight || 0) : 0
        this.stackSize = blockData ? (blockData.stackSize || 64) : 64
        this.resistance = blockData ? (blockData.resistance || 0) : 0

        // Bounding box
        this.boundingBox = blockData ? (blockData.boundingBox || 'block') : 'empty'

        // Block entity data (signs, chests, etc.)
        this.blockEntity = null

        // Drops
        this.drops = blockData ? (blockData.drops || []) : []
    }

    /**
     * Whether this block is solid (has a full collision box).
     * @returns {boolean}
     */
    get solid() {
        return this.boundingBox === 'block'
    }

    /**
     * Whether this block is air.
     * @returns {boolean}
     */
    get isAir() {
        return this.name === 'air' || this.type === 0
    }

    /**
     * Whether this block is a liquid (water or lava).
     * @returns {boolean}
     */
    get isLiquid() {
        return this.name === 'water' || this.name === 'lava' ||
            this.name === 'flowing_water' || this.name === 'flowing_lava'
    }

    /**
     * Whether this block is climbable (ladder or vine).
     * @returns {boolean}
     */
    get isClimbable() {
        return this.name === 'ladder' || this.name === 'vine' ||
            this.name === 'scaffolding' || this.name === 'twisting_vines' ||
            this.name === 'weeping_vines' || this.name === 'cave_vines'
    }

    /**
     * Get sign text if this is a sign block.
     * @returns {string[]|null}
     */
    getSignText() {
        if (!this.blockEntity) return null
        const texts = []
        for (let i = 1; i <= 4; i++) {
            const key = `Text${i}`
            if (this.blockEntity[key]) {
                try {
                    const parsed = JSON.parse(this.blockEntity[key])
                    texts.push(parsed.text || '')
                } catch {
                    texts.push(this.blockEntity[key])
                }
            }
        }
        return texts.length > 0 ? texts : null
    }
}

module.exports = Block
