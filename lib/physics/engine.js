/**
 * Physics Tick Engine for bedrockflayer.
 *
 * Runs at 20 TPS (50ms per tick). Each tick:
 * 1. Read control state (forward/back/left/right/jump/sprint/sneak)
 * 2. Apply acceleration from controls
 * 3. Apply gravity
 * 4. Resolve collisions with the world
 * 5. Apply drag/friction
 * 6. Send PlayerAuthInput packet to the server
 * 7. Emit 'physicsTick' and 'move'
 */

const { Vec3 } = require('../utils/vec3')
const { moveEntity, isInWater, isInLava, isOnClimbable } = require('./collision')
const C = require('./constants')

function physicsPlugin(bot) {
    // ---- Control state ----
    bot.controlState = {
        forward: false,
        back: false,
        left: false,
        right: false,
        jump: false,
        sprint: false,
        sneak: false
    }

    bot._jumpCooldown = 0
    bot._physicsInterval = null
    bot._lastSentPos = null

    // ---- Start the tick loop on spawn ----
    bot.on('spawn', () => {
        if (bot.physicsEnabled && !bot._physicsInterval) {
            bot._lastSentPos = bot.entity ? bot.entity.position.clone() : null
            _startPhysicsLoop(bot)
        }
    })

    // ---- Stop on disconnect ----
    bot.on('end', () => {
        _stopPhysicsLoop(bot)
    })

    // ---- Handle server position corrections ----
    bot.client.on('correct_player_move_prediction', (packet) => {
        if (packet.position && packet.position.x !== undefined && bot.entity) {
            bot.entity.position.x = packet.position.x
            bot.entity.position.y = packet.position.y - C.PLAYER_EYE_HEIGHT // Server sends head pos
            bot.entity.position.z = packet.position.z
            bot.position = bot.entity.position.clone()
            if (packet.on_ground !== undefined) {
                bot.entity.onGround = packet.on_ground
            }
            bot.entity.velocity.x = 0
            bot.entity.velocity.y = 0
            bot.entity.velocity.z = 0
            bot.emit('forcedMove')
        }
    })

    // ---- Handle teleport (move_player from server) ----
    bot.client.on('move_player', (packet) => {
        const runtimeId = typeof packet.runtime_id === 'bigint'
            ? packet.runtime_id.toString()
            : String(packet.runtime_id)
        if (runtimeId === String(bot._runtimeEntityId) && packet.mode !== 0) {
            // mode !== 0 means server-initiated teleport
            if (packet.position && packet.position.x !== undefined && bot.entity) {
                bot.entity.position.x = packet.position.x
                bot.entity.position.y = packet.position.y - C.PLAYER_EYE_HEIGHT // Server sends head pos
                bot.entity.position.z = packet.position.z
                bot.position = bot.entity.position.clone()
                bot.entity.onGround = packet.on_ground || false
                bot.entity.velocity.x = 0
                bot.entity.velocity.y = 0
                bot.entity.velocity.z = 0
                if (packet.rotation) {
                    bot.entity.pitch = packet.rotation.x || 0
                    bot.entity.yaw = packet.rotation.z || 0
                }
                bot.emit('forcedMove')
            }
        }
    })
}

// ---- Core tick function ----

