/**
 * Scoreboard Plugin for bedrockflayer.
 *
 * Tracks sidebar, belowName, and list scoreboards, plus boss bars.
 * Listens to set_display_objective, set_score, remove_objective,
 * and boss_event packets.
 */

function scoreboardPlugin(bot) {
    // ---- State ----
    bot.scoreboards = {}       // objectiveName → { name, displayName, sortOrder, scores: {} }
    bot.scoreboardDisplay = {  // Currently displayed scoreboard per slot
        sidebar: null,           // objectiveName
        list: null,
        belowName: null
    }
    bot.bossBars = {}          // entityId → { title, percent, color, overlay }

    // ---- Set Display Objective ----
    bot.client.on('set_display_objective', (packet) => {
        const name = packet.objective_name || ''
        const displayName = packet.display_name || name
        const criteria = packet.criteria || 'dummy'
        const sortOrder = packet.sort_order || 0

        if (!bot.scoreboards[name]) {
            bot.scoreboards[name] = {
                name,
                displayName,
                criteria,
                sortOrder,
                scores: {}
            }
        } else {
            bot.scoreboards[name].displayName = displayName
            bot.scoreboards[name].sortOrder = sortOrder
        }

        // Map display slot
        const slot = packet.display_slot || ''
        if (slot === 'sidebar') bot.scoreboardDisplay.sidebar = name
        else if (slot === 'list') bot.scoreboardDisplay.list = name
        else if (slot === 'belowname') bot.scoreboardDisplay.belowName = name

        bot.emit('scoreboardCreated', bot.scoreboards[name])
        bot.emit('scoreboardDisplay', slot, bot.scoreboards[name])
    })

    // ---- Set Score ----
    bot.client.on('set_score', (packet) => {
        const type = packet.type || packet.action // 'change' or 'remove'
        const entries = packet.entries || []

        for (const entry of entries) {
            const objName = entry.objective_name || ''
            const scoreboard = bot.scoreboards[objName]
            if (!scoreboard) continue

            const identity = entry.entry_id || entry.scoreboard_id || 0
            const displayName = entry.custom_name || entry.name || `${identity}`

            if (type === 'remove') {
                delete scoreboard.scores[identity]
                bot.emit('scoreRemoved', scoreboard, identity)
            } else {
                scoreboard.scores[identity] = {
                    id: identity,
                    name: displayName,
                    value: entry.score || 0
                }
                bot.emit('scoreUpdated', scoreboard, scoreboard.scores[identity])
            }
        }
    })

    // ---- Remove Objective ----
    bot.client.on('remove_objective', (packet) => {
        const name = packet.objective_name || ''
        const scoreboard = bot.scoreboards[name]

        if (scoreboard) {
            // Clear display slot if this was displayed
            if (bot.scoreboardDisplay.sidebar === name) bot.scoreboardDisplay.sidebar = null
            if (bot.scoreboardDisplay.list === name) bot.scoreboardDisplay.list = null
            if (bot.scoreboardDisplay.belowName === name) bot.scoreboardDisplay.belowName = null

            delete bot.scoreboards[name]
            bot.emit('scoreboardDeleted', scoreboard)
        }
    })

    // ---- Boss Bar Events ----
    bot.client.on('boss_event', (packet) => {
        const entityId = packet.boss_entity_id || packet.entity_unique_id || 0
        const type = packet.type || packet.event_type

        switch (type) {
            case 0: // Show
                bot.bossBars[entityId] = {
                    entityId,
                    title: packet.title || '',
                    percent: packet.health_percent || 0,
                    color: packet.color || 0,
                    overlay: packet.overlay || 0
                }
                bot.emit('bossBarCreated', bot.bossBars[entityId])
                break
            case 1: // Update
                if (bot.bossBars[entityId]) {
                    if (packet.title !== undefined) bot.bossBars[entityId].title = packet.title
                    if (packet.health_percent !== undefined) bot.bossBars[entityId].percent = packet.health_percent
                    bot.emit('bossBarUpdated', bot.bossBars[entityId])
                }
                break
            case 2: // Hide/Remove
                const bar = bot.bossBars[entityId]
                delete bot.bossBars[entityId]
                if (bar) bot.emit('bossBarDeleted', bar)
                break
        }
    })

    // ============================================================
    //  Methods
    // ============================================================

    /**
     * Get the sidebar scoreboard data as a sorted array.
     * @returns {Array<{name: string, value: number}>|null}
     */
    bot.getSidebarScores = function () {
        const name = bot.scoreboardDisplay.sidebar
        if (!name || !bot.scoreboards[name]) return null

        const sb = bot.scoreboards[name]
        return Object.values(sb.scores)
            .sort((a, b) => b.value - a.value)
    }

    /**
     * Get a player's score from a specific scoreboard.
     * @param {string} objectiveName
     * @param {string} playerName
     * @returns {number|null}
     */
    bot.getScore = function (objectiveName, playerName) {
        const sb = bot.scoreboards[objectiveName]
        if (!sb) return null

        for (const score of Object.values(sb.scores)) {
            if (score.name === playerName) return score.value
        }
        return null
    }
}

module.exports = scoreboardPlugin
