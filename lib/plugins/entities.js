/**
 * Entities Plugin for bedrockflayer.
 *
 * Tracks all nearby entities: players, mobs, items, projectiles.
 * Handles spawn, despawn, movement, equipment, effects, and metadata.
 *
 * All packet field names verified against live BDS v1.26.14.1 packet dump.
 *
 * CRITICAL: bedrock-protocol sends runtime_entity_id as BigInt.
 * We convert ALL entity IDs to Number for consistent map key usage.
 */

const Entity = require('../classes/Entity')
const { Vec3 } = require('../utils/vec3')

// Helper: convert BigInt entity IDs to Number for consistent map lookups
function eid(id) { return Number(id) }

function entitiesPlugin(bot) {

    // ---- Add Player (other players joining visible range) ----
    // Fields: runtime_id (BigInt), username, entity_id, uuid, position, pitch, yaw, head_yaw, ...
    bot.client.on('add_player', (packet) => {
        const id = eid(packet.runtime_id)
        const entity = new Entity(id, 'player')
        entity.username = packet.username || ''
        entity.name = packet.username || ''
        entity.displayName = packet.username || ''
        entity.uuid = packet.uuid || ''
        entity.entityUniqueId = packet.entity_id || null

        if (packet.position) {
            entity.position = new Vec3(packet.position.x, packet.position.y, packet.position.z)
        }
        if (packet.pitch !== undefined) entity.pitch = packet.pitch
        if (packet.yaw !== undefined) entity.yaw = packet.yaw
        if (packet.head_yaw !== undefined) entity.headYaw = packet.head_yaw
        if (packet.held_item) entity.heldItem = packet.held_item
        if (packet.metadata) entity.metadata = _parseMetadata(packet.metadata)

        bot.entities[entity.id] = entity

        if (entity.username && bot.players[entity.username]) {
            bot.players[entity.username].entity = entity
            bot.players[entity.username].entityId = entity.id
        }

        bot.emit('entitySpawn', entity)
    })

    // ---- Add Entity (mobs, items, projectiles) ----
    // Fields: unique_id (BigInt), runtime_id (BigInt), entity_type, position, velocity,
    //         pitch, yaw, head_yaw, body_yaw, attributes[], metadata[], properties, links
    bot.client.on('add_entity', (packet) => {
        const id = eid(packet.runtime_id)
        const entity = new Entity(id, packet.entity_type || 'unknown')
        entity.entityUniqueId = packet.unique_id || null
        entity.name = packet.entity_type || `entity_${id}`

        if (packet.position) {
            entity.position = new Vec3(packet.position.x, packet.position.y, packet.position.z)
        }
        if (packet.velocity) {
            entity.velocity = new Vec3(packet.velocity.x, packet.velocity.y, packet.velocity.z)
        }
        if (packet.pitch !== undefined) entity.pitch = packet.pitch
        if (packet.yaw !== undefined) entity.yaw = packet.yaw
        if (packet.head_yaw !== undefined) entity.headYaw = packet.head_yaw
        if (packet.metadata) entity.metadata = _parseMetadata(packet.metadata)

        if (packet.attributes && Array.isArray(packet.attributes)) {
            for (const attr of packet.attributes) {
                if (attr.name) {
                    entity.attributes[attr.name] = {
                        current: attr.current !== undefined ? attr.current : attr.value,
                        min: attr.min, max: attr.max, default: attr.default
                    }
                }
            }
        }

        bot.entities[entity.id] = entity
        bot.emit('entitySpawn', entity)
    })

    // ---- Remove Entity ----
    // Fields: entity_id_self (BigInt — this is the unique_id, NOT runtime_id)
    bot.client.on('remove_entity', (packet) => {
        // entity_id_self is the unique entity ID; we need to find by it
        const uniqueId = packet.entity_id_self
        // Search for entity by unique ID or by runtime ID
        let found = null
        let foundKey = null
        for (const key in bot.entities) {
            const e = bot.entities[key]
            if (e.entityUniqueId !== null && e.entityUniqueId !== undefined &&
                BigInt(e.entityUniqueId) === BigInt(uniqueId)) {
                found = e
                foundKey = key
                break
            }
        }
        // Fallback: try as runtime ID
        if (!found) {
            const rid = eid(uniqueId)
            if (bot.entities[rid]) {
                found = bot.entities[rid]
                foundKey = rid
            }
        }
        if (found) {
            found.destroy()
            if (found.type === 'player' && found.username && bot.players[found.username]) {
                bot.players[found.username].entity = null
            }
            delete bot.entities[foundKey]
            bot.emit('entityGone', found)
        }
    })

    // ---- Move Entity (Delta) ----
    // Fields: runtime_entity_id (BigInt), flags {has_x, has_y, has_z, has_rot_x, has_rot_y,
    //         has_rot_z, on_ground, teleport, force_move}, x, y, z, rot_x, rot_y, rot_z
    bot.client.on('move_entity_delta', (packet) => {
        const entity = bot.entities[eid(packet.runtime_entity_id)]
        if (!entity) return

        const flags = packet.flags || {}
        if (flags.has_x && packet.x !== undefined) entity.position.x = packet.x
        if (flags.has_y && packet.y !== undefined) entity.position.y = packet.y
        if (flags.has_z && packet.z !== undefined) entity.position.z = packet.z
        if (flags.has_rot_x && packet.rot_x !== undefined) entity.pitch = packet.rot_x
        if (flags.has_rot_y && packet.rot_y !== undefined) entity.yaw = packet.rot_y
        if (flags.has_rot_z && packet.rot_z !== undefined) entity.headYaw = packet.rot_z
        if (flags.on_ground !== undefined) entity.onGround = flags.on_ground

        bot.emit('entityMoved', entity)
    })

    // ---- Entity Metadata (set_entity_data) ----
    // Fields: runtime_entity_id (BigInt), metadata (Array), properties, tick
    bot.client.on('set_entity_data', (packet) => {
        const entity = bot.entities[eid(packet.runtime_entity_id)]
        if (!entity) return

        if (packet.metadata) {
            const parsed = _parseMetadata(packet.metadata)
            Object.assign(entity.metadata, parsed)
            if (parsed.health !== undefined) entity.health = parsed.health
            if (parsed.nametag !== undefined) entity.displayName = parsed.nametag
        }
        bot.emit('entityUpdate', entity)
    })

    // ---- Entity Equipment ----
    // Fields: runtime_entity_id (BigInt), item {...}, slot, selected_slot, window_id
    bot.client.on('mob_equipment', (packet) => {
        const rid = eid(packet.runtime_entity_id)
        const entity = bot.entities[rid]
        if (!entity) return

        const slot = packet.selected_slot || 0
        if (packet.item) {
            entity.heldItem = packet.item
            entity.equipment[0] = packet.item
        }
        bot.emit('entityEquip', entity)

        if (rid === bot._runtimeEntityId) {
            bot.heldItem = packet.item || null
            bot.quickBarSlot = slot
            bot.emit('heldItemChanged', bot.heldItem)
        }
    })

    // ---- Entity Armor ----
    bot.client.on('mob_armor_equipment', (packet) => {
        const entity = bot.entities[eid(packet.runtime_entity_id)]
        if (!entity) return
        if (packet.helmet) entity.equipment[2] = packet.helmet
        if (packet.chestplate) entity.equipment[3] = packet.chestplate
        if (packet.leggings) entity.equipment[4] = packet.leggings
        if (packet.boots) entity.equipment[5] = packet.boots
        bot.emit('entityEquip', entity)
    })

    // ---- Potion / Status Effects ----
    bot.client.on('mob_effect', (packet) => {
        const entity = bot.entities[eid(packet.runtime_entity_id)]
        if (!entity) return
        if (packet.event_id === 1 || packet.event_id === 2) {
            entity.addEffect({
                effect_id: packet.effect_id,
                amplifier: packet.amplifier || 0,
                duration: packet.duration || 0
            })
            bot.emit('entityEffect', entity, entity.effects[packet.effect_id])
        } else if (packet.event_id === 3) {
            const effect = entity.effects[packet.effect_id]
            entity.removeEffect(packet.effect_id)
            bot.emit('entityEffectEnd', entity, effect)
        }
    })

    // ---- Entity Animations ----
    bot.client.on('animate', (packet) => {
        const entity = bot.entities[eid(packet.runtime_entity_id)]
        if (!entity) return
        switch (packet.action_id) {
            case 1: bot.emit('entitySwingArm', entity); break
            case 2: bot.emit('entityWake', entity); break
            case 3: bot.emit('entityCriticalEffect', entity); break
            case 4: bot.emit('entityMagicCriticalEffect', entity); break
        }
    })

    // ---- Entity Events ----
    bot.client.on('entity_event', (packet) => {
        const entity = bot.entities[eid(packet.runtime_entity_id)]
        if (!entity) return
        switch (packet.event_id) {
            case 2: bot.emit('entityHurt', entity); break
            case 3: bot.emit('entityDead', entity); break
            case 4: bot.emit('entitySwingArm', entity); break
            case 7: bot.emit('entityTaming', entity); break
            case 8: bot.emit('entityTamed', entity); break
            case 9: bot.emit('entityShakingOffWater', entity); break
            case 10: bot.emit('entityEat', entity); break
            case 57: bot.emit('entityEatingGrass', entity); break
        }
    })

    // ---- Entity Links (mount/dismount) ----
    bot.client.on('set_entity_link', (packet) => {
        const data = packet.link || packet
        const rider = bot.entities[eid(data.rider_entity_id || data.ridden_entity_id)]
        const vehicle = bot.entities[eid(data.ridden_entity_id || data.rider_entity_id)]
        if (data.type === 0) {
            if (rider) bot.emit('entityDetach', rider, vehicle)
        } else {
            if (rider) bot.emit('entityAttach', rider, vehicle)
        }
    })

    // ---- Entity Attributes ----
    // Fields: runtime_entity_id (BigInt), attributes (Array), tick
    bot.client.on('update_attributes', (packet) => {
        const entity = bot.entities[eid(packet.runtime_entity_id)]
        if (!entity) return
        const attributes = packet.attributes || []
        for (const attr of attributes) {
            if (!attr.name) continue
            entity.attributes[attr.name] = {
                current: attr.current !== undefined ? attr.current : attr.value,
                min: attr.min, max: attr.max, default: attr.default
            }
        }
        bot.emit('entityAttributes', entity)
    })

    // ---- Entity Velocity ----
    // Fields: runtime_entity_id (BigInt), velocity {x,y,z}, tick
    bot.client.on('set_entity_motion', (packet) => {
        const entity = bot.entities[eid(packet.runtime_entity_id)]
        if (!entity) return
        if (packet.velocity) {
            entity.velocity = new Vec3(packet.velocity.x, packet.velocity.y, packet.velocity.z)
        }
        bot.emit('entityVelocity', entity)
    })

    // ---- Collect Item Animation ----
    bot.client.on('take_item_entity', (packet) => {
        const collector = bot.entities[eid(packet.runtime_entity_id)]
        const collected = bot.entities[eid(packet.target)]
        if (collector && collected) {
            bot.emit('playerCollect', collector, collected)
        }
    })

    // ---- Helper: nearest entity ----
    bot.nearestEntity = function (match = () => true) {
        let nearest = null
        let minDist = Infinity
        for (const id in bot.entities) {
            const entity = bot.entities[id]
            if (entity.id === bot._runtimeEntityId) continue
            if (!match(entity)) continue
            const dist = bot.entity ? bot.entity.distanceTo(entity) : 0
            if (dist < minDist) { minDist = dist; nearest = entity }
        }
        return nearest
    }
}

function _parseMetadata(metadata) {
    const result = {}
    if (Array.isArray(metadata)) {
        for (const entry of metadata) {
            const key = entry.key !== undefined ? entry.key : entry.type
            result[key] = entry.value
        }
    } else if (typeof metadata === 'object' && metadata !== null) {
        Object.assign(result, metadata)
    }
    return result
}

module.exports = entitiesPlugin
