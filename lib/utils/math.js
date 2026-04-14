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
 */
function yawTo(from, to) {
    const dx = to.x - from.x
    const dz = to.z - from.z
    return Math.atan2(-dx, dz)
}

/**
 * Calculate pitch angle from a source position to a target position.
 * Returns pitch in radians.
 */
function pitchTo(from, to) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    const horizontalDist = Math.sqrt(dx * dx + dz * dz)
    return -Math.atan2(dy, horizontalDist)
}

/**
 * Normalize an angle in radians to the range [-PI, PI].
 */
function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI
    while (angle < -Math.PI) angle += 2 * Math.PI
    return angle
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
