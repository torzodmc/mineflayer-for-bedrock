/**
 * BotInspector — Wraps a bedrockflayer bot and intercepts every
 * state change, event, and action into a structured event log.
 *
 * Produces a machine-readable trace that an AI can analyze to
 * verify bot behavior without manual observation.
 */

const EventEmitter = require('events')

const STATE_EVENTS = new Set([
    'spawn', 'login', 'connect', 'end', 'kicked', 'error',
    'death', 'respawn', 'spawnReset',
    'health', 'breath', 'experience', 'game',
    'playerJoined', 'playerLeft',
    'blockUpdate', 'chunkColumnLoad',
    'recipesLoaded',
    'physicsTick',
])

const ACTION_EVENTS = new Set([
    'chat', 'whisper', 'message', 'messagestr',
    'actionBar', 'title', 'title_times', 'title_clear',
    'entitySpawn', 'entityGone', 'entityMoved',
    'entityHurt', 'entityDead', 'entitySwingArm',
    'entityEquipment', 'entityEquip',
    'entityEffect', 'entityEffectEnd',
    'entityTamed', 'entityTameFailed',
    'entityEatGrass', 'entityEating',
    'entityShakeWet', 'entityCriticalEffect',
    'entityWake',
    'path_update', 'goal_reached',
    'updateSlot', 'inventoryUpdated', 'heldItemChanged',
    'windowOpen', 'windowClose',
])

const POSITION_LOG_INTERVAL = 5

class BotInspector {
    constructor(bot, options = {}) {
        this.bot = bot
        this.events = []
        this.errors = []
        this.warnings = []
        this.startTime = Date.now()
        this.tickCounter = 0
        this.lastPositionLog = 0
        this._prevHealth = null
        this._prevFood = null
        this._prevPosition = null
        this._prevOnGround = null
        this._prevQuickBar = null
        this._prevHeldItemType = null
        this._listeners = []

        this._options = {
            logPositionEveryTick: false,
            logAllPackets: false,
            logStateDeltas: true,
            logInventoryChanges: true,
            logEntityEvents: true,
            logPathfinding: true,
            verbose: false,
            ...options,
        }

        this._attachHooks()
    }

    _attachHooks() {
        const { bot } = this

        const addListener = (emitter, event, handler) => {
            emitter.on(event, handler)
            this._listeners.push({ emitter, event, handler })
        }

        for (const event of STATE_EVENTS) {
            addListener(bot, event, (...args) => this._onStateEvent(event, args))
        }

        for (const event of ACTION_EVENTS) {
            addListener(bot, event, (...args) => this._onActionEvent(event, args))
        }

        if (this._options.logInventoryChanges) {
            this._hookInventory()
        }

        if (this._options.logPathfinding) {
            this._hookPathfinding()
        }

        this._hookBotMethods()

        if (this._options.logAllPackets && bot.client) {
            addListener(bot.client, 'packet', (pkt) => {
                this._log('packet', { name: pkt.data?.name, dir: 'receive' })
            })
        }

        addListener(bot, 'unhandledRejection', (err) => {
            this._logError('unhandledRejection', err)
        })
    }

    _hookInventory() {
        const { bot } = this
        this._prevInventorySlots = null

        const checkInventory = () => {
            if (!bot.inventory) return
            const slots = bot.inventory.slots || []
            if (!this._prevInventorySlots) {
                this._prevInventorySlots = new Array(slots.length).fill(null)
            }
            for (let i = 0; i < slots.length; i++) {
                const prev = this._prevInventorySlots[i]
                const curr = slots[i]
                if (prev === null && curr === null) continue
                const prevType = prev?.type ?? 0
                const currType = curr?.type ?? 0
                const prevCount = prev?.count ?? 0
                const currCount = curr?.count ?? 0
                if (prevType !== currType || prevCount !== currCount) {
                    this._log('inventory_change', {
                        slot: i,
                        from: prev ? { type: prevType, count: prevCount, name: prev.name || 'unknown' } : null,
                        to: curr ? { type: currType, count: currCount, name: curr.name || 'unknown' } : null,
                    })
                }
            }
            this._prevInventorySlots = slots.map(s => s ? { type: s.type, count: s.count, name: s.name } : null)
        }

        const events = ['inventoryUpdated']
        for (const ev of events) {
            this._listeners.push({
                emitter: bot,
                event: ev,
                handler: checkInventory,
            })
            bot.on(ev, checkInventory)
        }

        if (bot.quickBarSlot !== undefined) {
            this._prevQuickBar = bot.quickBarSlot
        }
    }

