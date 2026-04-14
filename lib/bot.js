/**
 * BedrockBot — The core bot class for bedrockflayer.
 * Extends EventEmitter to provide a Mineflayer-like event-driven API
 * on top of bedrock-protocol.
 *
 * Event lifecycle (from bedrock-protocol):
 *   'join'  → client authenticated, ready for game packets
 *   'spawn' → client spawned into game world
 *
 * We map these to:
 *   bot 'connect' → client 'join'
 *   bot 'login'   → client 'start_game' packet
 *   bot 'spawn'   → client 'spawn' event
 */

const EventEmitter = require('events')
const bedrock = require('bedrock-protocol')
const { Vec3 } = require('./utils/vec3')
const Entity = require('./classes/Entity')
const Registry = require('./classes/Registry')

class BedrockBot extends EventEmitter {
    /**
     * @param {object} options
     * @param {string} options.host - Server hostname (default: 'localhost')
     * @param {number} options.port - Server port (default: 19132)
     * @param {string} options.username - Bot username (default: 'BedrockBot')
     * @param {boolean} options.offline - Disable Xbox Live auth (default: false)
     * @param {string} options.version - Protocol version (optional, auto-detect)
     * @param {boolean} options.logErrors - Log errors to console (default: true)
     * @param {boolean} options.hideErrors - Suppress error logs (default: false)
     * @param {boolean} options.physicsEnabled - Enable physics tick loop (default: true)
     * @param {boolean} options.loadInternalPlugins - Load built-in plugins (default: true)
     */
    constructor(options = {}) {
        super()
        this.setMaxListeners(50)

        // --- Options ---
        this._options = {
            host: options.host || 'localhost',
            port: options.port || 19132,
            username: options.username || 'BedrockBot',
            offline: options.offline !== undefined ? options.offline : false,
            version: options.version || undefined,
            logErrors: options.logErrors !== undefined ? options.logErrors : true,
            hideErrors: options.hideErrors !== undefined ? options.hideErrors : false,
            physicsEnabled: options.physicsEnabled !== undefined ? options.physicsEnabled : true,
            loadInternalPlugins: options.loadInternalPlugins !== undefined ? options.loadInternalPlugins : true,
            skipPing: options.skipPing !== undefined ? options.skipPing : false,
            conLog: options.conLog !== undefined ? options.conLog : undefined
        }

        // --- State ---
        this.username = this._options.username
        this.position = null
        this.entity = null
        this.physicsEnabled = this._options.physicsEnabled
        this.tick = 0

        // Game state
        this.game = {
            gameMode: 0,
            dimension: 'overworld',
            difficulty: 0,
            hardcore: false,
            maxPlayers: 0,
            serverBrand: '',
            minY: -64,
            height: 384,
            levelType: '',
            worldName: ''
        }

        // Player state (populated by health plugin)
        this.health = 20
        this.food = 20
        this.foodSaturation = 5
        this.oxygenLevel = 20
        this.experience = { level: 0, points: 0, progress: 0 }
        this.spawnPoint = null

        // Collections
        this.players = {}
        this.player = null
        this.entities = {}
        this.tablist = { header: '', footer: '' }

        // Registry (initialized with version from start_game)
        this.registry = null
        this._registry = null

        // Settings
        this.settings = {
            viewDistance: 10,
            chat: 'enabled',
            skinParts: {
                showCape: true,
                showJacket: true,
                showLeftSleeve: true,
                showRightSleeve: true,
                showLeftPants: true,
                showRightPants: true,
                showHat: true
            }
        }

        // --- Plugin system ---
        this._loadedPlugins = new Set()
        this._pluginOptions = options.plugins || {}

        // --- Create bedrock-protocol client ---
        this.client = null
        this._connect()
    }

    /**
     * Establish connection via bedrock-protocol.
     *
     * bedrock-protocol emits ALL protocol packets as named events on the client,
     * e.g. client.on('text', handler), client.on('add_entity', handler).
     *
     * Special events emitted by bedrock-protocol:
     *   'join'  — client authenticated and ready for game packets
     *   'spawn' — client spawned into game world (after play_status:player_spawn)
     *   'kick'  — server kicked the client
     *   'close' — connection closed
     *   'error' — recoverable error
     *   'packet'— raw packet (contains {data: {name, params}})
     *
     * Plugins should use: bot.client.on('packet_name', (params) => { ... })
     * @private
     */
    _connect() {
        const clientOptions = {
            host: this._options.host,
            port: this._options.port,
            username: this._options.username,
            offline: this._options.offline,
            skipPing: this._options.skipPing
        }
        if (this._options.version) {
            clientOptions.version = this._options.version
        }
        if (this._options.conLog !== undefined) {
            clientOptions.conLog = this._options.conLog
        }

        try {
            this.client = bedrock.createClient(clientOptions)
        } catch (err) {
            this._handleError(err)
            return
        }

        // --- Lifecycle: join → start_game → spawn ---

        // 'join' — client authenticated, game packets can flow
        this.client.on('join', () => {
            this.emit('connect')
        })

        // 'start_game' — server sends initial game state
        // bedrock-protocol stores this in client.startGameData, but also emits it
        this.client.on('start_game', (packet) => {
            this._onStartGame(packet)
        })

        // 'spawn' — bedrock-protocol special event after play_status:player_spawn
        // bedrock-protocol also sends set_local_player_as_initialized automatically
        this.client.on('spawn', () => {
            this.emit('spawn')
        })

        // 'disconnect' — server kicked us
        this.client.on('disconnect', (packet) => {
            const reason = packet.message || packet.reason || 'Unknown reason'
            this.emit('kicked', reason, true)
        })

        // 'respawn' — server tells us to respawn
        // Fields: position {x,y,z}, state, runtime_entity_id
        this.client.on('respawn', (packet) => {
            if (packet.position) {
                this.position = new Vec3(
                    packet.position.x,
                    packet.position.y,
                    packet.position.z
                )
            }
            this.emit('respawn')
        })

        // Connection close
        this.client.on('close', () => {
            this.emit('end', 'socketClosed')
        })

        this.client.on('error', (err) => {
            this._handleError(err)
        })
    }

