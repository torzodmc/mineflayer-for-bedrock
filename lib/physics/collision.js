/**
 * Collision detection for bedrockflayer physics.
 *
 * Resolves entity movement against the world's block grid.
 * Uses axis-by-axis sweep (Y first, then X, then Z) to resolve collisions.
 */

const AABB = require('./aabb')
const { STEP_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT, SNEAK_HEIGHT } = require('./constants')

const PARTIAL_BLOCKS = {
    fences: ['fence', 'fence_gate', 'nether_brick_fence', 'iron_bars'],
    walls: ['wall', 'cobblestone_wall'],
    slabs: ['slab'],
    panes: ['glass_pane', 'glass', 'ice', 'cobweb'],
    stairs: ['stairs', 'stair'],
    buttons: ['button'],
    pressure_plates: ['pressure_plate', 'weighted_pressure_plate'],
    doors: ['door']
}

function _getPartialBlockBB(block, x, y, z) {
    const name = block.name || ''
    const lowerName = name.toLowerCase()

    for (const [type, patterns] of Object.entries(PARTIAL_BLOCKS)) {
        for (const pattern of patterns) {
            const exactMatch = lowerName === pattern
            const suffixMatch = lowerName.endsWith('_' + pattern) && lowerName.split('_').slice(0, -1).every(p => p.length > 0)
            const prefixMatch = lowerName.startsWith(pattern + '_') && lowerName.slice(pattern.length + 1).split('_').every(p => p.length > 0)
            if (exactMatch || suffixMatch || prefixMatch) {
                if (type === 'slabs') {
                    return _createPartialAABB(type, x, y, z, block.properties)
                }
                return _createPartialAABB(type, x, y, z)
            }
        }
    }
    return null
}

function _createPartialAABB(type, x, y, z, properties) {
    switch (type) {
        case 'fences':
            return new AABB(x, y, z, x + 1, y + 1.5, z + 1)
        case 'walls':
            return new AABB(x + 0.25, y, z + 0.25, x + 0.75, y + 1.5, z + 0.75)
        case 'slabs':
            const isTopSlab = properties && properties.top === 'true'
            const isBottomSlab = properties && properties.top === 'false'
            if (isTopSlab) {
                return new AABB(x, y + 0.5, z, x + 1, y + 1, z + 1)
            }
            if (isBottomSlab) {
                return new AABB(x, y, z, x + 1, y + 0.5, z + 1)
            }
            return null
        case 'panes':
            return new AABB(x + 0.375, y, z + 0.375, x + 0.625, y + 1, z + 0.625)
        case 'stairs':
            return _createStairAABB(x, y, z, properties)
        case 'buttons':
            return _createButtonAABB(x, y, z, properties)
        case 'pressure_plates':
            return _createPressurePlateAABB(x, y, z, properties)
        case 'doors':
            return _createDoorAABB(x, y, z, properties)
        default:
            return null
    }
}

function _createStairAABB(x, y, z, properties) {
    const isUpsideDown = properties && properties.upside_down === 'true'
    if (isUpsideDown) {
        // Upside-down stairs: bottom step at top, full block at bottom
        return new AABB(x, y + 0.5, z, x + 1, y + 1, z + 1)
    }
    // Normal stairs: full block at bottom, step at top
    return new AABB(x, y, z, x + 1, y + 0.5, z + 1)
}

function _createButtonAABB(x, y, z, properties) {
    const face = properties ? properties.face : null
    let minY = y + 0.375
    let maxY = y + 0.625
    if (face === 'ceiling') {
        minY = y + 0.75
        maxY = y + 1
    } else if (face === 'floor') {
        minY = y
        maxY = y + 0.25
    }
    return new AABB(x + 0.25, minY, z + 0.25, x + 0.75, maxY, z + 0.75)
}

function _createPressurePlateAABB(x, y, z, properties) {
    return new AABB(x + 0.125, y, z + 0.125, x + 0.875, y + 0.0625, z + 0.875)
}

function _createDoorAABB(x, y, z, properties) {
    const isOpen = properties && properties.open === 'true'
    const hinge = properties ? properties.hinge : null
    if (isOpen) {
        return new AABB(x, y, z, x + 1, y + 2, z + 1)
    }
    const half = properties ? properties.half : null
    if (half === 'upper') {
        return new AABB(x + 0.125, y + 1, z + 0.125, x + 0.875, y + 2, z + 0.875)
    }
    return new AABB(x + 0.125, y, z + 0.125, x + 0.875, y + 2, z + 0.875)
}

/**
 * Collect all solid block AABBs that overlap a region.
 * @param {object} bot - BedrockBot instance (needs bot.blockAt)
 * @param {AABB} region - The search region
 * @returns {AABB[]}
 */
