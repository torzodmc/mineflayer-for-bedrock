/**
 * Math utilities for bedrockflayer.
 */

/**
 * Clamp a value between min and max.
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

/**
 * Linear interpolation between a and b by factor t (0-1).
 */
function lerp(a, b, t) {
    return a + (b - a) * t
}

/**
 * Convert degrees to radians.
 */
function toRadians(degrees) {
    return degrees * (Math.PI / 180)
}

/**
 * Convert radians to degrees.
 */
function toDegrees(radians) {
    return radians * (180 / Math.PI)
}

/**
 * Calculate yaw angle from a source position to a target position.
 * Returns yaw in radians.
 * @param {object} from - {x, y, z} position
 * @param {object} to - {x, y, z} position
 * @returns {number} yaw in radians
 */
function yawTo(from, to) {
    if (!from || !to || typeof from.x !== 'number' || typeof to.x !== 'number' ||
        typeof from.y !== 'number' || typeof to.y !== 'number' ||
        typeof from.z !== 'number' || typeof to.z !== 'number') {
        return 0
    }
    const dx = to.x - from.x
    const dz = to.z - from.z
    return Math.atan2(-dx, dz)
}

/**
 * Calculate pitch angle from a source position to a target position.
 * Returns pitch in radians.
 * @param {object} from - {x, y, z} position
 * @param {object} to - {x, y, z} position
 * @returns {number} pitch in radians
 */
function pitchTo(from, to) {
    if (!from || !to || typeof from.x !== 'number' || typeof to.x !== 'number' ||
        typeof from.y !== 'number' || typeof to.y !== 'number' ||
        typeof from.z !== 'number' || typeof to.z !== 'number') {
        return 0
    }
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    const horizontalDist = Math.sqrt(dx * dx + dz * dz)
    return -Math.atan2(dy, horizontalDist)
}

/**
 * Normalize an angle in radians to the range [-PI, PI].
 * @param {number} angle
 * @returns {number} normalized angle
 */
function normalizeAngle(angle) {
    if (!Number.isFinite(angle)) return 0
    const twoPi = 2 * Math.PI
    const threePi = twoPi + Math.PI
    return ((angle % twoPi + threePi) % twoPi) - Math.PI
}

module.exports = {
    clamp,
    lerp,
    toRadians,
    toDegrees,
    yawTo,
    pitchTo,
    normalizeAngle
}
