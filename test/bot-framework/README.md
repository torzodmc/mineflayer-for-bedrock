# Bedrockflayer Behavioral Test Framework

> Automated integration testing for Minecraft Bedrock bots — capture every action, state change, and event into a structured, AI-readable trace.

---

## Quick Start

```bash
# Run a smoke test against local BDS
node test/bot-framework/run.js smoke

# Run all scenarios
node test/bot-framework/run.js all

# List available scenarios
node test/bot-framework/run.js list

# With custom server
node test/bot-framework/run.js full --host=192.168.1.100 --port=19133 --timeout=60000
```

**Prerequisites:** A Bedrock Dedicated Server running on the target host with `online-mode=false`.

---

## How It Works

```
                         ┌──────────────────────┐
                         │     Your Scenario     │
                         │  setup / steps /      │
                         │  teardown / verify    │
                         └──────────┬───────────┘
                                    │
┌──────────────────┐     ┌─────────▼───────────┐     ┌──────────────────┐
│  Bedrock Server  │ ←→  │     TestRunner      │     │   BotInspector   │
│   (your BDS)     │     │                     │     │                  │
│                  │     │  createBot()         │──▶  │  hooks ALL       │
│  localhost:19132 │     │  stepRunner()        │     │  events/methods  │
│                  │     │  expectationCheck()  │     │  state deltas    │
└──────────────────┘     └─────────┬───────────┘     │  error capture   │
                                   │                  └──────────────────┘
                    ┌──────────────┼──────────────┐
                    │              │              │
               ┌────▼─────┐  ┌────▼────┐  ┌──────▼──────┐
               │  Console  │  │  JSON   │  │ AI Summary  │
               │  (live)   │  │  Trace  │  │  Report     │
               └──────────┘  └─────────┘  └─────────────┘
```

The framework creates a bot, wraps it with `BotInspector` (which intercepts every event and state change), runs your scenario steps, then produces three outputs: a live color-coded console stream, a full JSON trace file, and an AI-readable summary report.

---

## Architecture

### Core Classes

| File | Class/Module | Purpose |
|------|-------------|---------|
| `BotInspector.js` | `BotInspector` | Wraps a bot, hooks all events, tracks state deltas, intercepts methods |
| `TestRunner.js` | `TestRunner` | Creates bot, runs scenario, verifies expectations, saves trace |
| `reporter.js` | `liveConsole`, `saveJSONTrace`, `generateAISummary` | Output formatting |
| `index.js` | All exports | Public API surface |
| `run.js` | CLI runner | Command-line interface |

### Scenario Format

A scenario is a JavaScript module exporting an object:

```js
module.exports = {
    name: 'my_test',                    // Unique name for reporting

    botConfig: {                        // Passed to createBot()
        host: 'localhost',
        port: 19132,
        username: 'MyTestBot',
        offline: true,
    },

    expected: {                         // Key-value expectations
        spawned: true,                  //   verified at end
        chunks_loaded: true,
        moved: { minDistance: 5 },
        no_deaths: true,
        dug_blocks: { min: 1 },
    },

    async setup(bot, inspector) {       // Runs once before steps
        await bot.waitForChunksToLoad()
    },

    steps: [                            // Runs sequentially
        async (bot, inspector) => { /* step 1 */ },
        async (bot, inspector) => { /* step 2 */ },
    ],

    async verify(inspector) {           // Custom verification
        return { passed: true, details: 'all good' }
    },

    async teardown(bot, inspector) {    // Cleanup (always runs)
        bot.quit('test done')
    },
}
```

---

## Available Expectations

These are built-in expectations checked automatically. Add them to your scenario's `expected` object:

| Key | Value | Checks |
|-----|-------|--------|
| `spawned` | `true` | Bot emitted `spawn` event |
| `chunks_loaded` | `true` | At least one chunk loaded |
| `moved` | `{ minDistance: N }` | Bot moved at least N meters |
| `dug_blocks` | `{ min: N }` | At least N `action_dig_start` events |
| `no_deaths` | `true` | Zero `death` events |
| `path_completed` | `true` | At least one successful pathfinding |
| `received_chat` | `true` | At least one `chat` event received |
| `inventory_updated` | `{ min: N }` | At least N `inventory_change` events |
| `entities_spawned` | `{ min: N }` | At least N `entitySpawn` events |
| `health_check` | `true` | Health tracking events occurred |
| `smooth_connection` | `true` | Spawned, no kick, no errors |

---

## What Gets Captured Automatically

The `BotInspector` hooks into every part of the bot. **No manual logging needed.**