function _simulateTick(bot) {
    if (!bot.entity) return

    const entity = bot.entity
    const cs = bot.controlState

    // --- Determine environment ---
    const inWater = bot.blockAt ? isInWater(bot, entity) : false
    const inLava = bot.blockAt ? isInLava(bot, entity) : false
    const onClimbable = bot.blockAt ? isOnClimbable(bot, entity) : false

    // --- Calculate horizontal input vector ---
    let inputX = 0
    let inputZ = 0

    if (cs.forward) inputZ -= 1
    if (cs.back) inputZ += 1
    if (cs.left) inputX -= 1
    if (cs.right) inputX += 1

    // Normalize diagonal movement
    const inputLen = Math.sqrt(inputX * inputX + inputZ * inputZ)
    if (inputLen > 0) {
        inputX /= inputLen
        inputZ /= inputLen
    }

    // Rotate input by yaw
    const yaw = entity.yaw
    const sinYaw = Math.sin(yaw)
    const cosYaw = Math.cos(yaw)
    const moveX = inputX * cosYaw - inputZ * sinYaw
    const moveZ = inputX * sinYaw + inputZ * cosYaw

    // --- Determine speed multiplier ---
    let speed = C.PLAYER_SPEED
    if (entity.movementSpeed !== undefined && entity.movementSpeed !== null) {
        speed = entity.movementSpeed
    }
    if (cs.sprint && inputZ < 0) {
        speed *= C.SPRINT_MULTIPLIER
    }
    if (cs.sneak) {
        speed *= C.SNEAK_MULTIPLIER
    }

    // Water/lava reduces speed
    if (inWater) speed = C.WATER_SPEED
    if (inLava) speed = C.LAVA_SPEED

    // --- Apply horizontal acceleration ---
    entity.velocity.x += moveX * speed
    entity.velocity.z += moveZ * speed

    // --- Jumping ---
    if (cs.jump) {
        if (entity.onGround && bot._jumpCooldown <= 0) {
            entity.velocity.y = C.JUMP_VELOCITY

            // Sprint-jump boost - apply in movement direction
            if (cs.sprint && inputZ < 0) {
                const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ)
                if (moveLen > 0) {
                    entity.velocity.x += (moveX / moveLen) * C.SPRINT_JUMP_BOOST
                    entity.velocity.z += (moveZ / moveLen) * C.SPRINT_JUMP_BOOST
                }
            }

            bot._jumpCooldown = C.JUMP_COOLDOWN_TICKS
        } else if (inWater || inLava) {
            entity.velocity.y += 0.04
        } else if (onClimbable) {
            entity.velocity.y = C.LADDER_CLIMB_SPEED
        }
    }

    if (bot._jumpCooldown > 0) bot._jumpCooldown--

    // --- Sneaking on ladder: limit fall speed ---
    if (onClimbable && cs.sneak) {
        entity.velocity.y = Math.max(entity.velocity.y, -C.LADDER_MAX_SPEED)
    } else if (onClimbable && entity.velocity.y < -C.LADDER_MAX_SPEED) {
        entity.velocity.y = -C.LADDER_MAX_SPEED
    }

    // --- Apply gravity ---
    if (!entity.onGround && !onClimbable) {
        const gravity = inWater ? C.WATER_GRAVITY : C.GRAVITY
        entity.velocity.y -= gravity
    }

    // Clamp terminal velocity
    if (entity.velocity.y < C.TERMINAL_VELOCITY) {
        entity.velocity.y = C.TERMINAL_VELOCITY
    }

    // --- Resolve collisions ---
    if (bot.blockAt) {
        const width = entity.width || C.PLAYER_WIDTH
        const height = cs.sneak ? C.SNEAK_HEIGHT : (entity.height || C.PLAYER_HEIGHT)
        const result = moveEntity(bot, entity, entity.velocity, width, height)
        entity.position.x = result.position.x
        entity.position.y = result.position.y
        entity.position.z = result.position.z
        entity.velocity.x = result.velocity.x
        entity.velocity.y = result.velocity.y
        entity.velocity.z = result.velocity.z
        entity.onGround = result.onGround
    } else {
        // No world loaded — just apply velocity directly
        entity.position.x += entity.velocity.x
        entity.position.y += entity.velocity.y
        entity.position.z += entity.velocity.z
        if (entity.position.y < -64) {
            entity.position.y = -64
            entity.velocity.y = 0
            entity.onGround = true
        }
    }

    // --- Apply drag/friction ---
    if (inWater) {
        entity.velocity.x *= C.WATER_DRAG
        entity.velocity.y *= C.WATER_DRAG
        entity.velocity.z *= C.WATER_DRAG
    } else if (inLava) {
        entity.velocity.x *= C.LAVA_DRAG
        entity.velocity.y *= C.LAVA_DRAG
        entity.velocity.z *= C.LAVA_DRAG
    } else {
        const friction = entity.onGround ? C.GROUND_FRICTION : C.AIR_FRICTION
        entity.velocity.x *= friction
        entity.velocity.y *= C.DRAG
        entity.velocity.z *= friction
    }

    // --- Clamp small velocities to zero ---
    if (Math.abs(entity.velocity.x) < 0.003) entity.velocity.x = 0
    if (Math.abs(entity.velocity.z) < 0.003) entity.velocity.z = 0

    // --- Update bot position ---
    bot.position = entity.position.clone()

    // --- Send PlayerAuthInput to server ---
    _sendPositionPacket(bot, inputX, inputZ)

    // --- Increment tick counter ---
    bot.tick++

    // --- Emit events ---
    bot.emit('physicsTick')
    bot.emit('move')
}

