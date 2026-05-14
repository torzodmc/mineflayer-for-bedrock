/**
 * Reporter — Formats BotInspector output for human and AI consumption.
 *
 * Three output modes:
 *   1. liveConsole   — real-time color-coded event stream
 *   2. jsonTrace     — full machine-readable trace to file
 *   3. aiSummary     — high-level AI-digestible report
 *
 * Also provides assertion helpers for automated verification.
 */

const fs = require('fs')
const path = require('path')

const EMOJI = {
    spawn: '\x1b[32m🟢 SPAWN\x1b[0m',
    login: '\x1b[36m🔵 LOGIN\x1b[0m',
    connect: '\x1b[36m🔷 CONNECT\x1b[0m',
    end: '\x1b[31m🔴 END\x1b[0m',
    kicked: '\x1b[31m🚫 KICKED\x1b[0m',
    error: '\x1b[41m💥 ERROR\x1b[0m',
    death: '\x1b[35m💀 DEATH\x1b[0m',
    respawn: '\x1b[32m↩️  RESPAWN\x1b[0m',
    health: '\x1b[31m❤️\x1b[0m',
    health_change: '\x1b[31m❤️\x1b[0m',
    food_change: '\x1b[33m🍖\x1b[0m',
    experience: '\x1b[32m✨\x1b[0m',
    position: '\x1b[34m📍\x1b[0m',
    chat: '\x1b[37m💬\x1b[0m',
    whisper: '\x1b[35m🤫\x1b[0m',
    message: '\x1b[37m📨\x1b[0m',
    actionChat: '\x1b[36m📤 CHAT\x1b[0m',
    action_chat: '\x1b[36m📤 CHAT\x1b[0m',
    action_whisper: '\x1b[35m📤 WHISPER\x1b[0m',
    action_dig_start: '\x1b[33m⛏  DIG\x1b[0m',
    action_place: '\x1b[33m🧱 PLACE\x1b[0m',
    action_attack: '\x1b[31m⚔️  ATTACK\x1b[0m',
    action_equip: '\x1b[33m🎒 EQUIP\x1b[0m',
    action_consume: '\x1b[33m🍎 EAT\x1b[0m',
    entitySpawn: '\x1b[32m👾 SPAWN\x1b[0m',
    entityGone: '\x1b[90m👻 GONE\x1b[0m',
    entityMoved: '\x1b[34m👾 MOVE\x1b[0m',
    entityHurt: '\x1b[31m👾 HURT\x1b[0m',
    entityDead: '\x1b[35m👾 DEAD\x1b[0m',
    entitySwingArm: '\x1b[37m👾 SWING\x1b[0m',
    entityEquip: '\x1b[33m👾 EQUIP\x1b[0m',
    entityEquipment: '\x1b[33m👾 EQUIP\x1b[0m',
    entityEffect: '\x1b[35m👾 EFFECT\x1b[0m',
    entityEffectEnd: '\x1b[90m👾 EFFECT_END\x1b[0m',
    entityTamed: '\x1b[32m🐺 TAMED\x1b[0m',
    entityTameFailed: '\x1b[33m🐺 TAME_FAIL\x1b[0m',
    entityEatGrass: '\x1b[32m🐑 EAT\x1b[0m',
    blockUpdate: '\x1b[37m🧊 BLOCK\x1b[0m',
    chunkColumnLoad: '\x1b[90m🗺️  CHUNK\x1b[0m',
    pathfinder_start: '\x1b[36m🗺️  PATH START\x1b[0m',
    pathfinder_complete: '\x1b[32m🏁 PATH DONE\x1b[0m',
    pathfinder_stop: '\x1b[33m🛑 PATH STOP\x1b[0m',
    path_update: '\x1b[36m🛤️  PATH\x1b[0m',
    goal_reached: '\x1b[32m✅ GOAL\x1b[0m',
    inventory_change: '\x1b[33m📦 SLOT\x1b[0m',
    heldItem_change: '\x1b[33m🤚 HELD\x1b[0m',
    quickbar_change: '\x1b[37m🔢 QBAR\x1b[0m',
    control_state: '\x1b[37m🎮 CTRL\x1b[0m',
    recipesLoaded: '\x1b[36m📋 RECIPES\x1b[0m',
    windowOpen: '\x1b[33m📦 WIN_OPEN\x1b[0m',
    windowClose: '\x1b[37m📦 WIN_CLOSE\x1b[0m',
    inventoryUpdated: '',
    heldItemChanged: '\x1b[33m🤚 HELD\x1b[0m',
    updateSlot: '\x1b[33m📦 UPDATE\x1b[0m',
}

