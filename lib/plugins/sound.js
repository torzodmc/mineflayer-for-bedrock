/**
 * Sound Plugin for bedrockflayer.
 *
 * Tracks sound events from the server via level_sound_event packets.
 * Emits 'soundPlayed' events that user scripts can react to.
 */

function soundPlugin(bot) {
    // ---- Sound events ----
    bot.client.on('level_sound_event', (packet) => {
        const sound = {
            name: packet.sound || packet.sound_id || 'unknown',
            position: packet.position ? {
                x: packet.position.x,
                y: packet.position.y,
                z: packet.position.z
            } : null,
            volume: packet.extra_data !== undefined ? packet.extra_data : 1,
            entityType: packet.entity_type || '',
            isBabyMob: packet.is_baby_mob || false,
            isGlobal: packet.is_global || false
        }

        bot.emit('soundPlayed', sound)

        // Emit named events for common sounds
        const name = String(sound.name).toLowerCase()
        if (name.includes('explode')) bot.emit('sound:explosion', sound)
        if (name.includes('thunder')) bot.emit('sound:thunder', sound)
        if (name.includes('door')) bot.emit('sound:door', sound)
        if (name.includes('chest')) bot.emit('sound:chest', sound)
        if (name.includes('note')) bot.emit('sound:noteblock', sound)
        if (name.includes('portal')) bot.emit('sound:portal', sound)
    })

    // ---- World sound events (level_event with sound) ----
    bot.client.on('level_event', (packet) => {
        const event = packet.event || 0
        // Sound-related level events (particle + sound combos)
        // 1000–1100 range are sound events
        if (event >= 1000 && event <= 1100) {
            bot.emit('soundPlayed', {
                name: `level_event_${event}`,
                position: packet.position || null,
                volume: 1,
                entityType: '',
                isBabyMob: false,
                isGlobal: false
            })
        }
    })
}

module.exports = soundPlugin