| Category | Event Types |
|----------|------------|
| **Lifecycle** | `spawn`, `death`, `respawn`, `login`, `connect`, `end`, `kicked`, `error` |
| **Movement** | `position` (every 5 ticks), `onGround` changes |
| **Chat** | `chat`, `whisper`, `message`, `actionBar`, `title` |
| **Actions** | `action_chat`, `action_whisper`, `action_dig_start`, `action_attack`, `action_equip`, `action_place`, `control_state` |
| **Entities** | `entitySpawn`, `entityGone`, `entityMoved`, `entityHurt`, `entityDead`, `entitySwingArm`, `entityEquipment`, `entityEffect`, `entityEffectEnd`, `entityTamed`, `entityTameFailed` |
| **Inventory** | `inventory_change`, `heldItem_change`, `quickbar_change`, `updateSlot`, `inventoryUpdated`, `windowOpen`, `windowClose` |
| **World** | `blockUpdate`, `chunkColumnLoad` |
| **Pathfinding** | `pathfinder_start`, `pathfinder_complete`, `pathfinder_stop`, `path_update`, `goal_reached` |
| **Health** | `health_change`, `food_change`, `health`, `experience` |
| **State** | `game`, `recipesLoaded`, `spawnReset`, `playerJoined`, `playerLeft` |

### Position Tracking

Bot position is logged every 5 ticks (250ms at 20 TPS). Only logs when the bot moves or `onGround` changes, so the trace stays clean.

### State Deltas

Health, food, quickbar, and held item changes are logged every tick only when they actually change.

### Method Interception

These bot methods are automatically wrapped to log calls:

- `bot.chat(msg)`, `bot.whisper(user, msg)`
- `bot.dig(block)`, `bot.placeBlock(ref, face)`
- `bot.attack(entity)`, `bot.equip(item, slot)`
- `bot.consume()`, `bot.activateItem()`
- `bot.setControlState(control, state)`
- `bot.pathfinder.goto(goal)`, `bot.pathfinder.stop()`

---

## Inspecting Events Programmatically

When running programmatically, the `inspector` provides query methods:

```js
const { TestRunner } = require('./test/bot-framework')
const scenario = require('./test/bot-framework/scenarios/dig')

const runner = new TestRunner(scenario, { live: false })
const result = await runner.run()
const inspector = result.inspector

// Query events
inspector.findEvents('action_dig_start')     // all dig events
inspector.findFirstEvent('spawn')            // first spawn
inspector.findLastEvent('position')          // last position
inspector.eventCount('entitySpawn')          // count of entity spawns
inspector.totalDistanceMoved()               // total meters traveled

// Access raw trace
console.log(inspector.events)                // full event array
console.log(inspector.errors)                // error array

// JSON export
console.log(JSON.stringify(inspector.toJSON(), null, 2))
```

---

## Output Files

### JSON Trace

Saved to `test/bot-framework/traces/<scenario>_<timestamp>.json`:

```json
{
  "session": {
    "startTime": "2026-05-10T13:30:00.000Z",
    "duration": 12450,
    "totalTicks": 249
  },
  "bot": {
    "username": "SmokeTestBot",
    "finalPosition": { "x": 1.2, "y": 64.0, "z": -0.5 },
    "finalHealth": 20,
    "finalFood": 20,
    "entityCount": 5,
    "playerCount": 1
  },
  "eventSummary": {
    "spawn": 1,
    "chat": 3,
    "position": 45,
    "physicsTick": 240,
    "action_chat": 2,
    "inventory_change": 5
  },
  "totalEvents": 312,
  "totalDistanceMoved": 2.4,
  "events": [
    { "t": 0, "tick": 0, "type": "connect", "data": {} },
    { "t": 150, "tick": 3, "type": "spawn", "data": { "position": { "x": 0, "y": 64, "z": 0 }, "entityId": 1 } },
    { "t": 500, "tick": 10, "type": "position", "data": { "x": 0.5, "y": 64, "z": -0.2, "onGround": true, "dx": 0.5, "dy": 0, "dz": -0.2 } }
  ],
  "errors": [],
  "warnings": []
}
```

### AI Summary

Printed to console after each test (with `--print-summary` or `printSummary: true`):

```
======================================================================
  BEDROCKFLAYER TEST SESSION — AI SUMMARY
======================================================================

## Session Info
- Started:  2026-05-10T13:30:00.000Z
- Duration: 12.5s
- Total ticks: 249
- Events captured: 312
- Bot username: SmokeTestBot
- Final position: (1.2, 64.0, -0.5)
- Final health: 20/20 | Food: 20/20
- Entities tracked: 5 | Players: 1
- Total distance moved: 2.4m

## Event Counts
  physicsTick: 240
  position: 45
  health: 3
  chat: 3
  inventory_change: 5
  ...

## Spawn Check
  ✅ Bot spawned at (0.0, 64.0, 0.0) (T+3)

## Death Events
  ✅ No deaths

## Pathfinding
  ➖ No pathfinding used

## Digging
  ➖ No digging

## Combat
  ➖ No attacks

## Chat
  📤 "Smoke test — hello from test framework!"
  📤 "My health is 20/20"

## Messages Received
  💬 <Player1> Hello bot!

## Errors & Warnings
  ✅ No errors or warnings

## Scenario Expectations
  ✅ Bot spawned
  ✅ Chunks loaded
  ✅ Smooth connection (spawn=true, kicked=false, errors=0)
  ✅ Health tracking active (3 events)
```

