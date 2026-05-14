# Bedrock Packet → Feature Mapping

> This document maps every Bedrock protocol packet that bedrockflayer handles to the specific bot feature, event, or property it drives. This is the critical reference for any developer extending the framework.

## Core / Lifecycle Packets

| Packet Name | Direction | Handler File | Bot Feature |
|-------------|-----------|-------------|-------------|
| `start_game` | S→C | `lib/bot.js` | Initialize position, entity, game state. Emit `login` |
| `play_status` | S→C | `lib/bot.js` | Detect `player_spawn` → emit `spawn` |
| `disconnect` | S→C | `lib/bot.js` | Emit `kicked` |
| `respawn` | S→C | `lib/bot.js`, `lib/plugins/health.js` | Update position, emit `respawn` + `spawn` |
| `resource_packs_info` | S→C | `lib/plugins/resource_pack.js` | Accept resource packs |
| `resource_pack_stack` | S→C | `lib/plugins/resource_pack.js` | Acknowledge pack stack |

## Chat / UI Packets

| Packet Name | Direction | Handler File | Bot Feature |
|-------------|-----------|-------------|-------------|
| `text` | S→C / C→S | `lib/plugins/chat.js` | Chat, whisper, message, actionBar events. `bot.chat()` sends this |
| `set_title` | S→C | `lib/plugins/chat.js` | Title, subtitle, title_times, title_clear events |

## Health / State Packets

| Packet Name | Direction | Handler File | Bot Feature |
|-------------|-----------|-------------|-------------|
| `update_attributes` | S→C | `lib/plugins/health.js` | Health, hunger, saturation, XP, movement speed |
| `set_entity_data` | S→C | `lib/plugins/health.js` | Oxygen level (breath event) |
| `game_rules_changed` | S→C | `lib/plugins/health.js` | Game rule updates |
| `set_difficulty` | S→C | `lib/plugins/health.js` | `bot.game.difficulty` |
| `change_dimension` | S→C | `lib/plugins/health.js` | Dimension change, position update |
| `set_player_game_type` | S→C | `lib/plugins/health.js` | `bot.game.gameMode` |
| `player_list` | S→C | `lib/plugins/health.js` | `bot.players`, playerJoined/Left events |
| `set_spawn_position` | S→C | `lib/plugins/health.js` | `bot.spawnPoint` |
| `player_action` | C→S | `lib/plugins/health.js` | `bot.respawn()` sends this |

## World / Chunk Packets

| Packet Name | Direction | Handler File | Bot Feature |
|-------------|-----------|-------------|-------------|
| `level_chunk` | S→C | `lib/plugins/world.js` | Chunk loading, `bot.world` |
| `update_block` | S→C | `lib/plugins/world.js` | Block updates, `blockUpdate` event |
| `update_block_synced` | S→C | `lib/plugins/world.js` | Synced block updates |
| `block_entity_data` | S→C | `lib/plugins/world.js` | Block entity NBT (signs, chests, etc.) |
| `set_time` | S→C | `lib/plugins/time.js` | Time of day, `bot.time` |
| `level_event` | S→C | `lib/plugins/time.js`, `sound.js` | Weather, particles |

## Entity Packets

| Packet Name | Direction | Handler File | Bot Feature |
|-------------|-----------|-------------|-------------|
| `add_player` | S→C | `lib/plugins/entities.js` | Player entity spawn |
| `add_entity` | S→C | `lib/plugins/entities.js` | Entity spawn (mobs/items) |
| `remove_entity` | S→C | `lib/plugins/entities.js` | Entity despawn, `entityGone` |
| `move_entity_absolute` | S→C | `lib/plugins/entities.js` | Entity movement |
| `move_entity_delta` | S→C | `lib/plugins/entities.js` | Entity movement (delta) |
| `mob_equipment` | S→C | `lib/plugins/entities.js` | Entity equipment |
| `mob_effect` | S→C | `lib/plugins/entities.js` | Potion effects |
| `animate` | S→C | `lib/plugins/entities.js` | Arm swing, hurt animation |
| `entity_event` | S→C | `lib/plugins/entities.js` | Death, eat, tame events |
| `set_entity_link` | S→C | `lib/plugins/entities.js`, `vehicles.js` | Mount/dismount |

## Physics / Movement Packets

| Packet Name | Direction | Handler File | Bot Feature |
|-------------|-----------|-------------|-------------|
| `player_auth_input` | C→S | `lib/physics/engine.js` | Position, rotation, input flags (sent every tick) |
| `correct_player_move_prediction` | S→C | `lib/physics/engine.js` | Server position corrections |
| `set_actor_motion` | S→C | `lib/physics/engine.js` | External velocity (knockback, explosions) |

## Inventory / Window Packets

| Packet Name | Direction | Handler File | Bot Feature |
|-------------|-----------|-------------|-------------|
| `inventory_content` | S→C | `lib/plugins/inventory.js` | Full inventory sync |
| `inventory_slot` | S→C | `lib/plugins/inventory.js` | Single slot update |
| `mob_equipment` | C→S | `lib/plugins/inventory.js` | `bot.equip()` — equip item to hand |
| `container_open` | S→C | `lib/plugins/windows.js` | Window open, `bot.openChest()` etc. |
| `container_close` | S→C / C→S | `lib/plugins/windows.js` | Window close |
| `container_set_data` | S→C | `lib/plugins/windows.js` | Furnace fuel/progress |
| `inventory_transaction` | C→S | `lib/plugins/combat.js`, `placing.js`, `inventory.js` | Attack, use item, place block, drop item |
| `crafting_data` | S→C | `lib/plugins/recipes.js` | Recipe registry (2,500+ recipes) |

## Combat / Interaction Packets

| Packet Name | Direction | Handler File | Bot Feature |
|-------------|-----------|-------------|-------------|
| `inventory_transaction` | C→S | `lib/plugins/combat.js` | `bot.attack()`, `bot.activateItem()` |
| `level_sound_event` | S→C | `lib/plugins/sound.js` | Sound effects |

## Scoreboard / Display Packets

| Packet Name | Direction | Handler File | Bot Feature |
|-------------|-----------|-------------|-------------|
| `set_display_objective` | S→C | `lib/plugins/scoreboard.js` | Scoreboard display |
| `set_score` | S→C | `lib/plugins/scoreboard.js` | Score updates |
| `boss_event` | S→C | `lib/plugins/scoreboard.js` | Boss bars |

---

## Sending Packets

To send a packet to the server:
```javascript
bot.client.queue('packet_name', {
    field_1: value_1,
    field_2: value_2
});
```

## Listening for Packets

To listen for packets from the server:
```javascript
bot.client.on('packet_name', (packet) => {
    // packet is a parsed JavaScript object
    console.log(packet.field_1);
});
```
