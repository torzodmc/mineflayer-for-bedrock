# Plugin Development Guide

> How to write internal and external plugins for bedrockflayer.

## Plugin Structure

A plugin is simply a function that accepts `(bot, options)`:

```javascript
function myPlugin(bot, options) {
    // 1. Add properties to bot
    bot.myFeature = {
        someState: null
    };

    // 2. Listen to raw bedrock-protocol packets
    bot.client.on('some_packet', (packet) => {
        bot.myFeature.someState = packet.value;
        bot.emit('myFeatureUpdated', packet.value);
    });

    // 3. Add methods to bot
    bot.myFeature.doSomething = function(arg) {
        bot.client.queue('outgoing_packet', {
            runtime_entity_id: bot._runtimeEntityId,
            data: arg
        });
    };
}

module.exports = myPlugin;
```

## Loading Plugins

### Internal Plugins (built into the framework)

All 20 internal plugins are listed in `index.js` and loaded automatically:

```javascript
const internalPlugins = [
    chatPlugin, healthPlugin, entitiesPlugin, worldPlugin,
    physicsPlugin, controlsPlugin, inventoryPlugin, windowsPlugin,
    diggingPlugin, placingPlugin, combatPlugin, craftingPlugin,
    vehiclesPlugin, sleepPlugin, timePlugin, scoreboardPlugin,
    soundPlugin, creativePlugin, resourcePackPlugin, pathfinderPlugin
];
```

### Ecosystem Plugins (opt-in)

Three extra plugins are exported but not auto-loaded. Load them manually:

```javascript
const bedrockflayer = require('bedrockflayer');
const bot = bedrockflayer.createBot({ ... });

bot.loadPlugin(bedrockflayer.autoEat);
bot.loadPlugin(bedrockflayer.collectBlock);
bot.loadPlugin(bedrockflayer.guard);
```

### External / User Plugins

```javascript
const bot = bedrockflayer.createBot({ ... });
bot.loadPlugin(require('./myPlugin'));
// or
bot.loadPlugins([pluginA, pluginB]);
```

---

## Conventions

### 1. Namespace Your Properties

Always create a namespace object on bot to avoid collisions:

```javascript
// ✅ Good
bot.myPlugin = { someMethod: () => {} };

// ❌ Bad — could overwrite existing bot methods
bot.someMethod = () => {};
```

### 2. Use bot._runtimeEntityId for Self-Reference

When checking if a packet is about the bot's own entity:

```javascript
bot.client.on('some_entity_packet', (packet) => {
    if (packet.runtime_entity_id === bot._runtimeEntityId) {
        // This is about us
    }
});
```

### 3. Emit Events for State Changes

Always emit an event when updating bot state so other plugins and user code can react:

```javascript
bot.health = newValue;
bot.emit('health');  // ← Always do this
```

### 4. Use Vec3 for Positions

```javascript
const { Vec3 } = require('../utils/vec3');
const pos = new Vec3(packet.x, packet.y, packet.z);
```

### 5. Send Packets via bot.client.queue()

```javascript
bot.client.queue('text', {
    type: 'chat',
    message: 'Hello!'
});
```

---

## Testing Plugins

Create a mock bot using EventEmitter for unit testing:

```javascript
import { vi } from 'vitest';
import EventEmitter from 'events';
import myPlugin from '../../lib/plugins/myPlugin.js';

function createMockBot() {
    const bot = new EventEmitter();
    bot.client = new EventEmitter();
    bot.client.queue = vi.fn();
    bot._runtimeEntityId = 1n;
    bot.username = 'TestBot';
    myPlugin(bot);
    return bot;
}
```

Then simulate packets:

```javascript
it('should handle some_packet', () => {
    const bot = createMockBot();
    bot.client.emit('some_packet', { value: 42 });
    expect(bot.myFeature.someState).toBe(42);
});
```

---

## Reference: All Internal Plugins

| Plugin File | Key Properties / Methods | Key Events Emitted |
|-------------|--------------------------|-------------------|
| `chat.js` | `bot.chat()`, `bot.whisper()`, `bot.addChatPattern()`, `bot.awaitMessage()` | `chat`, `whisper`, `message`, `actionBar`, `title` |
| `health.js` | `bot.health`, `bot.food`, `bot.experience`, `bot.players`, `bot.respawn()` | `health`, `death`, `breath`, `experience`, `playerJoined`, `playerLeft` |
| `entities.js` | `bot.entities`, `bot.nearestEntity()` | `entitySpawn`, `entityMoved`, `entityGone`, `entityEquipped` |
| `world.js` | `bot.world`, `bot.blockAt()`, `bot.findBlocks()`, `bot.waitForChunksToLoad()` | `chunkColumnLoad`, `blockUpdate` |
| `controls.js` | `bot.setControlState()`, `bot.clearControlStates()`, `bot.look()`, `bot.lookAt()` | — |
| `physics/engine.js` | `bot.physics`, `bot.entity.position/velocity` | `physicsTick`, `move` |
| `inventory.js` | `bot.inventory`, `bot.heldItem`, `bot.equip()`, `bot.toss()`, `bot.unequip()` | `heldItemChanged`, `inventoryUpdated` |
| `windows.js` | `bot.currentWindow`, `bot.openChest()`, `bot.openFurnace()`, `bot.closeWindow()` | `windowOpen`, `windowClose` |
| `digging.js` | `bot.dig()`, `bot.stopDigging()`, `bot.canDigBlock()` | `diggingCompleted`, `diggingAborted` |
| `placing.js` | `bot.placeBlock()`, `bot.activateBlock()` | — |
| `combat.js` | `bot.attack()`, `bot.activateItem()`, `bot.deactivateItem()` | — |
| `crafting.js` | `bot.craft()` | — |
| `recipes.js` | `bot.recipesFor()`, `bot.recipes` | `recipesLoaded` |
| `pathfinder.js` | `bot.pathfinder.goto()`, `bot.pathfinder.stop()` | `path_update`, `goal_reached`, `path_reset` |
| `vehicles.js` | `bot.mount()`, `bot.dismount()`, `bot.vehicle` | `mount`, `dismount` |
| `sleep.js` | `bot.sleep()`, `bot.wake()`, `bot.isSleeping` | `sleep`, `wake` |
| `time.js` | `bot.time.timeOfDay`, `bot.time.day`, `bot.time.isDay` | `time` |
| `scoreboard.js` | `bot.scoreboards`, `bot.scoreboard` | `scoreboardCreated`, `scoreUpdated` |
| `sound.js` | — | `soundEffectHeard` |
| `creative.js` | `bot.creative.setInventorySlot()`, `bot.creative.flyTo()` | — |
| `resource_pack.js` | — (auto-accepts packs) | — |

## Reference: Ecosystem Plugins (opt-in)

| Plugin File | Key Methods | Description |
|-------------|-------------|-------------|
| `auto_eat.js` | `bot.autoEat.enable()`, `bot.autoEat.disable()` | Automatically eats food when hungry |
| `collect_block.js` | `bot.collectBlock.collect()` | Pathfinds to and collects a target block |
| `guard.js` | `bot.guard.start()`, `bot.guard.stop()` | Guards a position, attacks nearby hostiles |
