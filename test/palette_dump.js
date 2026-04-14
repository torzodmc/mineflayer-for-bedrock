// Dump block_palette and itemstates from start_game packet
const bf = require('../index')

const bot = bf.createBot({
    host: 'localhost',
    port: 19132,
    username: 'PaletteDump',
    offline: true,
    skipPing: true
})

bot.client.on('start_game', (p) => {
    console.log('=== start_game keys ===')
    console.log(Object.keys(p).join(', '))

    if (p.block_palette) {
        console.log('\n=== block_palette ===')
        console.log('type:', typeof p.block_palette, 'isArr:', Array.isArray(p.block_palette), 'len:', p.block_palette.length)
        for (let i = 0; i < Math.min(5, p.block_palette.length); i++) {
            console.log(`  [${i}]:`, JSON.stringify(p.block_palette[i]).slice(0, 300))
        }
        // Find stone
        const stone = p.block_palette.find(b => b.name && b.name.includes('stone'))
        if (stone) {
            const idx = p.block_palette.indexOf(stone)
            console.log('\n  Stone entry (index=' + idx + '):', JSON.stringify(stone).slice(0, 300))
        }
        // Check if runtime_id is present in entries
        const keys = Object.keys(p.block_palette[0] || {})
        console.log('\n  Entry keys:', keys.join(', '))
    }

    if (p.itemstates) {
        console.log('\n=== itemstates ===')
        console.log('type:', typeof p.itemstates, 'len:', p.itemstates.length)
        for (let i = 0; i < Math.min(3, p.itemstates.length); i++) {
            console.log(`  [${i}]:`, JSON.stringify(p.itemstates[i]).slice(0, 200))
        }
    }
})

bot.on('spawn', () => {
    // Dump a few update_block packets
    let count = 0
    bot.client.on('update_block', (pkt) => {
        if (count < 5) {
            console.log('\n=== update_block ===')
            console.log('  runtime_id:', pkt.block_runtime_id, 'pos:', JSON.stringify(pkt.position))
            // Check if we can look up in block_palette
            count++
        }
    })

    setTimeout(() => {
        bot.end()
        setTimeout(() => process.exit(0), 500)
    }, 3000)
})

setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 25000)
