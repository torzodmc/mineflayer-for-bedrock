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

Add your plugin to the `internalPlugins` array in `index.js`:

```javascript
const myPlugin = require('./lib/plugins/myPlugin');

const internalPlugins = [
    chatPlugin,
    healthPlugin,
    myPlugin    // ← Add here
];
```

### External Plugins (user-created)

Users load plugins after creating the bot:

```javascript
const bot = bedrockflayer.createBot({ ... });
bot.loadPlugin(require('bedrockflayer-my-plugin'));
```

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
    bot._runtimeEntityId = 1;
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

## Reference: Internal Plugins

| Plugin File | Namespace | Key Events |
|-------------|-----------|------------|
| `chat.js` | `bot.chat()`, `bot.whisper()`, `bot.addChatPattern()` | `chat`, `whisper`, `message`, `title` |
| `health.js` | `bot.health`, `bot.food`, `bot.experience`, `bot.players` | `health`, `death`, `breath`, `experience`, `playerJoined` |
| `world.js` (Sprint 2) | `bot.world`, `bot.blockAt()`, `bot.findBlocks()` | `chunkColumnLoad`, `blockUpdate` |
| `entities.js` (Sprint 2) | `bot.entities`, `bot.nearestEntity()` | `entitySpawn`, `entityMoved`, `entityGone` |
| `controls.js` (Sprint 3) | `bot.setControlState()`, `bot.look()`, `bot.lookAt()` | — |
| `physics.js` (Sprint 3) | `bot.physicsEnabled`, `bot.physics` | `physicsTick`, `move` |
| `inventory.js` (Sprint 4) | `bot.inventory`, `bot.heldItem`, `bot.equip()` | `heldItemChanged` |
| `windows.js` (Sprint 4) | `bot.openContainer()`, `bot.openFurnace()` | `windowOpen`, `windowClose` |
| `combat.js` (Sprint 5) | `bot.attack()`, `bot.activateItem()` | — |
| `digging.js` (Sprint 5) | `bot.dig()`, `bot.canDigBlock()` | `diggingCompleted`, `diggingAborted` |
| `placing.js` (Sprint 5) | `bot.placeBlock()` | — |
| `crafting.js` (Sprint 6) | `bot.craft()`, `bot.recipesFor()` | — |
