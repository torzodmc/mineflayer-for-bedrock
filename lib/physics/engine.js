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
            _startPhysicsLoop(bot)
        }
    })

    // ---- Stop on disconnect ----
    bot.on('end', () => {
        _stopPhysicsLoop(bot)
    })

    // ---- Handle server position corrections ----
    bot.client.on('correct_player_move_prediction', (packet) => {
        if (packet.position && bot.entity) {
            bot.entity.position.x = packet.position.x
            bot.entity.position.y = packet.position.y
            bot.entity.position.z = packet.position.z
            bot.position = bot.entity.position.clone()
            if (packet.on_ground !== undefined) {
                bot.entity.onGround = packet.on_ground
            }
            bot.emit('forcedMove')
        }
    })

    // ---- Handle teleport (move_player from server) ----
    bot.client.on('move_player', (packet) => {
        if (Number(packet.runtime_id) === bot._runtimeEntityId && packet.mode !== 0) {
            // mode !== 0 means server-initiated teleport
            if (packet.position && bot.entity) {
                bot.entity.position.x = packet.position.x
                bot.entity.position.y = packet.position.y - C.PLAYER_EYE_HEIGHT // Server sends head pos
                bot.entity.position.z = packet.position.z
                bot.position = bot.entity.position.clone()
                bot.entity.onGround = packet.on_ground || false
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

    if (cs.forward) inputZ += 1
    if (cs.back) inputZ -= 1
    if (cs.left) inputX += 1
    if (cs.right) inputX -= 1

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
    if (cs.sprint && inputZ > 0) {
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

            // Sprint-jump boost
            if (cs.sprint && inputZ > 0) {
                entity.velocity.x += -sinYaw * C.SPRINT_JUMP_BOOST
                entity.velocity.z += cosYaw * C.SPRINT_JUMP_BOOST
            }

            bot._jumpCooldown = C.JUMP_COOLDOWN_TICKS
        } else if (inWater || inLava) {
            entity.velocity.y += 0.04 // swim upward
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
        const result = moveEntity(bot, entity, entity.velocity)
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

function _sendPositionPacket(bot, inputX, inputZ) {
    if (!bot.entity || !bot.client) return

    const entity = bot.entity
    const cs = bot.controlState

    // Build input_data flags
    let inputData = 0
    if (cs.jump) inputData |= (1 << 0)   // Ascend
    if (cs.sneak) inputData |= (1 << 1)   // Descend
    if (cs.forward) inputData |= (1 << 2) // North
    if (cs.back) inputData |= (1 << 3)    // South
    if (cs.left) inputData |= (1 << 4)    // West (actually left relative)
    if (cs.right) inputData |= (1 << 5)   // East (actually right relative)
    if (cs.sprint) inputData |= (1 << 8)  // Sprint
    if (cs.sneak) inputData |= (1 << 9)   // Sneak

    try {
        bot.client.queue('player_auth_input', {
            pitch: entity.pitch,
            yaw: entity.yaw,
            position: {
                x: entity.position.x,
                y: entity.position.y + C.PLAYER_EYE_HEIGHT, // Server expects head position
                z: entity.position.z
            },
            move_vector: {
                x: inputX,
                z: inputZ
            },
            head_yaw: entity.yaw,
            input_data: {
                _value: inputData,
                ascend: cs.jump,
                descend: cs.sneak,
                north_jump: cs.forward,
                south_jump: cs.back,
                // Some versions send bitmask, some send object — bedrock-protocol handles it
            },
            input_mode: 1, // Keyboard
            play_mode: 0,  // Normal
            tick: bot.tick,
            delta: {
                x: entity.position.x - (bot._lastSentPos ? bot._lastSentPos.x : entity.position.x),
                y: entity.position.y - (bot._lastSentPos ? bot._lastSentPos.y : entity.position.y),
                z: entity.position.z - (bot._lastSentPos ? bot._lastSentPos.z : entity.position.z)
            }
        })
    } catch (err) {
        // Packet format may vary between protocol versions — degrade gracefully
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
