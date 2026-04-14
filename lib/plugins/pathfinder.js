/**
 * Pathfinder Plugin for bedrockflayer.
 *
 * Provides A* pathfinding with:
 * - Multiple Goal types (GoalNear, GoalBlock, GoalXZ, GoalFollow)
 * - Movement types: walk, jump (1 block), fall (up to 3), swim, climb
 * - Uses bot.blockAt() for walkability checks
 * - bot.pathfinder.goto(goal) → Promise
 * - bot.pathfinder.stop() — cancel
 */

const { Vec3 } = require('../utils/vec3')

// ============================================================
//  Goal Classes
// ============================================================

class GoalBlock {
    constructor(x, y, z) {
        this.x = Math.floor(x)
        this.y = Math.floor(y)
        this.z = Math.floor(z)
    }
    isEnd(node) { return node.x === this.x && node.y === this.y && node.z === this.z }
    heuristic(node) {
        return Math.abs(node.x - this.x) + Math.abs(node.y - this.y) + Math.abs(node.z - this.z)
    }
}

class GoalNear {
    constructor(x, y, z, range) {
        this.x = x; this.y = y; this.z = z; this.range = range
    }
    isEnd(node) {
        const dx = node.x - this.x, dy = node.y - this.y, dz = node.z - this.z
        return Math.sqrt(dx * dx + dy * dy + dz * dz) <= this.range
    }
    heuristic(node) {
        const dx = node.x - this.x, dy = node.y - this.y, dz = node.z - this.z
        return Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - this.range)
    }
}

class GoalXZ {
    constructor(x, z) { this.x = Math.floor(x); this.z = Math.floor(z) }
    isEnd(node) { return node.x === this.x && node.z === this.z }
    heuristic(node) {
        return Math.abs(node.x - this.x) + Math.abs(node.z - this.z)
    }
}

class GoalFollow {
    constructor(entity, range) { this.entity = entity; this.range = range || 2 }
    isEnd(node) {
        if (!this.entity || !this.entity.position) return false
        const dx = node.x - Math.floor(this.entity.position.x)
        const dy = node.y - Math.floor(this.entity.position.y)
        const dz = node.z - Math.floor(this.entity.position.z)
        return Math.sqrt(dx * dx + dy * dy + dz * dz) <= this.range
    }
    heuristic(node) {
        if (!this.entity || !this.entity.position) return 0
        const dx = node.x - this.entity.position.x
        const dy = node.y - this.entity.position.y
        const dz = node.z - this.entity.position.z
        return Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - this.range)
    }
}

class GoalInvert {
    constructor(goal) { this.goal = goal }
    isEnd(node) { return !this.goal.isEnd(node) }
    heuristic(node) { return -this.goal.heuristic(node) }
}

// ============================================================
//  A* Pathfinder
// ============================================================

/**
 * Check if a position is safe to stand on.
 * Needs solid ground below and 2 walkable blocks at feet+head.
 */
function isSafe(bot, x, y, z) {
    const below = bot.blockAt(new Vec3(x, y - 1, z))
    const feet = bot.blockAt(new Vec3(x, y, z))
    const head = bot.blockAt(new Vec3(x, y + 1, z))

    const belowSolid = below && below.solid && !below.isAir
    const feetFree = !feet || feet.isAir || !feet.solid
    const headFree = !head || head.isAir || !head.solid

    return belowSolid && feetFree && headFree
}

/**
 * Check if a block is safe to walk through (air, non-solid).
 */
function isWalkable(bot, x, y, z) {
    const block = bot.blockAt(new Vec3(x, y, z))
    return !block || block.isAir || !block.solid
}

/**
 * Get neighbors for A* expansion.
 * Movement types: walk flat, walk diagonal, jump up 1, fall down 1-3, swim, climb.
 */
