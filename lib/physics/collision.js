/**
 * Collision detection for bedrockflayer physics.
 *
 * Resolves entity movement against the world's block grid.
 * Uses axis-by-axis sweep (Y first, then X, then Z) to resolve collisions.
 */

const AABB = require('./aabb')
const { STEP_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT, SNEAK_HEIGHT } = require('./constants')

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
                if (block && block.solid) {
                    bbs.push(AABB.fromBlock(x, y, z))
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
 * @returns {{ position: {x,y,z}, velocity: {x,y,z}, onGround: boolean }}
 */
function moveEntity(bot, entity, velocity) {
    let dx = velocity.x
    let dy = velocity.y
    let dz = velocity.z

    const width = entity.width || PLAYER_WIDTH
    const height = entity.height || PLAYER_HEIGHT

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

    // Drop back down
    let dropDy = -STEP_HEIGHT
    for (const bb of blockBBs) {
        dropDy = stepBB.computeOffsetY(bb, dropDy)
    }
    stepBB.minY += dropDy
    stepBB.maxY += dropDy

    // Check if stepping up gave us more horizontal movement
    const stepDistSq = stepDx * stepDx + stepDz * stepDz
    const origDistSq = 0 // We already know we collided horizontally

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

    // Check a tiny bit below the entity's feet
    const testBB = bb.offset(0, -0.01, 0)
    const expandedBB = testBB.expand(0.5, 0.5, 0.5)
    const blockBBs = getSurroundingBBs(bot, expandedBB)

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
    const block = bot.blockAt ? bot.blockAt(entity.position, false) : null
    return block ? block.isClimbable : false
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
