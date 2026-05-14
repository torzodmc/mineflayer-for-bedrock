/**
 * Health Plugin for bedrockflayer.
 *
 * Tracks player vitals (health, food, oxygen, XP),
 * game state, player list, death/respawn, and tab list.
 */

const { Vec3 } = require('../utils/vec3')

function healthPlugin(bot) {
    const uuidToUsername = new Map()

    // ---- Attribute updates ----
    // Bedrock sends update_attributes for the player's own attributes
    // CRITICAL: runtime_entity_id is BigInt, convert to Number for comparison
    bot.client.on('update_attributes', (packet) => {
        if (Number(packet.runtime_entity_id) !== bot._runtimeEntityId) return

        const attributes = packet.attributes || []
        for (const attr of attributes) {
            const name = attr.name || ''
            const current = attr.current !== undefined ? attr.current : attr.value

            switch (name) {
                case 'minecraft:health':
                    bot.health = current
                    bot.emit('health')
                    break
                case 'minecraft:player.hunger':
                    bot.food = current
                    bot.emit('health')
                    break
                case 'minecraft:player.saturation':
                    bot.foodSaturation = current
                    bot.emit('health')
                    break
                case 'minecraft:player.experience':
                    bot.experience.progress = current
                    bot.emit('experience')
                    break
                case 'minecraft:player.level':
                    bot.experience.points = Math.floor(current)
                    bot.experience.level = _calculateLevelFromXP(bot.experience.points)
                    bot.emit('experience')
                    break
                case 'minecraft:player.experience_level_cap':
                    break
                case 'minecraft:movement':
                    // Movement speed attribute — store for physics
                    if (bot.entity) {
                        bot.entity.movementSpeed = current
                    }
                    break
                default:
                    break
            }
        }
    })

    // ---- Oxygen / breathing ----
    // Oxygen is sent in entity metadata (set_entity_data)
    bot.client.on('set_entity_data', (packet) => {
        if (Number(packet.runtime_entity_id) !== bot._runtimeEntityId) return

        const metadata = packet.metadata || []
        for (const entry of metadata) {
            // Air supply is typically data key 7 (short)
            if (entry.key === 7 && entry.type === 'short') {
                const newOxygen = Math.max(0, Math.min(20, Math.floor(entry.value / 15)))
                if (newOxygen !== bot.oxygenLevel) {
                    bot.oxygenLevel = newOxygen
                    bot.emit('breath')
                }
            }
        }
    })

    // ---- Respawn ----
    // Fields: position {x,y,z}, state, runtime_entity_id
    // NOTE: bot.js already emits 'spawn' via bedrock-protocol's spawn event.
    // This handler updates position on respawn only.
    bot.client.on('respawn', (packet) => {
        const pos = packet.position
        if (pos) {
            bot.position = new Vec3(pos.x, pos.y, pos.z)
            if (bot.entity) {
                bot.entity.position = bot.position.clone()
            }
        }
        bot.emit('respawn')
    })

    // ---- Direct health update ----
    // Fields: health (number)
    bot.client.on('set_health', (packet) => {
        if (packet.health !== undefined) {
            bot.health = packet.health
            bot.emit('health')
        }
    })

    let _isDead = false

    bot.on('health', () => {
        if (bot.health <= 0 && !_isDead) {
            _isDead = true
            bot.emit('death')
        } else if (bot.health > 0 && _isDead) {
            _isDead = false
        }
    })

    // ---- Game state changes ----
    bot.client.on('game_rules_changed', (packet) => {
        const rules = packet.rules || []
        for (const rule of rules) {
            if (rule.name === 'dodaylightcycle') {
            }
        }
        bot.emit('game', { type: 'gameRules', rules })
    })

    bot.client.on('set_difficulty', (packet) => {
        bot.game.difficulty = packet.difficulty || 0
        bot.emit('game', { type: 'difficulty', difficulty: packet.difficulty })
    })

    bot.client.on('change_dimension', (packet) => {
        const newDim = _parseDimension(packet.dimension || 0)
        bot.game.dimension = newDim

        // Update minY/height for each dimension
        switch (newDim) {
            case 'the_nether':
                bot.game.minY = 0
                bot.game.height = 256
                break
            case 'the_end':
            case 'overworld':
            default:
                bot.game.minY = -64
                bot.game.height = 384
                break
        }

        if (packet.position) {
            bot.position = new Vec3(packet.position.x, packet.position.y, packet.position.z)
            if (bot.entity) {
                bot.entity.position = bot.position.clone()
            }
        }

        // Clear chunk data for the new dimension
        if (bot._chunks) bot._chunks.clear()
        if (bot._loadedChunks) bot._loadedChunks.clear()
        if (bot._blockStore) bot._blockStore.clear()

        // Reset death state on dimension change
        _isDead = false

        bot.emit('respawn')
    })

    bot.client.on('set_player_game_type', (packet) => {
        bot.game.gameMode = packet.gamemode || 0
        bot.emit('game', { type: 'gameMode', gameMode: packet.gamemode })
    })

    // ---- Player list (tab list) ----
    bot.client.on('player_list', (packet) => {
        const records = packet.records || { records: [] }
        const entries = records.records || records || []

        if (packet.records && packet.records.type === 'add') {
            // Adding players
            for (const entry of entries) {
                const username = entry.username || ''
                if (!username) continue
                const playerObj = {
                    username,
                    uuid: entry.uuid || '',
                    entityId: entry.entity_unique_id || null,
                    xuid: entry.xbox_user_id || '',
                    platformChatId: entry.platform_chat_id || '',
                    buildPlatform: entry.build_platform || 0,
                    skinData: entry.skin_data || null,
                    gamemode: 0,
                    ping: 0,
                    entity: null
                }
                bot.players[username] = playerObj
                if (entry.uuid) {
                    uuidToUsername.set(entry.uuid, username)
                }

                if (username === bot.username) {
                    bot.player = playerObj
                }

                bot.emit('playerJoined', playerObj)
            }
        } else if (packet.records && packet.records.type === 'remove') {
            // Removing players
            for (const entry of entries) {
                const uuid = entry.uuid || ''
                const username = uuidToUsername.get(uuid)
                if (username && bot.players[username]) {
                    const playerObj = bot.players[username]
                    delete bot.players[username]
                    uuidToUsername.delete(uuid)
                    bot.emit('playerLeft', playerObj)
                }
            }
        }
    })

    // ---- Tab list header/footer ----
    bot.client.on('set_commands', () => {
        // Commands list — could be useful later
    })

    // ---- Spawn point ----
    // Fields: spawn_type, player_position {x,y,z}, dimension, world_position {x,y,z}
    bot.client.on('set_spawn_position', (packet) => {
        const pos = packet.world_position || packet.player_position
        if (pos) {
            bot.spawnPoint = new Vec3(pos.x, pos.y, pos.z)
        }
        bot.emit('spawnReset')
    })

    // ---- Respawn method ----
    /**
     * Manually respawn (when auto-respawn is off).
     */
    bot.respawn = function () {
        bot.client.queue('player_action', {
            runtime_entity_id: bot._runtimeEntityId,
            action: 'respawn',
            position: { x: 0, y: 0, z: 0 },
            result_position: { x: 0, y: 0, z: 0 },
            face: 0
        })
    }
}

function _parseDimension(dim) {
    switch (dim) {
        case 0: return 'overworld'
        case 1: return 'the_nether'
        case 2: return 'the_end'
        default: return `dimension_${dim}`
    }
}

function _calculateLevelFromXP(xp) {
    if (xp <= 0) return 0
    let level = 0
    let totalXpNeeded = 0
    while (totalXpNeeded <= xp) {
        totalXpNeeded += _xpForLevel(level)
        if (totalXpNeeded <= xp) level++
    }
    return level
}

function _xpForLevel(level) {
    if (level < 16) {
        return 2 * level + 7
    } else if (level < 31) {
        return 5 * level - 38
    } else {
        return 9 * level - 207
    }
}

module.exports = healthPlugin
