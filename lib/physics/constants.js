/**
 * Physics constants for Minecraft Bedrock Edition.
 *
 * These values are reverse-engineered from Bedrock behavior and
 * community documentation. They control gravity, movement speed,
 * drag, and player dimensions.
 *
 * All units are blocks/tick or blocks/tick² unless noted.
 * Bedrock runs at 20 TPS (1 tick = 50ms).
 */

module.exports = {
    // --- Gravity & Vertical ---
    GRAVITY: 0.08,                // blocks/tick² downward acceleration
    DRAG: 0.98,                   // vertical velocity multiplier per tick (air)
    TERMINAL_VELOCITY: -3.92,     // max downward velocity

// --- Ground Movement ---
    PLAYER_SPEED: 0.085,          // base walking acceleration per tick (~4.3 blocks/sec actual Bedrock)
    SPRINT_MULTIPLIER: 1.3,       // sprint speed multiplier (~5.6 blocks/sec actual Bedrock)
    SNEAK_MULTIPLIER: 0.3,        // sneak speed = base * 0.3
    GROUND_FRICTION: 0.6,        // horizontal velocity decay on ground (block-dependent default)
    AIR_FRICTION: 0.91,           // horizontal velocity decay in air
    SLIPPERINESS_DEFAULT: 0.6,   // default block slipperiness (reserved for block-dependent friction)

    // --- Jumping ---
    JUMP_VELOCITY: 0.42,          // initial upward velocity on jump
    SPRINT_JUMP_BOOST: 0.2,       // extra horizontal boost when sprint-jumping (multiplied by direction)
    JUMP_COOLDOWN_TICKS: 10,      // minimum ticks between auto-jumps when holding jump key

    // --- Player Dimensions ---
    PLAYER_WIDTH: 0.6,            // AABB width (X and Z)
    PLAYER_HEIGHT: 1.8,           // AABB height (standing)
    PLAYER_EYE_HEIGHT: 1.62,      // eye offset from feet
    SNEAK_HEIGHT: 1.5,            // AABB height (sneaking)
    SNEAK_EYE_HEIGHT: 1.27,       // eye offset when sneaking

    // --- Water / Lava ---
    WATER_GRAVITY: 0.02,          // reduced gravity in water
    WATER_DRAG: 0.8,              // velocity multiplier in water
    WATER_SPEED: 0.02,            // swimming speed
    LAVA_DRAG: 0.5,               // velocity multiplier in lava
    LAVA_SPEED: 0.02,             // movement speed in lava

    // --- Ladder / Climbing ---
    LADDER_MAX_SPEED: 0.15,       // max downward speed on ladder
    LADDER_CLIMB_SPEED: 0.2,      // upward speed while climbing

    // --- Elytra ---
    ELYTRA_GRAVITY: 0.08,
    ELYTRA_DRAG: 0.99,
    FIREWORK_BOOST: 1.5,          // firework rocket speed boost

    // --- Tick Rate ---
    TICK_MS: 50,                  // milliseconds per tick
    TPS: 20,                      // ticks per second

    // --- Step Height ---
    STEP_HEIGHT: 0.5625,          // max height the player can auto-step up (slightly above half slab)

    // --- Knockback ---
    KNOCKBACK_HORIZONTAL: 0.4,
    KNOCKBACK_VERTICAL: 0.36
}
