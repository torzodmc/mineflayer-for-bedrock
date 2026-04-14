// Capture inventory item structure, player_list records, and attribute items
const bp = require('bedrock-protocol')
const fs = require('fs')

const c = bp.createClient({
    host: 'localhost', port: 19132,
    username: 'DeepInsp2', offline: true
})

const results = {}

c.on('inventory_content', (packet) => {
    if (!results.inventory) {
        results.inventory = {
            window_id: packet.window_id,
            input_length: packet.input ? packet.input.length : 0,
            first_item: packet.input && packet.input[0] ? packet.input[0] : null,
            container: packet.container,
            storage_item: packet.storage_item
        }
    }
})

c.on('player_list', (packet) => {
    if (!results.player_list) {
        const r = packet.records
        results.player_list = {
            top_type: typeof r,
            type: r ? r.type : undefined,
            records_count: r ? r.records_count : undefined,
            first_record: r && r.records && r.records[0] ? Object.keys(r.records[0]) : null,
            first_record_data: r && r.records && r.records[0] ? {
                uuid: r.records[0].uuid,
                entity_unique_id: r.records[0].entity_unique_id,
                username: r.records[0].username,
                xbox_user_id: r.records[0].xbox_user_id,
                platform_chat_id: r.records[0].platform_chat_id,
                build_platform: r.records[0].build_platform,
                is_host: r.records[0].is_host,
                is_visual_editor: r.records[0].is_visual_editor,
            } : null
        }
    }
})

c.on('update_attributes', (packet) => {
    if (!results.attributes) {
        const attrs = packet.attributes || []
        results.attributes = {
            runtime_entity_id: packet.runtime_entity_id,
            runtime_entity_id_type: typeof packet.runtime_entity_id,
            tick: packet.tick,
            tick_type: typeof packet.tick,
            first_3_attrs: attrs.slice(0, 3).map(a => ({
                name: a.name, min: a.min, max: a.max, current: a.current, default: a.default, modifiers: a.modifiers
            }))
        }
    }
})

c.on('start_game', (packet) => {
    results.start_game_ids = {
        entity_id: packet.entity_id, entity_id_type: typeof packet.entity_id,
        runtime_entity_id: packet.runtime_entity_id, runtime_type: typeof packet.runtime_entity_id,
        player_gamemode: packet.player_gamemode, gm_type: typeof packet.player_gamemode
    }
})

c.on('spawn', () => {
    setTimeout(() => {
        fs.writeFileSync('test/deep2.json', JSON.stringify(results, (k, v) => typeof v === 'bigint' ? `${v} [BigInt]` : v, 2))
        console.log('Saved to test/deep2.json')
        c.close()
        process.exit(0)
    }, 2000)
})

setTimeout(() => { c.close(); process.exit(1) }, 15000)