function formatTime(ms) {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

function formatPos(pos) {
    if (!pos) return '(none)'
    return `(${pos.x}, ${pos.y}, ${pos.z})`
}

function formatEventData(type, data) {
    if (!data) return ''
    switch (type) {
        case 'position':
            return `→ ${formatPos(data)} | onGround=${data.onGround}`
        case 'chat':
        case 'whisper':
            return `<${data.username}> ${data.message?.slice(0, 80)}`
        case 'action_chat':
            return `"${data.message?.slice(0, 80)}"`
        case 'action_whisper':
            return `→ ${data.target}: "${data.message?.slice(0, 60)}"`
        case 'action_dig_start':
            return `${data.blockName} at ${formatPos(data.position)}`
        case 'action_attack':
            return `${data.entityName} (${data.entityType})`
        case 'action_equip':
            return `${data.itemName} → slot ${data.destination}`
        case 'action_place':
            return `${data.refBlock} face=${data.face}`
        case 'entitySpawn':
            return `${data.type}:${data.name} id=${data.id} at ${formatPos(data.position)}`
        case 'entityGone':
            return `${data.type}:${data.name} id=${data.id}`
        case 'entityHurt':
        case 'entityDead':
            return `${data.type}:${data.name} id=${data.id}`
        case 'entityEquip':
        case 'entityEquipment':
            return `id=${data.id} slot=${data.slot} → ${data.item}`
        case 'entityEffect':
            return `id=${data.id} effect=${data.effectId} amp=${data.amplifier} dur=${data.duration}`
        case 'inventory_change':
            return `[${data.slot}] ${data.from?.name || 'empty'} → ${data.to?.name || 'empty'} x${data.to?.count || 0}`
        case 'control_state':
            return `${data.control}=${data.state}`
        case 'heldItem_change':
            return `${data.from || 'none'} → ${data.to || 'none'} (${data.name})`
        case 'health_change':
            return `${data.from} → ${data.to}`
        case 'food_change':
            return `${data.from} → ${data.to}`
        case 'blockUpdate':
            return `${data.oldBlock} → ${data.newBlock} at ${formatPos(data.position)}`
        case 'pathfinder_start':
            return `goal=${data.goal} → ${formatPos(data.position)}`
        case 'pathfinder_complete':
            return data.success ? `✓ after ${data.duration}ms` : `✗ ${data.error}`
        case 'goal_reached':
            return `${data.goal} at ${formatPos(data.position)}`
        case 'kicked':
            return `reason: ${data.reason}`
        case 'end':
            return `reason: ${data.reason}`
        case 'error':
            return data.message?.slice(0, 120)
        case 'death':
            return `health=${data.health} at ${formatPos(data.position)}`
        case 'respawn':
            return `at ${formatPos(data.position)}`
        case 'spawn':
            return `entityId=${data.entityId} at ${formatPos(data.position)}`
        case 'health':
            return `HP=${data.health}/20 Food=${data.food}/20`
        case 'experience':
            return `Lv=${data.level} Pts=${data.points}`
        case 'game':
            return `${data.dimension} mode=${data.gameMode}`
        case 'recipesLoaded':
            return `${data.count} recipes`
        default:
            return typeof data === 'string' ? data.slice(0, 80) : JSON.stringify(data).slice(0, 80)
    }
}

function liveConsole(inspector, options = {}) {
    const filterTypes = options.filterTypes || null
    const excludeTypes = options.excludeTypes || [
        'physicsTick', 'messagestr', 'message', 'title', 'title_times',
        'actionBar', 'title_clear', 'chunkColumnLoad',
        'entityMoved',
        'position',
    ]

    const start = Date.now()

    for (const ev of inspector.events) {
        if (filterTypes && !filterTypes.has(ev.type)) continue
        if (excludeTypes && excludeTypes.includes(ev.type)) continue

        const emoji = EMOJI[ev.type] || `\x1b[37m${ev.type}\x1b[0m`
        const time = formatTime(ev.t)
        const detail = formatEventData(ev.type, ev.data)
        const tick = ev.tick > 0 ? ` T+${ev.tick}` : ''

        console.log(`[${time}${tick}] ${emoji} ${detail}`)
    }
}

function logLiveEvent(inspector, onEvent = null) {
    const origLog = inspector._log.bind(inspector)

    inspector._log = function (type, data) {
        const exclude = ['physicsTick', 'position', 'chunkColumnLoad']
        origLog(type, data)

        if (!exclude.includes(type)) {
            const emoji = EMOJI[type] || `\x1b[37m${type}\x1b[0m`
            const time = formatTime(Date.now() - inspector.startTime)
            const detail = formatEventData(type, data)
            const tick = inspector.tickCounter > 0 ? ` T+${inspector.tickCounter}` : ''
            const line = `[${time}${tick}] ${emoji} ${detail}`
            console.log(line)
            if (onEvent) onEvent(line)
        }
    }
}

async function saveJSONTrace(inspector, filePath, options = {}) {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }

    const trace = inspector.toJSON()

    if (options.pretty) {
        fs.writeFileSync(filePath, JSON.stringify(trace, null, 2))
    } else {
        fs.writeFileSync(filePath, JSON.stringify(trace))
    }

    return filePath
}

