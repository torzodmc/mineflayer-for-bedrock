/**
 * Controls Plugin for bedrockflayer.
 *
 * Provides high-level movement control methods:
 * - bot.setControlState(control, state)
 * - bot.clearControlStates()
 * - bot.look(yaw, pitch)
 * - bot.lookAt(point)
 */

const { yawTo, pitchTo } = require('../utils/math')
const C = require('../physics/constants')

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

function controlsPlugin(bot) {
    // ---- Set a single control ----

    /**
     * Set a movement control state.
     * @param {'forward'|'back'|'left'|'right'|'jump'|'sprint'|'sneak'} control
     * @param {boolean} state
     */
    bot.setControlState = function (control, state) {
        if (bot.controlState[control] === undefined) {
            throw new Error(`Unknown control: ${control}`)
        }
        bot.controlState[control] = !!state
    }

    /**
     * Reset all controls to false.
     */
    bot.clearControlStates = function () {
        for (const key in bot.controlState) {
            bot.controlState[key] = false
        }
    }

    /**
     * Get a movement control state.
     * @param {'forward'|'back'|'left'|'right'|'jump'|'sprint'|'sneak'} control
     * @returns {boolean} The current state of the control
     */
    bot.getControlState = function (control) {
        if (bot.controlState[control] === undefined) {
            return false
        }
        return bot.controlState[control]
    }

    // ---- Looking ----

    /**
     * Set the bot's look direction.
     * @param {number} yaw - Yaw in radians
     * @param {number} pitch - Pitch in radians
     * @param {boolean} [force=true] - If true, send packet immediately. If false, wait for physics tick.
     */
    bot.look = function (yaw, pitch, force = true) {
        if (!bot.entity) return
        if (typeof yaw !== 'number' || typeof pitch !== 'number') {
            throw new Error('yaw and pitch must be numbers')
        }
        if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) {
            throw new Error('yaw and pitch must be finite numbers')
        }
        bot.entity.yaw = yaw
        bot.entity.pitch = pitch
        bot.entity.headYaw = yaw
        if (force) {
            bot._sendLook()
        }
    }

    bot._sendLook = function () {
        if (!bot.entity) return
        const packetOpts = _getPacketOptions(bot)
        const inputData = _buildInputData(bot.controlState)
        bot.client.queue('player_auth_input', {
            pitch: bot.entity.pitch,
            yaw: bot.entity.yaw,
            position: {
                x: bot.entity.position.x,
                y: bot.entity.position.y + C.PLAYER_EYE_HEIGHT,
                z: bot.entity.position.z
            },
            head_yaw: bot.entity.headYaw !== undefined ? bot.entity.headYaw : bot.entity.yaw,
            move_vector: { x: 0, y: 0 },
            analogue_move_vector: { x: 0, y: 0 },
            input_data: inputData,
            input_mode: packetOpts.input_mode,
            play_mode: packetOpts.play_mode,
            interaction_model: packetOpts.interaction_model,
            delta: { x: 0, y: 0, z: 0 }
        })
    }

    /**
     * Make the bot look at a specific world position.
     * @param {Vec3} point - Target position to look at
     * @param {boolean} [force=true]
     */
    bot.lookAt = function (point, force = true) {
        if (!bot.entity) return
        if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || typeof point.z !== 'number') {
            throw new Error('point must have x, y, z properties')
        }
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
            throw new Error('point coordinates must be finite numbers')
        }
        const eyePos = bot.entity.position.offset(0, C.PLAYER_EYE_HEIGHT, 0)
        const yaw = yawTo(eyePos, point)
        const pitch = pitchTo(eyePos, point)
        bot.look(yaw, pitch, force)
    }

    // ---- High-level convenience methods ----

    /**
     * Walk forward for a number of milliseconds then stop.
     * @param {number} ms - Duration in milliseconds
     * @returns {Promise<void>}
     */
    bot.walkForward = function (ms) {
        return new Promise((resolve, reject) => {
            if (!bot.entity) {
                reject(new Error('No entity'))
                return
            }
            const cleanup = () => {
                clearTimeout(timeout)
                bot.removeListener('disconnect', onDisconnect)
            }
            const onDisconnect = () => {
                cleanup()
                reject(new Error('Disconnected'))
            }
            bot.setControlState('forward', true)
            const timeout = setTimeout(() => {
                cleanup()
                bot.setControlState('forward', false)
                resolve()
            }, ms)
            bot.on('disconnect', onDisconnect)
        })
    }

    /**
     * Sprint forward for a number of milliseconds then stop.
     * @param {number} ms
     * @returns {Promise<void>}
     */
    bot.sprintForward = function (ms) {
        return new Promise((resolve, reject) => {
            if (!bot.entity) {
                reject(new Error('No entity'))
                return
            }
            const cleanup = () => {
                clearTimeout(timeout)
                bot.removeListener('disconnect', onDisconnect)
            }
            const onDisconnect = () => {
                cleanup()
                reject(new Error('Disconnected'))
            }
            bot.setControlState('forward', true)
            bot.setControlState('sprint', true)
            const timeout = setTimeout(() => {
                cleanup()
                bot.setControlState('forward', false)
                bot.setControlState('sprint', false)
                resolve()
            }, ms)
            bot.on('disconnect', onDisconnect)
        })
    }

    /**
     * Jump once (press and release after landing).
     * @returns {Promise<void>}
     */
    bot.jump = function () {
        return new Promise((resolve, reject) => {
            if (!bot.entity) {
                reject(new Error('No entity'))
                return
            }
            bot.setControlState('jump', true)
            const onPhysicsTick = () => {
                if (bot.entity.onGround) {
                    bot.removeListener('physicsTick', onPhysicsTick)
                    bot.setControlState('jump', false)
                    resolve()
                }
            }
            bot.on('physicsTick', onPhysicsTick)
            const timeout = setTimeout(() => {
                bot.removeListener('physicsTick', onPhysicsTick)
                bot.setControlState('jump', false)
                resolve()
            }, 3000)
            bot.on('disconnect', () => {
                clearTimeout(timeout)
                bot.removeListener('physicsTick', onPhysicsTick)
                reject(new Error('Disconnected'))
            })
        })
    }
}

module.exports = controlsPlugin