function getSurroundingBBs(bot, region) {
    const bbs = []
    const minX = Math.floor(region.minX)
    const maxX = Math.floor(region.maxX)
    const minY = Math.floor(region.minY)
    const maxY = Math.floor(region.maxY)
    const minZ = Math.floor(region.minZ)
    const maxZ = Math.floor(region.maxZ)

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const block = bot.blockAt ? bot.blockAt({ x, y, z }, false) : null
                if (block) {
                    if (block.solid) {
                        const partialBB = _getPartialBlockBB(block, x, y, z)
                        if (partialBB) {
                            bbs.push(partialBB)
                        } else {
                            bbs.push(AABB.fromBlock(x, y, z))
                        }
                    }
                }
            }
        }
    }
    return bbs
}

/**
 * Move an entity through the world, resolving collisions.
 *
 * @param {object} bot - BedrockBot instance
 * @param {object} entity - Entity with position, velocity, height, width
 * @param {object} velocity - { x, y, z } proposed velocity
 * @param {number} [width] - Optional width override
 * @param {number} [height] - Optional height override
 * @returns {{ position: {x,y,z}, velocity: {x,y,z}, onGround: boolean }}
 */
function moveEntity(bot, entity, velocity, width, height) {
    let dx = velocity.x
    let dy = velocity.y
    let dz = velocity.z

    width = width ?? entity.width ?? PLAYER_WIDTH
    height = height ?? entity.height ?? PLAYER_HEIGHT

    // Build entity AABB at current position
    const entityBB = AABB.fromPlayer(entity.position, width, height)

    // Expand the search region to cover the movement
    const searchBB = entityBB.clone()
    if (dx > 0) searchBB.maxX += dx; else searchBB.minX += dx
    if (dy > 0) searchBB.maxY += dy; else searchBB.minY += dy
    if (dz > 0) searchBB.maxZ += dz; else searchBB.minZ += dz
    searchBB.minX -= 1
    searchBB.minY -= 1
    searchBB.minZ -= 1
    searchBB.maxX += 1
    searchBB.maxY += 1
    searchBB.maxZ += 1

    // Get all solid blocks in the region
    const blockBBs = getSurroundingBBs(bot, searchBB)

    // Resolve Y first (gravity/jump)
    const origDy = dy
    for (const bb of blockBBs) {
        dy = entityBB.computeOffsetY(bb, dy)
    }
    entityBB.minY += dy
    entityBB.maxY += dy

    // Resolve X
    const origDx = dx
    for (const bb of blockBBs) {
        dx = entityBB.computeOffsetX(bb, dx)
    }
    entityBB.minX += dx
    entityBB.maxX += dx

    // Resolve Z
    const origDz = dz
    for (const bb of blockBBs) {
        dz = entityBB.computeOffsetZ(bb, dz)
    }
    entityBB.minZ += dz
    entityBB.maxZ += dz

    // --- Step-up logic ---
    // If we collided horizontally, try stepping up
    const collidedHorizontally = (dx !== origDx || dz !== origDz)
    const onGroundBefore = entity.onGround || origDy !== dy

    if (collidedHorizontally && onGroundBefore) {
        const stepResult = _tryStepUp(bot, entity, velocity, blockBBs, width, height)
        if (stepResult) {
            return stepResult
        }
    }

    // Determine if on ground (dy was reduced to 0 while falling)
    const onGround = (origDy !== dy && origDy < 0)

    // Calculate new position (center of AABB bottom)
    const hw = width / 2
    const newPos = {
        x: (entityBB.minX + entityBB.maxX) / 2,
        y: entityBB.minY,
        z: (entityBB.minZ + entityBB.maxZ) / 2
    }

    // Zero out velocity on collided axes
    const resolvedVelocity = {
        x: (dx !== origDx) ? 0 : velocity.x,
        y: (dy !== origDy) ? 0 : velocity.y,
        z: (dz !== origDz) ? 0 : velocity.z
    }

    return {
        position: newPos,
        velocity: resolvedVelocity,
        onGround
    }
}

/**
 * Try stepping up a small ledge.
 * @private
 */
