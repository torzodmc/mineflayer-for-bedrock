# bedrockflayer

> A **Mineflayer-like** bot framework for **Minecraft Bedrock Edition**, built on top of [`bedrock-protocol`](https://github.com/PrismarineJS/bedrock-protocol).

Create powerful, autonomous Minecraft Bedrock bots with a familiar, high-level API. If you've used [Mineflayer](https://github.com/PrismarineJS/mineflayer) for Java Edition, you'll feel right at home.

---

## Features

- 🎮 **21 built-in plugins** — chat, entities, inventory, combat, digging, placing, pathfinding, recipes, and more
- 🗺️ **Full world state** — chunk parsing with SubChunk palette deserialization, `blockAt()` lookups
- 🧭 **A\* Pathfinding** — built-in pathfinder with 5 goal types (GoalBlock, GoalNear, GoalXZ, GoalFollow, GoalInvert)
- 📦 **Block & Item Registry** — 1,100 blocks + 1,599 items via `minecraft-data`, with name/hardness/stackSize lookups
- 🛠️ **Recipe System** — auto-parsed from server `crafting_data` packets (2,500+ recipes)
- ⚙️ **Physics Engine** — gravity, AABB collision, PlayerAuthInput tick loop
- 🔌 **Plugin System** — load/unload custom plugins at runtime
- 🎯 **Mineflayer-compatible events** — `spawn`, `chat`, `health`, `death`, `blockUpdate`, `entitySpawn`, etc.

---

## Quick Start

### Install

```bash
npm install bedrockflayer
```

### Create a Bot

```javascript
const { createBot, GoalBlock } = require('bedrockflayer')

const bot = createBot({
  host: 'localhost',     // BDS server IP
  port: 19132,           // Bedrock port
  username: 'MyBot',     // Display name
  offline: true          // Skip Xbox Live auth
})

bot.on('spawn', () => {
  console.log('Bot spawned!')
  bot.chat('Hello from bedrockflayer!')
})

bot.on('chat', (username, message) => {
  console.log(`<${username}> ${message}`)

  if (message === '!health') {
    bot.chat(`HP: ${bot.health}/20 | Food: ${bot.food}/20`)
  }

  if (message === '!pos') {
    const p = bot.entity.position
    bot.chat(`Position: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`)
  }
})
```

### Pathfinding

```javascript
const { createBot, GoalBlock, GoalNear, GoalFollow } = require('bedrockflayer')

const bot = createBot({ host: 'localhost', offline: true })

bot.on('spawn', async () => {
  // Navigate to exact coordinates
  await bot.pathfinder.goto(new GoalBlock(100, 64, 200))

  // Get within 3 blocks of a position
  await bot.pathfinder.goto(new GoalNear(100, 64, 200, 3))

  // Follow a player
  const target = Object.values(bot.entities).find(e => e.type === 'player')
  if (target) {
    await bot.pathfinder.goto(new GoalFollow(target, 2))
  }
})
```

### World Queries

```javascript
bot.on('spawn', async () => {
  await bot.waitForChunksToLoad()

  // Get block at position
  const block = bot.blockAt(bot.entity.position.offset(0, -1, 0))
  console.log('Standing on:', block?.name, 'hardness:', block?.hardness)

  // Find blocks by name
  const diamonds = bot.findBlocks({
    matching: 'diamond_ore',
    maxDistance: 32,
    count: 10
  })
  console.log('Found diamond ore at:', diamonds)

  // Registry lookups
  console.log('Stone hardness:', bot.registry.blockByName('stone').hardness)
  console.log('Is solid:', bot.registry.isSolid('stone'))
})
```

### Recipes & Crafting

```javascript
bot.on('spawn', () => {
  // Find recipes for an item
  const recipes = bot.recipesFor('crafting_table')
  console.log(`Found ${recipes.length} crafting table recipes`)

  // Craft an item
  if (recipes.length > 0) {
    bot.craft(recipes[0], 1)
  }
})
```

---

## Architecture

```
┌─────────────────────────────────────┐
│       Your Bot Script               │  bot.chat(), bot.dig(), bot.pathfinder.goto()
├─────────────────────────────────────┤
│       index.js (createBot)          │  Factory + plugin loader
├─────────────────────────────────────┤
│       lib/bot.js (BedrockBot)       │  EventEmitter, connection, state
├─────────────────────────────────────┤
│       lib/plugins/*.js (21 plugins) │  Modular feature system
├─────────────────────────────────────┤
│       lib/classes/*.js              │  Entity, Block, Item, Window, Registry
├─────────────────────────────────────┤
│       lib/physics/*.js              │  AABB, collision, gravity engine
├─────────────────────────────────────┤
│       lib/world/*.js                │  SubChunk, ChunkColumn parsers
├─────────────────────────────────────┤
│       bedrock-protocol              │  RakNet + Xbox Live + packet I/O
└─────────────────────────────────────┘
```

---

## Plugins

| Plugin | Description |
|--------|-------------|
| `chat` | Send/receive chat, whispers, action bar, titles, regex patterns |
| `health` | HP, food, saturation, XP, death/respawn, player list |
| `entities` | Entity tracking (spawn, despawn, move, equipment, effects) |
| `world` | Chunk loading, `blockAt()`, `findBlocks()`, block updates |
| `inventory` | Inventory sync, hotbar selection, item equip/drop/toss |
| `windows` | Container interactions (chests, furnaces, crafting tables) |
| `controls` | Movement state (forward, back, sprint, jump, sneak) |
| `combat` | Attack entities, use items, PvP actions |
| `digging` | Break blocks with proper timing and tool selection |
| `placing` | Place blocks and activate block interactions |
| `crafting` | Crafting table / inventory grid crafting |
| `recipes` | Parse server recipes, `recipesFor()`, `craft()` |
| `pathfinder` | A\* navigation with GoalBlock/GoalNear/GoalXZ/GoalFollow |
| `vehicles` | Mount/dismount, vehicle controls |
| `sleep` | Bed interactions |
| `time` | Day/night cycle, weather tracking |
| `scoreboard` | Scoreboard display tracking |
| `sound` | Sound event handling |
| `creative` | Creative mode inventory actions |
| `resource_pack` | Resource pack response handling |

---

## API Reference

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `bot.username` | `string` | Bot's display name |
| `bot.position` | `Vec3` | Current position |
| `bot.entity` | `Entity` | Bot's own entity |
| `bot.entities` | `Object` | Map of entityId → Entity |
| `bot.health` | `number` | HP (0–20) |
| `bot.food` | `number` | Hunger (0–20) |
| `bot.experience` | `Object` | `{ level, points, progress }` |
| `bot.game` | `Object` | `{ gameMode, dimension, difficulty, worldName }` |
| `bot.players` | `Object` | Map of username → player |
| `bot.inventory` | `Window` | Player inventory window |
| `bot.registry` | `Registry` | Block/item database |
| `bot.pathfinder` | `Object` | Pathfinding controller |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `bot.chat(msg)` | `void` | Send chat message |
| `bot.whisper(user, msg)` | `void` | Send private message |
| `bot.blockAt(pos)` | `Block\|null` | Get block at world position |
| `bot.findBlocks(opts)` | `Vec3[]` | Find blocks matching criteria |
| `bot.pathfinder.goto(goal)` | `Promise` | Navigate to a goal |
| `bot.pathfinder.stop()` | `void` | Cancel navigation |
| `bot.recipesFor(item)` | `Array` | Find recipes producing an item |
| `bot.craft(recipe, count)` | `Promise` | Craft an item |
| `bot.dig(block)` | `Promise` | Break a block |
| `bot.placeBlock(refBlock, face)` | `Promise` | Place a block |
| `bot.attack(entity)` | `void` | Attack an entity |
| `bot.equip(item, slot)` | `Promise` | Equip an item |
| `bot.quit()` | `void` | Disconnect |

### Events

| Event | Args | When |
|-------|------|------|
| `spawn` | — | Bot fully spawned |
| `chat` | `(username, message)` | Player chat |
| `health` | — | HP/food changed |
| `death` | — | Bot died |
| `entitySpawn` | `(entity)` | Entity appeared |
| `entityGone` | `(entity)` | Entity despawned |
| `blockUpdate` | `(oldBlock, newBlock)` | Block changed |
| `chunkColumnLoad` | `(point)` | Chunk loaded |
| `path_update` | `(path)` | Path calculated |
| `goal_reached` | `(goal)` | Navigation complete |
| `recipesLoaded` | `(count)` | Server recipes parsed |

---

## Requirements

- **Node.js** ≥ 18
- **Bedrock Dedicated Server** (BDS) for testing — [download](https://www.minecraft.net/en-us/download/server/bedrock)
- Set `online-mode=false` in `server.properties` for offline/local testing

---

## Running Tests

```bash
# Unit tests (57 tests)
npx vitest run

# Live integration test (requires BDS on localhost:19132)
node test/live.js
```

---

## Bedrock vs Java Differences

| Aspect | Java (Mineflayer) | Bedrock (bedrockflayer) |
|--------|-------------------|------------------------|
| Transport | TCP | RakNet (UDP) |
| Auth | Microsoft | Xbox Live / offline |
| Movement | Client sends position | `PlayerAuthInput` every tick |
| Inventory | Click-based slots | `InventoryTransaction` packets |
| Chunks | Anvil format | SubChunk palette + LevelDB |
| Default port | 25565 | 19132 |

---

## License

MIT

---

## Credits

Built on top of the incredible [PrismarineJS](https://github.com/PrismarineJS) ecosystem:
- [`bedrock-protocol`](https://github.com/PrismarineJS/bedrock-protocol) — Bedrock protocol implementation
- [`minecraft-data`](https://github.com/PrismarineJS/minecraft-data) — Block/item registry data
- [`vec3`](https://github.com/PrismarineJS/node-vec3) — 3D vector math

Inspired by [Mineflayer](https://github.com/PrismarineJS/mineflayer) — the gold standard for Minecraft bot frameworks.