    /**
     * Handle the start_game packet — parse initial game state.
     *
     * Actual packet fields from BDS v1.26.14.1:
     *   entity_id, runtime_entity_id, player_gamemode, player_position {x,y,z},
     *   rotation {x,z}, dimension ("overworld"/"the_nether"/"the_end"),
     *   spawn_position {x,y,z}, difficulty, world_name, engine, ...
     * @private
     */
    _onStartGame(packet) {
        // Position
        const pos = packet.player_position || { x: 0, y: 64, z: 0 }
        this.position = new Vec3(pos.x, pos.y, pos.z)

        // Entity — use proper Entity class
        // CRITICAL: runtime_entity_id is BigInt from bedrock-protocol, convert to Number
        const runtimeId = Number(packet.runtime_entity_id)
        this.entity = new Entity(runtimeId, 'player')
        this.entity.username = this.username
        this.entity.name = this.username
        this.entity.displayName = this.username
        this.entity.position = this.position.clone()
        this.entity.velocity = new Vec3(0, 0, 0)
        // rotation is {x, z} where x=pitch, z=yaw
        this.entity.yaw = packet.rotation ? packet.rotation.z || 0 : 0
        this.entity.pitch = packet.rotation ? packet.rotation.x || 0 : 0
        this.entity.onGround = true
        this.entity.health = 20
        this.entities[this.entity.id] = this.entity

        // Game state — field names from actual BDS packet
        this.game.gameMode = this._parseGameMode(packet.player_gamemode)
        this.game.dimension = packet.dimension || 'overworld'  // already a string
        this.game.difficulty = packet.difficulty || 0
        this.game.serverBrand = packet.engine || ''
        this.game.worldName = packet.world_name || ''
        this.game.levelType = packet.level_id || ''
        this.game.hardcore = packet.hardcore || false

        // Spawn point — field is spawn_position, NOT world_spawn
        if (packet.spawn_position) {
            this.spawnPoint = new Vec3(
                packet.spawn_position.x,
                packet.spawn_position.y,
                packet.spawn_position.z
            )
        }

        // Store runtime entity ID for self-reference (as Number)
        this._runtimeEntityId = runtimeId
        this._uniqueEntityId = packet.entity_id

        // Initialize registry from engine version (e.g. '1.26.14')
        try {
            this.registry = new Registry(packet.engine || this._options.version)
            this._registry = this.registry
        } catch (e) {
            // Fallback — registry will attempt to use latest bedrock version
            this.registry = new Registry()
            this._registry = this.registry
        }

        // Load block palette (runtime ID → block name mapping)
        if (packet.block_palette && this.registry) {
            this.registry.loadBlockPalette(packet.block_palette)
        }

        // Load item states (network_id → item name mapping)
        if (packet.itemstates && this.registry) {
            this.registry.loadItemStates(packet.itemstates)
        }

        this.emit('login')
    }

    /**
     * Parse gamemode from packet (can be string or number).
     * @private
     */
    _parseGameMode(gm) {
        if (typeof gm === 'number') return gm
        switch (gm) {
            case 'survival': return 0
            case 'creative': return 1
            case 'adventure': return 2
            case 'spectator': return 6
            case 'fallback': return 0
            default: return 0
        }
    }

    /**
     * Handle an error based on options.
     * @private
     */
    _handleError(err) {
        this.emit('error', err)
        if (this._options.logErrors && !this._options.hideErrors) {
            console.error('[BedrockBot Error]', err.message || err)
        }
    }

    // ============================================================
    //  Plugin System
    // ============================================================

    /**
     * Load a plugin function. The plugin is called with (bot, options).
     * Does nothing if the plugin is already loaded.
     * @param {Function} plugin
     */
    loadPlugin(plugin) {
        if (this._loadedPlugins.has(plugin)) return
        this._loadedPlugins.add(plugin)
        plugin(this, this._pluginOptions)
    }

    /**
     * Load an array of plugin functions.
     * @param {Function[]} plugins
     */
    loadPlugins(plugins) {
        for (const plugin of plugins) {
            this.loadPlugin(plugin)
        }
    }

    /**
     * Check if a plugin is loaded.
     * @param {Function} plugin
     * @returns {boolean}
     */
    hasPlugin(plugin) {
        return this._loadedPlugins.has(plugin)
    }

    // ============================================================
    //  Core Methods
    // ============================================================

    /**
     * Gracefully disconnect from the server.
     * @param {string} [reason='disconnect.quitting']
     */
    quit(reason = 'disconnect.quitting') {
        if (this.client) {
            try {
                this.client.disconnect(reason)
            } catch (_) { }
        }
        this.emit('end', reason)
    }

    /**
     * End the connection immediately.
     * @param {string} [reason='disconnect']
     */
    end(reason = 'disconnect') {
        if (this.client) {
            try {
                this.client.close(reason)
            } catch (_) { }
        }
        this.emit('end', reason)
    }

    /**
     * Wait for a certain number of in-game ticks.
     * @param {number} ticks
     * @returns {Promise<void>}
     */
    waitForTicks(ticks) {
        return new Promise((resolve) => {
            let remaining = ticks
            const onTick = () => {
                remaining--
                if (remaining <= 0) {
                    this.removeListener('physicsTick', onTick)
                    resolve()
                }
            }
            this.on('physicsTick', onTick)
        })
    }
}

module.exports = { BedrockBot }