This summary is designed to be read by an AI agent to quickly assess whether the bot behaved correctly.

---

## Creating Custom Scenarios

### Minimal Example

```js
module.exports = {
    name: 'hello_world',
    botConfig: { host: 'localhost', port: 19132, username: 'HelloBot', offline: true },
    expected: { spawned: true },
    async setup(bot, inspector) {
        await bot.waitForChunksToLoad()
        bot.chat('Hello, world!')
    },
    steps: [],
    async teardown(bot) { bot.end() },
}
```

### With Custom Verification

```js
module.exports = {
    name: 'verify_reached_target',
    botConfig: { host: 'localhost', port: 19132, username: 'NavBot', offline: true },
    expected: { spawned: true, path_completed: true },
    async setup(bot, inspector) {
        await bot.waitForChunksToLoad()
    },
    steps: [
        async (bot, inspector) => {
            const { GoalNear } = require('../../../index')
            const target = bot.entity.position.offset(10, 0, 0)
            await bot.pathfinder.goto(new GoalNear(target.x, target.y, target.z, 2))
        },
    ],
    async verify(inspector) {
        const goalReached = inspector.findFirstEvent('goal_reached')
        const completed = inspector.findEvents('pathfinder_complete')
            .filter(e => e.data.success)
        const dist = inspector.totalDistanceMoved()

        if (!goalReached) return { passed: false, details: 'Goal was never reached' }
        if (dist < 8) return { passed: false, details: `Only moved ${dist.toFixed(1)}m` }
        return { passed: true, details: `Reached goal in ${completed[0]?.data?.duration}ms` }
    },
    async teardown(bot) { bot.end() },
}
```

### Step Timing

Each step's duration is printed to console. Use `inspector.warn(msg)` to flag non-critical issues without failing the test:

```js
steps: [
    async (bot, inspector) => {
        const start = Date.now()
        await bot.dig(someBlock)
        const duration = Date.now() - start

        if (duration > 5000) {
            inspector.warn(`Dig took ${duration}ms — possible lag or wrong tool`)
        }
    },
]
```

---

## CLI Reference

```
Usage:
  node run.js <scenario> [options]    Run a specific scenario
  node run.js all                     Run all scenarios
  node run.js list                    List available scenarios
  node run.js --file=<path>           Run a custom scenario from file
  node run.js help                    Show this help

Options:
  --host=<ip>        Server host (default: localhost)
  --port=<num>       Server port (default: 19132)
  --timeout=<ms>     Max test duration in ms (default: 120000)
  --offline=true     Skip Xbox auth (default: true)
  --username=<name>  Bot username
  --verbose, -v      Verbose output
  --no-live          Disable live console
  --no-save          Don't save JSON trace
  --no-summary       Don't print AI summary

Examples:
  node run.js smoke
  node run.js dig --host=192.168.1.100
  node run.js all --verbose --timeout=60000
  node run.js --file=./my_scenario.js --host=10.0.0.5
```

---

## Best Practices

1. **Always use `bot.waitForChunksToLoad()` in setup** — Most features need loaded chunks
2. **Use `bot.waitForTicks(n)` between actions** — Gives the server time to process packets
3. **Save traces with timestamps** — Enables later analysis and comparison
4. **Feed AI summaries to other agents** — The `generateAISummary()` output is designed to be machine-readable verification
5. **Add `inspector.warn()` for non-critical issues** — Keeps the test passing but flags concerns
6. **Use `expected` for common checks, `verify()` for custom logic** — Keep scenarios clean

---

## Integration with CI/CD

```bash
# Exit code 0 = pass, 1 = fail
node test/bot-framework/run.js smoke && node test/bot-framework/run.js dig

# Or run all and check exit code
node test/bot-framework/run.js all --no-live --timeout=60000
if [ $? -eq 0 ]; then echo "All tests passed"; else echo "Tests failed"; exit 1; fi
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Ping timed out" | Server not running or wrong host/port |
| "Bot did not spawn" | Check `online-mode=false` in server.properties |
| Test times out | Increase `--timeout=` or add `await bot.waitForTicks(n)` |
| No chat events captured | Chat plugin might need `bot.client.on('text', ...)` — verify with live server |
| JSON trace is empty | Ensure `saveTrace: true` and check `traces/` directory exists |
| "Cannot find module" | Run from project root: `node test/bot-framework/run.js smoke` |