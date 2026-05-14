/**
 * Entity class for bedrockflayer.
 *
 * Represents any entity in the world: players, mobs, items, projectiles, etc.
 * Mirrors the prismarine-entity API where possible.
 */

const { Vec3 } = require('../utils/vec3')

class Entity {
    /**
     * @param {number} id - Runtime entity ID
     * @param {string} type - Entity type name (e.g., 'player', 'zombie', 'item')
     */
    constructor(id, type) {
        // Core identity
        this.id = id
        this.type = type || 'unknown'
        this.name = ''
        this.displayName = ''
        this.username = '' // Only for players

        // Transform
        this.position = new Vec3(0, 0, 0)
        this.velocity = new Vec3(0, 0, 0)
        this.yaw = 0
        this.pitch = 0
        this.headYaw = 0

        // Physics
        this.onGround = true
        this.height = 1.8
        this.width = 0.6

        // State
        this.health = undefined
        this.metadata = {}
        this.effects = {} // effectId → { id, amplifier, duration }
        this.attributes = {} // name → { current, min, max, default }

        // Equipment: [mainhand, offhand, helmet, chestplate, leggings, boots, body]
        this.equipment = [null, null, null, null, null, null, null]
        this.heldItem = null

        // Player-specific
        this.uuid = ''
        this.xuid = ''
        this.skinData = null
        this.gamemode = 0
        this.ping = 0

        // Entity-specific
        this.entityUniqueId = null
        this.isValid = true
    }

    /**
     * Get the eye position (position + eye height offset).
     * @returns {Vec3}
     */
    get eyePosition() {
        return this.position.offset(0, this.height * 0.9, 0)
    }

    /**
     * Calculate distance to another position or entity.
     * @param {Vec3|Entity} target
     * @returns {number}
     */
    distanceTo(target) {
        if (!target || typeof target !== 'object') {
            return NaN
        }
        const pos = target.position || target
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number') {
            return NaN
        }
        return this.position.distanceTo(pos)
    }

    /**
     * Mark entity as no longer valid (despawned).
     */
    destroy() {
        this.isValid = false
        this.effects = {}
        this.equipment = [null, null, null, null, null, null, null]
        this.metadata = {}
        this.attributes = {}
        this.heldItem = null
    }

    /**
     * Update position from packet data.
     * @param {object} pos - { x, y, z }
     */
    updatePosition(pos) {
        if (pos.x !== undefined) this.position.x = pos.x
        if (pos.y !== undefined) this.position.y = pos.y
        if (pos.z !== undefined) this.position.z = pos.z
    }

    /**
     * Update rotation from packet data.
     * @param {object} rot - { yaw, pitch, head_yaw }
     */
    updateRotation(rot) {
        if (rot.yaw !== undefined) this.yaw = rot.yaw
        if (rot.pitch !== undefined) this.pitch = rot.pitch
        if (rot.head_yaw !== undefined) this.headYaw = rot.head_yaw
    }

    /**
     * Set a potion/status effect.
     * @param {{ effect_id: number, amplifier: number, duration: number }} effect
     */
    addEffect(effect) {
        if (!effect || effect.effect_id === undefined) {
            return
        }
        this.effects[effect.effect_id] = {
            id: effect.effect_id,
            amplifier: effect.amplifier || 0,
            duration: effect.duration || 0
        }
    }

    /**
     * Remove a potion/status effect.
     * @param {number} effectId
     */
    removeEffect(effectId) {
        delete this.effects[effectId]
    }
}

module.exports = Entity