function generateAISummary(inspector, scenarioConfig = {}) {
    const trace = inspector.toJSON()
    const { events } = trace

    const lines = []
    const add = (l) => lines.push(l)

    add('')
    add('='.repeat(70))
    add('  BEDROCKFLAYER TEST SESSION — AI SUMMARY')
    add('='.repeat(70))
    add('')

    add(`## Session Info`)
    add(`- Started:  ${trace.session.startTime}`)
    add(`- Duration: ${(trace.session.duration / 1000).toFixed(1)}s`)
    add(`- Total ticks: ${trace.session.totalTicks}`)
    add(`- Events captured: ${trace.totalEvents}`)
    add(`- Bot username: ${trace.bot.username}`)
    add(`- Final position: ${formatPos(trace.bot.finalPosition)}`)
    add(`- Final health: ${trace.bot.finalHealth}/20 | Food: ${trace.bot.finalFood}/20`)
    add(`- Entities tracked: ${trace.bot.entityCount} | Players: ${trace.bot.playerCount}`)
    add(`- Total distance moved: ${trace.totalDistanceMoved}m`)
    add('')

    add('## Event Counts')
    const summary = trace.eventSummary
    const sortedTypes = Object.keys(summary).sort((a, b) => summary[b] - summary[a])
    for (const type of sortedTypes) {
        add(`  ${type}: ${summary[type]}`)
    }
    add('')

    const spawnEv = inspector.findFirstEvent('spawn')
    add('## Spawn Check')
    if (spawnEv) {
        add(`  ✅ Bot spawned at ${formatPos(spawnEv.data.position)} (T+${spawnEv.tick})`)
    } else {
        add('  ❌ Bot NEVER spawned')
    }

    const deathEvents = inspector.findEvents('death')
    add('## Death Events')
    if (deathEvents.length === 0) {
        add('  ✅ No deaths')
    } else {
        for (const d of deathEvents) {
            add(`  💀 Died at T+${d.tick} | health=${d.data.health}`)
            const respawnEv = inspector.events.find(e => e.type === 'respawn' && e.t > d.t)
            if (respawnEv) {
                add(`     ↳ Respawned at T+${respawnEv.tick}`)
            } else {
                add(`     ❌ Did NOT respawn after death`)
            }
        }
    }

    const pathStarts = inspector.findEvents('pathfinder_start')
    const pathCompletes = inspector.findEvents('pathfinder_complete')
    add('## Pathfinding')
    if (pathStarts.length === 0) {
        add('  ➖ No pathfinding used')
    } else {
        add(`  Starts:    ${pathStarts.length}`)
        add(`  Completes: ${pathCompletes.length}`)
        const successes = pathCompletes.filter(e => e.data.success)
        const failures = pathCompletes.filter(e => !e.data.success)
        add(`  ✅ Success: ${successes.length} | ❌ Failed: ${failures.length}`)
        for (const pc of successes) {
            add(`  ✓ Completed in ${pc.data.duration}ms`)
        }
        for (const pc of failures) {
            add(`  ✗ Failed: ${pc.data.error}`)
        }
    }

    const digs = inspector.findEvents('action_dig_start')
    add('## Digging')
    if (digs.length === 0) {
        add('  ➖ No digging')
    } else {
        add(`  Blocks dug: ${digs.length}`)
        for (const d of digs) {
            const pickupsNearby = inspector.events.filter(e =>
                e.type === 'inventory_change' && e.t > d.t && e.t < d.t + 3000
            )
            add(`  ⛏ ${d.data.blockName} at ${formatPos(d.data.position)} → ${pickupsNearby.length} inventory changes within 3s`)
        }
    }

    const attacks = inspector.findEvents('action_attack')
    add('## Combat')
    if (attacks.length === 0) {
        add('  ➖ No attacks')
    } else {
        add(`  Attacks: ${attacks.length}`)
        for (const a of attacks) {
            add(`  ⚔️ ${a.data.entityName} (${a.data.entityType})`)
        }
    }

    const chats = inspector.findEvents('action_chat')
    add('## Chat')
    if (chats.length === 0) {
        add('  ➖ No messages sent')
    } else {
        for (const c of chats) {
            add(`  📤 "${c.data.message}"`)
        }
    }

    const msgsReceived = inspector.findEvents('chat')
    add('## Messages Received')
    if (msgsReceived.length === 0) {
        add('  ➖ No messages received')
    } else {
        for (const m of msgsReceived) {
            add(`  💬 <${m.data.username}> ${m.data.message}`)
        }
    }

    add('')
    add('## Errors & Warnings')
    if (trace.errors.length === 0 && trace.warnings.length === 0) {
        add('  ✅ No errors or warnings')
    }
    for (const err of trace.errors) {
        add(`  ❌ [T+${Math.floor(err.t / 1000)}s] ${err.type}: ${err.message}`)
    }
    for (const w of trace.warnings) {
        add(`  ⚠️  [T+${Math.floor(w.t / 1000)}s] ${w.message}`)
    }
    add('')

    add('## Scenario Expectations')
    if (scenarioConfig.expected) {
        for (const [key, expected] of Object.entries(scenarioConfig.expected)) {
            const result = checkExpectation(inspector, key, expected)
            add(`  ${result.passed ? '✅' : '❌'} ${result.text}`)
        }
    } else {
        add('  (no expectations defined — raw trace only)')
    }
    add('')

    add('='.repeat(70))
    add('  END OF SUMMARY')
    add('='.repeat(70))
    add('')

    return lines.join('\n')
}