function _tryStepUp(bot, entity, velocity, blockBBs, width, height) {
    // Save original position
    const origBB = AABB.fromPlayer(entity.position, width, height)
    let dx = velocity.x
    let dz = velocity.z

    // Move up by STEP_HEIGHT
    const stepBB = origBB.clone()
    let stepDy = STEP_HEIGHT
    for (const bb of blockBBs) {
        stepDy = stepBB.computeOffsetY(bb, stepDy)
    }
    stepBB.minY += stepDy
    stepBB.maxY += stepDy

    // Check head clearance - verify no block at head height
    const headCheckBB = new AABB(stepBB.minX, stepBB.maxY, stepBB.minZ, stepBB.maxX, stepBB.maxY + 0.5, stepBB.maxZ)
    for (const bb of blockBBs) {
        if (headCheckBB.intersects(bb)) {
            return null // Cannot step up - not enough headroom
        }
    }

    // Try X movement at the stepped-up position
    let stepDx = dx
    for (const bb of blockBBs) {
        stepDx = stepBB.computeOffsetX(bb, stepDx)
    }
    stepBB.minX += stepDx
    stepBB.maxX += stepDx

    // Try Z movement
    let stepDz = dz
    for (const bb of blockBBs) {
        stepDz = stepBB.computeOffsetZ(bb, stepDz)
    }
    stepBB.minZ += stepDz
    stepBB.maxZ += stepDz

    // Calculate original distance before collision resolution
    const origDistSq = dx * dx + dz * dz

    // Drop back down
    let dropDy = -STEP_HEIGHT
    for (const bb of blockBBs) {
        dropDy = stepBB.computeOffsetY(bb, dropDy)
    }
    stepBB.minY += dropDy
    stepBB.maxY += dropDy

    // Check if stepping up gave us more horizontal movement
    const stepDistSq = stepDx * stepDx + stepDz * stepDz

    if (stepDistSq > origDistSq + 0.0001) {
        const newPos = {
            x: (stepBB.minX + stepBB.maxX) / 2,
            y: stepBB.minY,
            z: (stepBB.minZ + stepBB.maxZ) / 2
        }

        return {
            position: newPos,
            velocity: { x: stepDx !== dx ? 0 : velocity.x, y: 0, z: stepDz !== dz ? 0 : velocity.z },
            onGround: true
        }
    }

    return null // Step-up didn't help
}

/**
 * Check if an entity is on the ground.
 * @param {object} bot
 * @param {object} entity
 * @returns {boolean}
 */
function isOnGround(bot, entity) {
    const width = entity.width || PLAYER_WIDTH
    const height = entity.height || PLAYER_HEIGHT
    const bb = AABB.fromPlayer(entity.position, width, height)

    const testBB = new AABB(
        bb.minX, bb.minY - 0.5, bb.minZ,
        bb.maxX, bb.minY, bb.maxZ
    )

    const blockBBs = getSurroundingBBs(bot, testBB)

    for (const blockBB of blockBBs) {
        if (testBB.intersects(blockBB)) {
            return true
        }
    }
    return false
}

/**
 * Check if an entity's AABB overlaps water blocks.
 * @param {object} bot
 * @param {object} entity
 * @returns {boolean}
 */
function isInWater(bot, entity) {
    return _isInLiquid(bot, entity, 'water')
}

/**
 * Check if an entity's AABB overlaps lava blocks.
 * @param {object} bot
 * @param {object} entity
 * @returns {boolean}
 */
function isInLava(bot, entity) {
    return _isInLiquid(bot, entity, 'lava')
}

/**
 * Check if entity is on a climbable block (ladder/vine).
 * @param {object} bot
 * @param {object} entity
 * @returns {boolean}
 */
function isOnClimbable(bot, entity) {
    const width = entity.width || PLAYER_WIDTH
    const height = entity.height || PLAYER_HEIGHT
    const bb = AABB.fromPlayer(entity.position, width, height)

    const minX = Math.floor(bb.minX)
    const maxX = Math.floor(bb.maxX)
    const minY = Math.floor(bb.minY)
    const maxY = Math.floor(bb.maxY)
    const minZ = Math.floor(bb.minZ)
    const maxZ = Math.floor(bb.maxZ)

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const block = bot.blockAt ? bot.blockAt({ x, y, z }, false) : null
                if (block && block.isClimbable) {
                    return true
                }
            }
        }
    }
    return false
}

/**
 * @private
 */
function _isInLiquid(bot, entity, liquidType) {
    const width = entity.width || PLAYER_WIDTH
    const height = entity.height || PLAYER_HEIGHT
    const bb = AABB.fromPlayer(entity.position, width, height)

    const minX = Math.floor(bb.minX)
    const maxX = Math.floor(bb.maxX)
    const minY = Math.floor(bb.minY)
    const maxY = Math.floor(bb.maxY)
    const minZ = Math.floor(bb.minZ)
    const maxZ = Math.floor(bb.maxZ)

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const block = bot.blockAt ? bot.blockAt({ x, y, z }, false) : null
                if (block) {
                    if (liquidType === 'water' && (block.name === 'water' || block.name === 'flowing_water')) return true
                    if (liquidType === 'lava' && (block.name === 'lava' || block.name === 'flowing_lava')) return true
                }
            }
        }
    }
    return false
}

module.exports = {
    getSurroundingBBs,
    moveEntity,
    isOnGround,
    isInWater,
    isInLava,
    isOnClimbable
}
