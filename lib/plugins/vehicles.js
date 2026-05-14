/**
 * Vehicles Plugin for bedrockflayer.
 *
 * Handles mounting, dismounting, and controlling vehicles
 * (boats, minecarts, horses, pigs, striders, etc.).
 */

function vehiclesPlugin(bot) {
    // ---- State ----
    bot.vehicle = null // Currently mounted entity
    let mountEventSource = null // Track which event source triggered mount

    // ---- Unified mount handler ----
    const handleMount = (vehicle, source) => {
        if (bot.vehicle && bot.vehicle.id === vehicle.id) return
        if (mountEventSource === source) return

        bot.vehicle = vehicle
        mountEventSource = source
        bot.emit('mount', vehicle)

        setTimeout(() => { mountEventSource = null }, 100)
    }

    const handleDismount = (vehicle, source) => {
        if (!bot.vehicle) return

        const prev = bot.vehicle
        bot.vehicle = null
        bot.emit('dismount', prev)
    }

    // ---- Detect mount via entity link ----
    bot.on('entityAttach', (rider, vehicle) => {
        if (rider && rider.id === bot._runtimeEntityId && vehicle) {
            handleMount(vehicle, 'entityAttach')
        }
    })

    bot.on('entityDetach', (rider, vehicle) => {
        if (rider && rider.id === bot._runtimeEntityId) {
            handleDismount(vehicle, 'entityAttach')
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
                handleDismount(null, 'set_entity_link')
            } else {
                // Mount
                const vehicle = bot.entities[vehicleId] || { id: vehicleId }
                handleMount(vehicle, 'set_entity_link')
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

            if (bot.vehicle && bot.vehicle.id === entity.id) {
                return resolve()
            }

            // Right-click interact with the entity to mount (inventory_transaction type 3 = item_use_on_entity)
            const playerPos = bot.entity ? {
                x: bot.entity.position.x,
                y: bot.entity.position.y + 1.62,
                z: bot.entity.position.z
            } : { x: 0, y: 0, z: 0 }

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 3,
                    actions: [],
                    transaction_data: {
                        entity_runtime_id: entity.id,
                        action_type: 0, // interact (right-click)
                        hotbar_slot: bot.quickBarSlot ?? 0,
                        held_item: bot.heldItem ? bot.heldItem.toNetwork() : { network_id: 0 },
                        player_pos: playerPos,
                        click_pos: {
                            x: entity.position.x,
                            y: entity.position.y + (entity.height || 1) * 0.5,
                            z: entity.position.z
                        }
                    }
                }
            })

            // Listen for the mount event
            const onMount = (vehicle) => {
                if (vehicle && vehicle.id === entity.id) {
                    bot.removeListener('mount', onMount)
                    clearTimeout(timeout)
                    resolve()
                }
            }
            bot.on('mount', onMount)

            // Timeout
            const timeout = setTimeout(() => {
                bot.removeListener('mount', onMount)
                if (!bot.vehicle || bot.vehicle.id !== entity.id) {
                    reject(new Error('Mount timed out'))
                } else {
                    resolve()
                }
            }, 3000)
        })
    }

    /**
     * Dismount the currently mounted vehicle.
     */
    bot.dismount = function () {
        if (!bot.vehicle) return

        // Bedrock dismount: interact packet with action_id 3 = leave_vehicle
        bot.client.queue('interact', {
            action_id: 3, // leave_vehicle
            target_entity_id: bot.vehicle.id,
            position: bot.entity ? {
                x: bot.entity.position.x,
                y: bot.entity.position.y,
                z: bot.entity.position.z
            } : { x: 0, y: 0, z: 0 }
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
