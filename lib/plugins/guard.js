/**
 * Guard Plugin for bedrockflayer.
 *
 * Automatically detects and attacks hostile mobs within a configurable radius.
 *
 * Usage:
 *   bot.loadPlugin(require('./plugins/guard'))
 *   bot.guard.enable()
 *   bot.guard.disable()
 *
 * Options:
 *   bot.guard.options.attackRange = 3.5
 *   bot.guard.options.detectRange = 16
 *   bot.guard.options.attackInterval = 500
 *   bot.guard.options.priority = 'nearest' | 'weakest'
 *
 * Events:
 *   'guard_targeting' (entity) — new target acquired
 *   'guard_attack' (entity) — attacked an entity
 *   'guard_killed' (entity) — target entity died/despawned
 *   'guard_idle' — no threats in range
 */

const HOSTILE_MOBS = new Set([
    'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
    'witch', 'slime', 'phantom', 'drowned', 'husk',
    'stray', 'blaze', 'ghast', 'magma_cube', 'silverfish',
    'endermite', 'guardian', 'elder_guardian', 'vindicator',
    'evoker', 'vex', 'pillager', 'ravager', 'hoglin',
    'piglin_brute', 'warden', 'breeze', 'bogged',
    'zombie_villager', 'cave_spider', 'wither_skeleton',
    'shulker', 'piglin', 'zombified_piglin'
])

function guardPlugin(bot) {
    bot.guard = {
        enabled: false,
        target: null,
        options: {
            attackRange: 3.5,       // Max distance to attack
            detectRange: 16,        // Max distance to detect threats
            attackInterval: 500,    // Ms between attacks
            priority: 'nearest',    // 'nearest' | 'weakest'
            targetPlayers: false,   // Attack players too?
            whitelist: [],           // Player names to never attack
            hostileMobs: HOSTILE_MOBS,
        },
        _intervalId: null,
        _lastAttack: 0,

        enable() {
            bot.guard.enabled = true
            if (!bot.guard._intervalId) {
                bot.guard._intervalId = setInterval(() => _guardTick(bot), 250)
            }
        },

        disable() {
            bot.guard.enabled = false
            bot.guard.target = null
            if (bot.guard._intervalId) {
                clearInterval(bot.guard._intervalId)
                bot.guard._intervalId = null
            }
        },

        /**
         * Check if an entity is hostile.
         * @param {Entity} entity
         * @returns {boolean}
         */
        isHostile(entity) {
            if (!entity || !entity.isValid) return false

            // Check mob type
            const name = (entity.name || entity.type || '').toLowerCase()
            if (bot.guard.options.hostileMobs.has(name)) return true

            // Check players (if enabled)
            if (bot.guard.options.targetPlayers && entity.type === 'player') {
                if (entity.username === bot.username) return false // Don't attack self
                if (bot.guard.options.whitelist.includes(entity.username)) return false
                return true
            }

            return false
        },

        /**
         * Get all hostile entities in detection range.
         * @returns {Entity[]}
         */
        getThreats() {
            if (!bot.entity) return []
            const range = bot.guard.options.detectRange
            const threats = []

            for (const entity of Object.values(bot.entities)) {
                if (!entity || entity.id === bot.entity.id) continue
                if (!entity.isValid) continue
                if (!bot.guard.isHostile(entity)) continue

                const dist = bot.entity.position.distanceTo(entity.position)
                if (dist <= range) {
                    threats.push(entity)
                }
            }

            return threats
        }
    }

    // Clean up on disconnect
    bot.on('end', () => {
        bot.guard.disable()
    })
}

function _guardTick(bot) {
    if (!bot.guard.enabled || !bot.entity) return

    const threats = bot.guard.getThreats()

    if (threats.length === 0) {
        if (bot.guard.target) {
            bot.guard.target = null
            bot.emit('guard_idle')
        }
        return
    }

    // Select target based on priority
    let target = null
    if (bot.guard.options.priority === 'weakest') {
        threats.sort((a, b) => (a.health || 20) - (b.health || 20))
        target = threats[0]
    } else {
        // nearest
        threats.sort((a, b) =>
            bot.entity.position.distanceTo(a.position) -
            bot.entity.position.distanceTo(b.position)
        )
        target = threats[0]
    }

    if (!target) return

    // New target?
    if (!bot.guard.target || bot.guard.target.id !== target.id) {
        bot.guard.target = target
        bot.emit('guard_targeting', target)
    }

    // Check if target is in attack range
    const dist = bot.entity.position.distanceTo(target.position)

    if (dist <= bot.guard.options.attackRange) {
        const now = Date.now()
        if (now - bot.guard._lastAttack >= bot.guard.options.attackInterval) {
            // Attack!
            if (bot.attack) {
                bot.attack(target)
                bot.guard._lastAttack = now
                bot.emit('guard_attack', target)
            }

            // Look at target
            if (bot.lookAt) {
                bot.lookAt(target.position.offset(0, target.height * 0.8, 0))
            }
        }
    } else if (bot.pathfinder && !bot.pathfinder.isActive()) {
        // Chase the target
        try {
            const { GoalNear } = require('./pathfinder')
            bot.pathfinder.goto(new GoalNear(
                target.position.x,
                target.position.y,
                target.position.z,
                bot.guard.options.attackRange - 0.5
            )).catch(() => { }) // Ignore path errors during guard
        } catch (e) {
            // Pathfinding not available or failed
        }
    }

    // Check if target died
    if (target && (!target.isValid || (target.health !== undefined && target.health <= 0))) {
        bot.emit('guard_killed', target)
        bot.guard.target = null
    }
}

module.exports = guardPlugin