function getNeighbors(bot, node) {
    const neighbors = []
    const { x, y, z } = node

    // Cardinal directions
    const dirs = [
        [1, 0], [-1, 0], [0, 1], [0, -1],   // straight
        [1, 1], [1, -1], [-1, 1], [-1, -1]   // diagonal
    ]

    for (const [dx, dz] of dirs) {
        const nx = x + dx
        const nz = z + dz
        const isDiag = dx !== 0 && dz !== 0

        // --- Walk flat ---
        if (isSafe(bot, nx, y, nz)) {
            // For diagonal, check both adjacent cardinals are passable
            if (isDiag) {
                if (isWalkable(bot, x + dx, y, z) && isWalkable(bot, x, y, nz)) {
                    neighbors.push({ x: nx, y, z: nz, cost: 1.41 })
                }
            } else {
                neighbors.push({ x: nx, y, z: nz, cost: 1 })
            }
            continue
        }

        // --- Jump up 1 block ---
        if (!isDiag && isWalkable(bot, x, y + 2, z) && isSafe(bot, nx, y + 1, nz)) {
            neighbors.push({ x: nx, y: y + 1, z: nz, cost: 2 })
        }

        // --- Fall down 1-3 blocks ---
        if (!isDiag) {
            for (let drop = 1; drop <= 3; drop++) {
                if (isSafe(bot, nx, y - drop, nz)) {
                    // Check the column is clear above landing
                    let clear = true
                    for (let h = 0; h < drop; h++) {
                        if (!isWalkable(bot, nx, y - h, nz)) { clear = false; break }
                    }
                    if (clear) {
                        neighbors.push({ x: nx, y: y - drop, z: nz, cost: 1 + drop * 0.5 })
                    }
                    break // Only fall to the first solid landing
                }
            }
        }
    }

    // --- Climb up (ladder/vine) ---
    const blockHere = bot.blockAt(new Vec3(x, y, z))
    if (blockHere && (blockHere.name === 'ladder' || blockHere.name === 'vine')) {
        if (isWalkable(bot, x, y + 2, z)) {
            neighbors.push({ x, y: y + 1, z, cost: 1.5 })
        }
    }

    // --- Swim up ---
    const blockAbove = bot.blockAt(new Vec3(x, y + 1, z))
    if (blockHere && blockHere.name === 'water') {
        if (isWalkable(bot, x, y + 2, z)) {
            neighbors.push({ x, y: y + 1, z, cost: 2 })
        }
    }

    return neighbors
}

/**
 * A* search.
 * @param {object} bot
 * @param {Vec3} start
 * @param {object} goal - Must have isEnd(node) and heuristic(node) methods
 * @param {number} [maxNodes=2000] - Safety limit
 * @returns {Vec3[]|null} - Array of positions, or null if no path
 */
function astar(bot, start, goal, maxNodes = 2000) {
    const startKey = `${Math.floor(start.x)},${Math.floor(start.y)},${Math.floor(start.z)}`
    const startNode = { x: Math.floor(start.x), y: Math.floor(start.y), z: Math.floor(start.z) }

    const openSet = [{ node: startNode, f: 0, g: 0 }]
    const gScore = new Map()
    const cameFrom = new Map()
    gScore.set(startKey, 0)

    let iterations = 0

    while (openSet.length > 0 && iterations++ < maxNodes) {
        // Get node with lowest f score
        openSet.sort((a, b) => a.f - b.f)
        const current = openSet.shift()
        const { node } = current
        const nodeKey = `${node.x},${node.y},${node.z}`

        if (goal.isEnd(node)) {
            // Reconstruct path
            const path = []
            let key = nodeKey
            while (key) {
                const [px, py, pz] = key.split(',').map(Number)
                path.unshift(new Vec3(px + 0.5, py, pz + 0.5))
                key = cameFrom.get(key)
            }
            return path
        }

        const neighbors = getNeighbors(bot, node)

        for (const neighbor of neighbors) {
            const nKey = `${neighbor.x},${neighbor.y},${neighbor.z}`
            const tentativeG = (gScore.get(nodeKey) || 0) + neighbor.cost

            if (!gScore.has(nKey) || tentativeG < gScore.get(nKey)) {
                gScore.set(nKey, tentativeG)
                cameFrom.set(nKey, nodeKey)
                const f = tentativeG + goal.heuristic(neighbor)
                openSet.push({ node: neighbor, f, g: tentativeG })
            }
        }
    }

    return null // No path found
}