function _buildInputData(cs) {
    let flags = 0n

    // Bit positions from official minecraft-data InputFlag definition (bedrock_1.21.0)
    if (cs.jump) flags |= 1n << 6n   // jumping (bit 6)
    if (cs.sneak) flags |= 1n << 8n  // sneaking (bit 8)
    if (cs.sneak && cs.back) flags |= 1n << 9n // sneak_down (bit 9)
    if (cs.sprint) flags |= 1n << 20n // sprinting (bit 20)

    if (cs.forward) flags |= 1n << 10n // up (forward movement)
    if (cs.back) flags |= 1n << 11n   // down (backward movement)
    if (cs.left) flags |= 1n << 12n   // left
    if (cs.right) flags |= 1n << 13n  // right

    const moving = (cs.forward || cs.back || cs.left || cs.right) && !(cs.forward && cs.back && cs.left && cs.right)
    if (moving && cs.forward && cs.left) flags |= 1n << 14n  // up_left
    if (moving && cs.forward && cs.right) flags |= 1n << 15n // up_right

    return flags
}

function _getPacketOptions(bot) {
    const startGameData = bot.client?.startGameData
    if (!startGameData) {
        return { input_mode: 0, play_mode: 0, interaction_model: 0 }
    }

    const engineVersion = startGameData.engine || ''
    const versionParts = engineVersion.split('.')
    const major = parseInt(versionParts[0] || '0', 10)
    const minor = parseInt(versionParts[1] || '0', 10)

    const interaction_model = (major > 1 || (major === 1 && minor >= 19)) ? 1 : 0

    return {
        input_mode: 0,
        play_mode: 0,
        interaction_model
    }
}

function _sendPositionPacket(bot, inputX, inputZ) {
    if (!bot.entity || !bot.client) return

    const entity = bot.entity
    const cs = bot.controlState

    const dx = entity.position.x - (bot._lastSentPos ? bot._lastSentPos.x : entity.position.x)
    const dy = entity.position.y - (bot._lastSentPos ? bot._lastSentPos.y : entity.position.y)
    const dz = entity.position.z - (bot._lastSentPos ? bot._lastSentPos.z : entity.position.z)

    const packetOpts = _getPacketOptions(bot)

    try {
        bot.client.queue('player_auth_input', {
            pitch: entity.pitch || 0,
            yaw: entity.yaw || 0,
            position: {
                x: entity.position.x,
                y: entity.position.y + C.PLAYER_EYE_HEIGHT,
                z: entity.position.z
            },
            move_vector: {
                x: inputX || 0,
                y: inputZ || 0
            },
            analogue_move_vector: {
                x: inputX || 0,
                y: inputZ || 0
            },
            head_yaw: entity.headYaw !== undefined ? entity.headYaw : (entity.yaw || 0),
            input_data: _buildInputData(cs),
            input_mode: packetOpts.input_mode,
            play_mode: packetOpts.play_mode,
            interaction_model: packetOpts.interaction_model,
            tick: BigInt(bot.tick),
            delta: {
                x: dx,
                y: dy,
                z: dz
            },

        })
    } catch (err) {
        bot.emit('error', new Error(`Physics packet send failed: ${err.message}`))
    }

    bot._lastSentPos = entity.position.clone()
}

function _startPhysicsLoop(bot) {
    if (bot._physicsInterval) return
    bot._physicsInterval = setInterval(() => {
        try {
            _simulateTick(bot)
        } catch (err) {
            bot.emit('error', err)
        }
    }, C.TICK_MS)
}

function _stopPhysicsLoop(bot) {
    if (bot._physicsInterval) {
        clearInterval(bot._physicsInterval)
        bot._physicsInterval = null
    }
}

module.exports = physicsPlugin