    _hookPathfinding() {
        const { bot } = this
        if (!bot.pathfinder) return

        const origGoto = bot.pathfinder.goto
        const origStop = bot.pathfinder.stop
        const self = this

        bot.pathfinder.goto = async function (goal) {
            self._log('pathfinder_start', {
                goal: goal?.constructor?.name || 'unknown',
                position: goal?.x !== undefined
                    ? { x: goal.x, y: goal.y, z: goal.z }
                    : (goal?.point ? { x: goal.point.x, y: goal.point.y, z: goal.point.z } : null),
            })
            const start = Date.now()
            try {
                const result = await origGoto.call(this, goal)
                self._log('pathfinder_complete', {
                    success: true,
                    duration: Date.now() - start,
                })
                return result
            } catch (err) {
                self._log('pathfinder_complete', {
                    success: false,
                    error: err.message,
                    duration: Date.now() - start,
                })
                throw err
            }
        }

        bot.pathfinder.stop = function () {
            self._log('pathfinder_stop', {})
            return origStop.call(this)
        }
    }

    _hookBotMethods() {
        const { bot } = this

        const wrap = (obj, method, logType, extractor) => {
            if (!obj || !obj[method]) return
            const original = obj[method].bind(obj)
            const self = this
            obj[method] = function (...args) {
                const data = extractor ? extractor(args) : { args }
                self._log(logType, data)
                return original(...args)
            }
        }

        wrap(bot, 'chat', 'action_chat', args => ({ message: args[0] }))
        wrap(bot, 'whisper', 'action_whisper', args => ({ target: args[0], message: args[1] }))
        wrap(bot, 'dig', 'action_dig_start', args => {
            const block = args[0]
            return { blockName: block?.name || 'unknown', position: block?.position ? { x: block.position.x, y: block.position.y, z: block.position.z } : null }
        })
        wrap(bot, 'attack', 'action_attack', args => {
            const entity = args[0]
            return { entityId: entity?.id, entityType: entity?.type, entityName: entity?.name || entity?.username || 'unknown' }
        })
        wrap(bot, 'equip', 'action_equip', args => {
            const item = args[0]
            return { itemType: item?.type, itemName: item?.name || 'unknown', destination: args[1] }
        })
        wrap(bot, 'placeBlock', 'action_place', args => {
            const ref = args[0]
            return { refBlock: ref?.name || 'unknown', face: args[1] || 'unknown' }
        })
        if (bot.consume) {
            wrap(bot, 'consume', 'action_consume', () => ({}))
        }
        if (bot.activateItem) {
            wrap(bot, 'activateItem', 'action_activate_item', () => ({}))
        }
        if (bot.setControlState) {
            const origCS = bot.setControlState.bind(bot)
            const self = this
            bot.setControlState = function (control, state) {
                self._log('control_state', { control, state: !!state })
                return origCS(control, state)
            }
        }
    }

    _onStateEvent(event, args) {
        const data = this._extractStateData(event, args)
        this._log(event, data)

        if (event === 'physicsTick') {
            this._onTick(args)
        }
    }

    _onActionEvent(event, args) {
        const data = this._extractActionData(event, args)
        this._log(event, data)
    }

    _onTick() {
        this.tickCounter++
        const { bot, _options } = this

        if (!bot.entity || !bot.position) return

        const interval = _options.logPositionEveryTick ? 1 : POSITION_LOG_INTERVAL

        if (this.tickCounter - this.lastPositionLog >= interval) {
            const pos = bot.position
            const ent = bot.entity
            const onGround = ent.onGround ?? false

            if (this._prevPosition) {
                const dx = pos.x - this._prevPosition.x
                const dy = pos.y - this._prevPosition.y
                const dz = pos.z - this._prevPosition.z
                const moved = Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001 || Math.abs(dz) > 0.001

                if (moved || onGround !== this._prevOnGround) {
                    this._log('position', {
                        x: +pos.x.toFixed(2),
                        y: +pos.y.toFixed(2),
                        z: +pos.z.toFixed(2),
                        yaw: ent.yaw != null ? +ent.yaw.toFixed(2) : null,
                        pitch: ent.pitch != null ? +ent.pitch.toFixed(2) : null,
                        onGround: !!onGround,
                        dx: +dx.toFixed(3),
                        dy: +dy.toFixed(3),
                        dz: +dz.toFixed(3),
                    })
                }
            }

            this._prevPosition = pos.clone ? pos.clone() : { x: pos.x, y: pos.y, z: pos.z }
            this._prevOnGround = onGround
            this.lastPositionLog = this.tickCounter
        }

        if (_options.logStateDeltas) {
            this._checkStateDeltas()
        }
    }

