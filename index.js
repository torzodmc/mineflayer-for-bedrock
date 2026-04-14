/**
 * bedrockflayer — A Mineflayer-like bot framework for Minecraft Bedrock Edition.
 *
 * @example
 * const bedrockflayer = require('bedrockflayer');
 *
 * const bot = bedrockflayer.createBot({
 *   host: 'localhost',
 *   port: 19132,
 *   username: 'MyBot',
 *   offline: true
 * });
 *
 * bot.on('spawn', () => {
 *   console.log('Bot spawned!');
 *   bot.chat('Hello world!');
 * });
 */

const { BedrockBot } = require('./lib/bot')

// Internal plugins — loaded by default
const chatPlugin = require('./lib/plugins/chat')
const healthPlugin = require('./lib/plugins/health')
const entitiesPlugin = require('./lib/plugins/entities')
const worldPlugin = require('./lib/plugins/world')
const physicsPlugin = require('./lib/physics/engine')
const controlsPlugin = require('./lib/plugins/controls')
const inventoryPlugin = require('./lib/plugins/inventory')
const windowsPlugin = require('./lib/plugins/windows')
const diggingPlugin = require('./lib/plugins/digging')
const placingPlugin = require('./lib/plugins/placing')
const combatPlugin = require('./lib/plugins/combat')
const craftingPlugin = require('./lib/plugins/crafting')
const vehiclesPlugin = require('./lib/plugins/vehicles')
const sleepPlugin = require('./lib/plugins/sleep')
const timePlugin = require('./lib/plugins/time')
const scoreboardPlugin = require('./lib/plugins/scoreboard')
const soundPlugin = require('./lib/plugins/sound')
const creativePlugin = require('./lib/plugins/creative')
const resourcePackPlugin = require('./lib/plugins/resource_pack')
const pathfinderPlugin = require('./lib/plugins/pathfinder')
const recipesPlugin = require('./lib/plugins/recipes')
const Registry = require('./lib/classes/Registry')

const internalPlugins = [
    chatPlugin,
    healthPlugin,
    entitiesPlugin,
    worldPlugin,
    physicsPlugin,
    controlsPlugin,
    inventoryPlugin,
    windowsPlugin,
    diggingPlugin,
    placingPlugin,
    combatPlugin,
    craftingPlugin,
    vehiclesPlugin,
    sleepPlugin,
    timePlugin,
    scoreboardPlugin,
    soundPlugin,
    creativePlugin,
    resourcePackPlugin,
    pathfinderPlugin,
    recipesPlugin
]

/**
 * Create a new Bedrock bot and connect to a server.
 *
 * @param {object} options
 * @param {string} [options.host='localhost'] - Server hostname
 * @param {number} [options.port=19132] - Server port
 * @param {string} [options.username='BedrockBot'] - Bot username
 * @param {boolean} [options.offline=false] - Skip Xbox Live authentication
 * @param {string} [options.version] - Protocol version (auto-detect if omitted)
 * @param {boolean} [options.logErrors=true] - Log errors to console
 * @param {boolean} [options.hideErrors=false] - Suppress error output
 * @param {boolean} [options.physicsEnabled=true] - Enable physics simulation
 * @param {boolean} [options.loadInternalPlugins=true] - Load built-in plugins
 * @returns {BedrockBot}
 */
function createBot(options = {}) {
    const bot = new BedrockBot(options)

    // Load internal plugins unless explicitly disabled
    if (options.loadInternalPlugins !== false) {
        bot.loadPlugins(internalPlugins)
    }

    return bot
}

const version = require('./package.json').version

module.exports = {
    createBot,
    BedrockBot,
    Registry,
    goals: pathfinderPlugin.goals,
    GoalBlock: pathfinderPlugin.GoalBlock,
    GoalNear: pathfinderPlugin.GoalNear,
    GoalXZ: pathfinderPlugin.GoalXZ,
    GoalFollow: pathfinderPlugin.GoalFollow,
    GoalInvert: pathfinderPlugin.GoalInvert,
    version
}
