/**
 * Time & Weather Plugin for bedrockflayer.
 *
 * Tracks time of day, day count, and weather state from server packets.
 */

function timePlugin(bot) {
    // ---- State ----
    bot.time = {
        timeOfDay: 0,       // 0–24000
        day: 0,             // Day count
        age: 0,             // Total ticks the world has existed
        isRaining: false,
        rainLevel: 0,       // 0–1
        thundering: false,
        thunderLevel: 0     // 0–1
    }

    // ---- Time updates ----
    bot.client.on('set_time', (packet) => {
        if (packet.time !== undefined) {
            bot.time.timeOfDay = packet.time
        }
        if (packet.day !== undefined) {
            bot.time.day = packet.day
        }
        bot.emit('time')
    })

    // ---- Weather from game rules ----
    bot.client.on('game_rules_changed', (packet) => {
        const rules = packet.rules || packet.game_rules || []
        for (const rule of rules) {
            if (rule.name === 'doweathercycle') {
                // Just tracking the rule, not the weather state
            }
        }
    })

    // ---- Weather from level_event ----
    bot.client.on('level_event', (packet) => {
        const event = packet.event || packet.event_id

        switch (event) {
            case 3001: // Start rain
                bot.time.isRaining = true
                bot.time.rainLevel = 1
                bot.emit('rain')
                bot.emit('weatherUpdate')
                break
            case 3002: // Stop rain
                bot.time.isRaining = false
                bot.time.rainLevel = 0
                bot.emit('rain')
                bot.emit('weatherUpdate')
                break
            case 3003: // Start thunder
                bot.time.thundering = true
                bot.time.thunderLevel = 1
                bot.emit('thunderState')
                bot.emit('weatherUpdate')
                break
            case 3004: // Stop thunder
                bot.time.thundering = false
                bot.time.thunderLevel = 0
                bot.emit('thunderState')
                bot.emit('weatherUpdate')
                break
        }
    })

    // ============================================================
    //  Convenience Methods
    // ============================================================

    /**
     * Check if it's currently daytime (6000–18000 ticks).
     * @returns {boolean}
     */
    bot.isDay = function () {
        const t = bot.time.timeOfDay % 24000
        return t >= 0 && t < 12000
    }

    /**
     * Check if it's currently nighttime.
     * @returns {boolean}
     */
    bot.isNight = function () {
        const t = bot.time.timeOfDay % 24000
        return t >= 13000 && t < 23000
    }

    /**
     * Check if it's raining.
     * @returns {boolean}
     */
    bot.isRaining = function () {
        return bot.time.isRaining
    }

    /**
     * Check if it's thundering.
     * @returns {boolean}
     */
    bot.isThundering = function () {
        return bot.time.thundering
    }

    /**
     * Get a human-readable time string.
     * @returns {string} e.g., "Day 5, 12:30 (Noon)"
     */
    bot.timeOfDayString = function () {
        const t = bot.time.timeOfDay % 24000
        const hours = Math.floor(t / 1000) + 6 // Minecraft day starts at 6:00
        const normalizedHours = hours % 24
        const minutes = Math.floor((t % 1000) / 1000 * 60)

        let period = ''
        if (t < 6000) period = 'Morning'
        else if (t < 12000) period = 'Afternoon'
        else if (t < 13000) period = 'Dusk'
        else if (t < 23000) period = 'Night'
        else period = 'Dawn'

        const hh = String(normalizedHours).padStart(2, '0')
        const mm = String(minutes).padStart(2, '0')
        return `Day ${bot.time.day}, ${hh}:${mm} (${period})`
    }

    /**
     * Wait until a specific time of day.
     * @param {number} targetTime - Target time (0–24000)
     * @returns {Promise<void>}
     */
    bot.waitForTime = function (targetTime) {
        return new Promise((resolve) => {
            const check = () => {
                const current = bot.time.timeOfDay % 24000
                const diff = Math.abs(current - targetTime)
                if (diff < 500) { // within ~25 seconds tolerance
                    bot.removeListener('time', check)
                    resolve()
                }
            }

            // Check immediately
            const current = bot.time.timeOfDay % 24000
            if (Math.abs(current - targetTime) < 500) {
                resolve()
                return
            }

            bot.on('time', check)
        })
    }
}

module.exports = timePlugin