    _checkStateDeltas() {
        const { bot } = this

        if (bot.health !== this._prevHealth) {
            this._log('health_change', { from: this._prevHealth, to: bot.health })
            this._prevHealth = bot.health
        }

        if (bot.food !== this._prevFood) {
            this._log('food_change', { from: this._prevFood, to: bot.food })
            this._prevFood = bot.food
        }

        if (bot.quickBarSlot !== this._prevQuickBar) {
            this._log('quickbar_change', { from: this._prevQuickBar, to: bot.quickBarSlot })
            this._prevQuickBar = bot.quickBarSlot
        }

        const heldType = bot.heldItem?.type ?? null
        if (heldType !== this._prevHeldItemType) {
            this._log('heldItem_change', {
                from: this._prevHeldItemType,
                to: heldType,
                name: bot.heldItem?.name || 'none',
            })
            this._prevHeldItemType = heldType
        }
    }

    _extractStateData(event, args) {
        const { bot } = this

        switch (event) {
            case 'spawn':
                return { position: bot.position ? { x: +bot.position.x.toFixed(1), y: +bot.position.y.toFixed(1), z: +bot.position.z.toFixed(1) } : null, entityId: bot.entity?.id }
            case 'death':
                return { health: bot.health, position: bot.position ? { x: +bot.position.x.toFixed(1), y: +bot.position.y.toFixed(1), z: +bot.position.z.toFixed(1) } : null }
            case 'respawn':
                return { position: bot.position ? { x: +bot.position.x.toFixed(1), y: +bot.position.y.toFixed(1), z: +bot.position.z.toFixed(1) } : null }
            case 'kicked':
                return { reason: args[0] || 'unknown' }
            case 'error':
                return { message: args[0]?.message || String(args[0]) }
            case 'end':
                return { reason: args[0] || 'unknown' }
            case 'health':
                return { health: bot.health, food: bot.food, saturation: bot.foodSaturation }
            case 'experience':
                return { level: bot.experience?.level, points: bot.experience?.points, progress: bot.experience?.progress }
            case 'game':
                return { dimension: bot.game?.dimension, gameMode: bot.game?.gameMode, difficulty: bot.game?.difficulty }
            case 'blockUpdate':
                return {
                    oldBlock: args[0]?.name || 'unknown',
                    newBlock: args[1]?.name || 'unknown',
                    position: args[1]?.position ? { x: args[1].position.x, y: args[1].position.y, z: args[1].position.z } : null,
                }
            case 'chunkColumnLoad':
                return { x: args[0]?.x, z: args[0]?.z || args[0]?.z }
            case 'playerJoined':
                return { username: args[0]?.username || args[0], uuid: args[0]?.uuid }
            case 'playerLeft':
                return { username: args[0]?.username || args[0] }
            case 'recipesLoaded':
                return { count: args[0] || 0 }
            default:
                return { args: args.length === 1 ? this._summarize(args[0]) : args.length }
        }
    }

    _extractActionData(event, args) {
        const { bot } = this

        switch (event) {
            case 'chat':
                return { username: args[0], message: args[1] }
            case 'whisper':
                return { username: args[0], message: args[1] }
            case 'message':
                return { type: args[1], message: args[0]?.toString?.() || String(args[0]) }
            case 'messagestr':
                return { message: args[0], type: args[1] }
            case 'actionBar':
                return { text: typeof args[0] === 'string' ? args[0] : args[0]?.toString?.() || '(json)' }
            case 'title':
                return { text: args[0], type: args[1] }

            case 'entitySpawn': {
                const e = args[0]
                return {
                    id: e?.id, type: e?.type, name: e?.name || e?.username || 'unknown',
                    position: e?.position ? { x: +e.position.x.toFixed(1), y: +e.position.y.toFixed(1), z: +e.position.z.toFixed(1) } : null,
                }
            }
            case 'entityGone': {
                const e = args[0]
                return { id: e?.id, type: e?.type, name: e?.name || e?.username || 'unknown' }
            }
            case 'entityMoved': {
                const e = args[0]
                return { id: e?.id, position: e?.position ? { x: +e.position.x.toFixed(1), y: +e.position.y.toFixed(1), z: +e.position.z.toFixed(1) } : null }
            }
            case 'entityHurt': {
                const e = args[0]
                return { id: e?.id, type: e?.type, name: e?.name || 'unknown' }
            }
            case 'entityDead': {
                const e = args[0]
                return { id: e?.id, type: e?.type }
            }
            case 'entitySwingArm': {
                const e = args[0]
                return { id: e?.id, hand: args[1] }
            }
            case 'entityEquip':
            case 'entityEquipment': {
                const e = args[0]
                return { id: e?.id, slot: args[1], item: args[2]?.name || args[2]?.type || 'unknown' }
            }
            case 'entityEffect': {
                const e = args[0]
                const fx = args[1]
                return { id: e?.id, effectId: fx?.effect_id || fx?.id, amplifier: fx?.amplifier, duration: fx?.duration }
            }
            case 'entityEffectEnd': {
                const e = args[0]
                const fx = args[1]
                return { id: e?.id, effectId: fx?.effect_id || fx?.id }
            }
            case 'path_update':
                return { length: args[0]?.path?.length || args[0]?.length || 0, status: args[0]?.status || 'unknown' }
            case 'goal_reached':
                return { goal: args[0]?.constructor?.name || 'GoalBlock', position: bot.position ? { x: +bot.position.x.toFixed(1), y: +bot.position.y.toFixed(1), z: +bot.position.z.toFixed(1) } : null }
            case 'heldItemChanged':
                return { slot: bot.quickBarSlot, type: bot.heldItem?.type, name: bot.heldItem?.name || 'none' }
            case 'updateSlot':
                return { slot: args[1], type: args[2]?.type, name: args[2]?.name || 'none', count: args[2]?.count }
            case 'windowOpen':
                return { window: args[0]?.type, id: args[0]?.id }
            case 'windowClose':
                return { window: args[0]?.type || args[0], id: args[0]?.id }
            case 'entityTamed':
            case 'entityTameFailed':
            case 'entityEatGrass':
            case 'entityEating':
            case 'entityShakeWet':
            case 'entityWake':
            case 'entityCriticalEffect':
                return { id: args[0]?.id, type: args[0]?.type }
            default:
                return { args: args.length === 1 ? this._summarize(args[0]) : `[${args.length} args]` }
        }
    }

