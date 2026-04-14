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

function controlsPlugin(bot) {
    // ---- Set a single control ----

    /**
     * Set a movement control state.
     * @param {'forward'|'back'|'left'|'right'|'jump'|'sprint'|'sneak'} control
     * @param {boolean} state
     */
    bot.setControlState = function (control, state) {
        if (bot.controlState[control] !== undefined) {
            bot.controlState[control] = !!state
        }
    }

    /**
     * Get a control state.
     * @param {'forward'|'back'|'left'|'right'|'jump'|'sprint'|'sneak'} control
     * @returns {boolean}
     */
    bot.getControlState = function (control) {
        return bot.controlState[control] || false
    }

    /**
     * Reset all controls to false.
     */
    bot.clearControlStates = function () {
        for (const key in bot.controlState) {
            bot.controlState[key] = false
        }
    }

    // ---- Looking ----

    /**
     * Set the bot's look direction.
     * @param {number} yaw - Yaw in radians
     * @param {number} pitch - Pitch in radians
     * @param {boolean} [force=false] - If true, set instantly. If false, smooth over ticks (TODO).
     */
    bot.look = function (yaw, pitch, force = false) {
        if (!bot.entity) return
        bot.entity.yaw = yaw
        bot.entity.pitch = pitch
        bot.entity.headYaw = yaw
    }

    /**
     * Make the bot look at a specific world position.
     * @param {Vec3} point - Target position to look at
     * @param {boolean} [force=false]
     */
    bot.lookAt = function (point, force = false) {
        if (!bot.entity) return
        const eyePos = bot.entity.position.offset(0, 1.62, 0)
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
        return new Promise((resolve) => {
            bot.setControlState('forward', true)
            setTimeout(() => {
                bot.setControlState('forward', false)
                resolve()
            }, ms)
        })
    }

    /**
     * Sprint forward for a number of milliseconds then stop.
     * @param {number} ms
     * @returns {Promise<void>}
     */
    bot.sprintForward = function (ms) {
        return new Promise((resolve) => {
            bot.setControlState('forward', true)
            bot.setControlState('sprint', true)
            setTimeout(() => {
                bot.setControlState('forward', false)
                bot.setControlState('sprint', false)
                resolve()
            }, ms)
        })
    }

    /**
     * Jump once (press and release after landing).
     * @returns {Promise<void>}
     */
    bot.jump = function () {
        return new Promise((resolve) => {
            bot.setControlState('jump', true)
            // Release jump after a few ticks
            setTimeout(() => {
                bot.setControlState('jump', false)
                resolve()
            }, 150) // ~3 ticks
        })
    }
}

module.exports = controlsPlugin