// ============================================================
//  Plugin
// ============================================================

function pathfinderPlugin(bot) {
    bot.pathfinder = {
        _active: false,
        _stopRequested: false,
        _currentGoal: null,

        /**
         * Navigate to a goal.
         * @param {object} goal - Goal instance (GoalBlock, GoalNear, GoalXZ, GoalFollow)
         * @param {object} [options]
         * @param {number} [options.maxNodes=2000]
         * @param {number} [options.tickDelay=2] - Physics ticks between movements
         * @returns {Promise<void>}
         */
        goto(goal, options = {}) {
            return new Promise((resolve, reject) => {
                if (bot.pathfinder._active) {
                    return reject(new Error('Pathfinder already active'))
                }
                if (!bot.entity) {
                    return reject(new Error('Bot entity not initialized'))
                }

                bot.pathfinder._active = true
                bot.pathfinder._stopRequested = false
                bot.pathfinder._currentGoal = goal

                const maxNodes = options.maxNodes || 2000
                const tickDelay = options.tickDelay || 2

                const path = astar(bot, bot.entity.position, goal, maxNodes)

                if (!path || path.length === 0) {
                    bot.pathfinder._active = false
                    bot.pathfinder._currentGoal = null
                    return reject(new Error('No path found'))
                }

                bot.emit('path_update', path)

                // Walk the path
                let pathIndex = 1 // Skip start position

                function moveToNext() {
                    if (bot.pathfinder._stopRequested || pathIndex >= path.length) {
                        bot.clearControlStates()
                        bot.pathfinder._active = false
                        bot.pathfinder._currentGoal = null

                        if (bot.pathfinder._stopRequested) {
                            bot.emit('path_stop')
                            return reject(new Error('Path cancelled'))
                        }

                        bot.emit('goal_reached', goal)
                        return resolve()
                    }

                    const target = path[pathIndex]
                    const current = bot.entity.position

                    const dx = target.x - current.x
                    const dz = target.z - current.z
                    const dy = target.y - current.y
                    const horizDist = Math.sqrt(dx * dx + dz * dz)

                    // Look at target
                    if (bot.lookAt) {
                        bot.lookAt(target)
                    }

                    // Determine movement
                    if (horizDist > 0.3) {
                        bot.setControlState('forward', true)
                        if (horizDist > 4) {
                            bot.setControlState('sprint', true)
                        }
                    } else {
                        bot.setControlState('forward', false)
                        bot.setControlState('sprint', false)
                    }

                    // Jump if target is above
                    if (dy > 0.5) {
                        bot.setControlState('jump', true)
                    } else {
                        bot.setControlState('jump', false)
                    }

                    // Check if we reached this waypoint
                    if (horizDist < 0.5 && Math.abs(dy) < 1.5) {
                        pathIndex++
                    }

                    // Schedule next tick
                    let tickCount = 0
                    const onTick = () => {
                        tickCount++
                        if (tickCount >= tickDelay) {
                            bot.removeListener('physicsTick', onTick)
                            moveToNext()
                        }
                    }
                    bot.on('physicsTick', onTick)
                }

                moveToNext()
            })
        },

        /**
         * Stop the current path.
         */
        stop() {
            bot.pathfinder._stopRequested = true
            bot.clearControlStates()
        },

        /**
         * Check if pathfinder is currently active.
         * @returns {boolean}
         */
        isActive() {
            return bot.pathfinder._active
        },

        /**
         * Get the current goal.
         * @returns {object|null}
         */
        getGoal() {
            return bot.pathfinder._currentGoal
        }
    }
}

// Export plugin and goal classes
pathfinderPlugin.GoalBlock = GoalBlock
pathfinderPlugin.GoalNear = GoalNear
pathfinderPlugin.GoalXZ = GoalXZ
pathfinderPlugin.GoalFollow = GoalFollow
pathfinderPlugin.GoalInvert = GoalInvert
pathfinderPlugin.goals = { GoalBlock, GoalNear, GoalXZ, GoalFollow, GoalInvert }

module.exports = pathfinderPlugin
