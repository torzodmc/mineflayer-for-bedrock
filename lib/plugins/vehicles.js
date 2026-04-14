/**
 * Vehicles Plugin for bedrockflayer.
 *
 * Handles mounting, dismounting, and controlling vehicles
 * (boats, minecarts, horses, pigs, striders, etc.).
 */

function vehiclesPlugin(bot) {
    // ---- State ----
    bot.vehicle = null // Currently mounted entity

    // ---- Detect mount via entity link ----
    bot.on('entityAttach', (rider, vehicle) => {
        if (rider && rider.id === bot._runtimeEntityId && vehicle) {
            bot.vehicle = vehicle
            bot.emit('mount', vehicle)
        }
    })

    bot.on('entityDetach', (rider, vehicle) => {
        if (rider && rider.id === bot._runtimeEntityId) {
            const prev = bot.vehicle
            bot.vehicle = null
            bot.emit('dismount', prev)
        }
    })

    // ---- Detect mount from set_entity_link directly ----
    bot.client.on('set_entity_link', (packet) => {
        const link = packet.link || packet
        const riderId = link.rider_entity_id || link.ridden_entity_id
        const vehicleId = link.ridden_entity_id || link.rider_entity_id
        const linkType = link.type

        if (riderId === bot._runtimeEntityId) {
            if (linkType === 0) {
                // Dismount
                const prev = bot.vehicle
                bot.vehicle = null
                if (prev) bot.emit('dismount', prev)
            } else {
                // Mount
                bot.vehicle = bot.entities[vehicleId] || { id: vehicleId }
                bot.emit('mount', bot.vehicle)
            }
        }
    })

    // ============================================================
    //  Methods
    // ============================================================

    /**
     * Mount a nearby vehicle/entity.
     * @param {Entity} entity - The vehicle entity to mount
     * @returns {Promise<void>}
     */
    bot.mount = function (entity) {
        return new Promise((resolve, reject) => {
            if (!entity) return reject(new Error('No entity to mount'))

            // Interact with the entity to mount
            bot.client.queue('interact', {
                action_id: 4, // Ride/mount
                target_entity_id: entity.id,
                position: { x: 0, y: 0, z: 0 }
            })

            // Listen for the mount event
            const onMount = (vehicle) => {
                bot.removeListener('mount', onMount)
                resolve()
            }
            bot.on('mount', onMount)

            // Timeout
            setTimeout(() => {
                bot.removeListener('mount', onMount)
                if (!bot.vehicle) reject(new Error('Mount timed out'))
            }, 3000)
        })
    }

    /**
     * Dismount the currently mounted vehicle.
     */
    bot.dismount = function () {
        if (!bot.vehicle) return

        bot.client.queue('player_action', {
            runtime_entity_id: bot._runtimeEntityId,
            action: 'stop_riding',
            position: { x: 0, y: 0, z: 0 },
            result_position: { x: 0, y: 0, z: 0 },
            face: 0
        })

        const prev = bot.vehicle
        bot.vehicle = null
        bot.emit('dismount', prev)
    }

    /**
     * Steer a mounted vehicle using control inputs.
     * The physics engine already sends PlayerAuthInput with control state,
     * which the server uses to steer vehicles. This method just sets controls.
     * @param {number} forward - Forward input (-1 to 1)
     * @param {number} strafe - Strafe input (-1 to 1)
     */
    bot.steerVehicle = function (forward, strafe) {
        if (!bot.vehicle) return

        // Controls are handled via the normal PlayerAuthInput packet
        // We just set the control state appropriately
        bot.setControlState('forward', forward > 0)
        bot.setControlState('back', forward < 0)
        bot.setControlState('left', strafe > 0)
        bot.setControlState('right', strafe < 0)
    }
}

module.exports = vehiclesPlugin