    _summarize(obj) {
        if (obj === null || obj === undefined) return null
        if (typeof obj === 'string') return obj.slice(0, 200)
        if (typeof obj === 'number' || typeof obj === 'boolean') return obj
        if (typeof obj === 'object') return '{...}' + (Object.keys(obj).length > 0 ? ` keys:${Object.keys(obj).slice(0, 5).join(',')}` : '')
        return String(obj).slice(0, 200)
    }

    _log(type, data) {
        const entry = {
            t: Date.now() - this.startTime,
            tick: this.tickCounter,
            type,
            data,
        }
        this.events.push(entry)

        if (this._options.verbose) {
            const t = entry.t
            console.log(`[${String(Math.floor(t / 1000)).padStart(3, '0')}.${String(t % 1000).padStart(3, '0')}s] ${type}`, data)
        }
    }

    _logError(type, err) {
        this.errors.push({
            t: Date.now() - this.startTime,
            type,
            message: String(err?.message || err),
            stack: err?.stack?.split('\n').slice(0, 3).join('\n'),
        })
    }

    warn(message) {
        this.warnings.push({ t: Date.now() - this.startTime, message })
    }

    findEvents(type) {
        return this.events.filter(e => e.type === type)
    }

    findFirstEvent(type) {
        return this.events.find(e => e.type === type) || null
    }

    findLastEvent(type) {
        return [...this.events].reverse().find(e => e.type === type) || null
    }

    eventCount(type) {
        return this.events.filter(e => e.type === type).length
    }

    totalDistanceMoved() {
        let dist = 0
        let prev = null
        for (const ev of this.events) {
            if (ev.type === 'position' && ev.data) {
                const p = ev.data
                const curr = { x: p.x, y: p.y, z: p.z }
                if (prev) {
                    dist += Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2 + (curr.z - prev.z) ** 2)
                }
                prev = curr
            }
        }
        return dist
    }

    toJSON() {
        return {
            session: {
                startTime: new Date(this.startTime).toISOString(),
                duration: Date.now() - this.startTime,
                totalTicks: this.tickCounter,
            },
            bot: this.bot ? {
                username: this.bot.username,
                finalPosition: this.bot.position ? {
                    x: +this.bot.position.x.toFixed(1),
                    y: +this.bot.position.y.toFixed(1),
                    z: +this.bot.position.z.toFixed(1),
                } : null,
                finalHealth: this.bot.health,
                finalFood: this.bot.food,
                entityCount: Object.keys(this.bot.entities || {}).length,
                playerCount: Object.keys(this.bot.players || {}).length,
            } : null,
            eventSummary: this._eventSummary(),
            totalEvents: this.events.length,
            totalDistanceMoved: +this.totalDistanceMoved().toFixed(1),
            events: this.events,
            errors: this.errors,
            warnings: this.warnings,
        }
    }

    _eventSummary() {
        const counts = {}
        for (const ev of this.events) {
            counts[ev.type] = (counts[ev.type] || 0) + 1
        }
        return counts
    }

    stop() {
        for (const { emitter, event, handler } of this._listeners) {
            emitter.removeListener(event, handler)
        }
        this._listeners.length = 0
    }
}

module.exports = { BotInspector }