function checkExpectation(inspector, key, expected) {
    switch (key) {
        case 'spawned':
            return {
                passed: !!inspector.findFirstEvent('spawn'),
                text: `Bot spawned`,
            }
        case 'moved': {
            const dist = inspector.totalDistanceMoved()
            return {
                passed: dist >= (expected.minDistance || 1),
                text: `Bot moved at least ${expected.minDistance || 1}m (actual: ${dist.toFixed(1)}m)`,
            }
        }
        case 'dug_blocks': {
            const count = inspector.eventCount('action_dig_start')
            return {
                passed: count >= (expected.min || 1),
                text: `Bot dug ${count} blocks (target: >=${expected.min || 1})`,
            }
        }
        case 'no_deaths':
            return {
                passed: inspector.eventCount('death') === 0,
                text: `No deaths occurred`,
            }
        case 'chunks_loaded':
            return {
                passed: inspector.eventCount('chunkColumnLoad') > 0,
                text: `Chunks loaded`,
            }
        case 'path_completed': {
            const completes = inspector.findEvents('pathfinder_complete').filter(e => e.data.success)
            return {
                passed: completes.length > 0,
                text: `Pathfinding completed ${completes.length} time(s)`,
            }
        }
        case 'received_chat': {
            const chats = inspector.findEvents('chat')
            return {
                passed: chats.length > 0,
                text: `Received ${chats.length} chat messages`,
            }
        }
        case 'inventory_updated': {
            const changes = inspector.eventCount('inventory_change')
            return {
                passed: changes >= (expected.min || 1),
                text: `Inventory changed ${changes} times (target: >=${expected.min || 1})`,
            }
        }
        case 'entities_spawned': {
            const count = inspector.eventCount('entitySpawn')
            return {
                passed: count >= (expected.min || 0),
                text: `${count} entities spawned (target: >=${expected.min || 0})`,
            }
        }
        case 'health_check': {
            const healthEvents = inspector.eventCount('health_change') + inspector.eventCount('health')
            return {
                passed: healthEvents > 0,
                text: `Health tracking active (${healthEvents} events)`,
            }
        }
        case 'smooth_connection': {
            const hasSpawn = !!inspector.findFirstEvent('spawn')
            const noKick = inspector.eventCount('kicked') === 0
            const noErrors = inspector.errors.length === 0
            return {
                passed: hasSpawn && noKick && noErrors,
                text: `Smooth connection (spawn=${hasSpawn}, kicked=${!noKick}, errors=${inspector.errors.length})`,
            }
        }
        default:
            return { passed: true, text: `${key}: unverified (unknown expectation)` }
    }
}

module.exports = {
    liveConsole,
    logLiveEvent,
    saveJSONTrace,
    generateAISummary,
    checkExpectation,
    formatTime,
    formatPos,
}