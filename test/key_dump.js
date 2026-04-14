// Quick dump of start_game packet keys + block/item related fields
const bf = require('../index')
const bot = bf.createBot({ host: 'localhost', port: 19132, username: 'KeyDump', offline: true, skipPing: true })

bot.client.on('start_game', (p) => {
    const keys = Object.keys(p)
    console.log('ALL KEYS:', keys.join(', '))
    console.log('')

    // Check every key for arrays/objects that might be the palette
    for (const k of keys) {
        const v = p[k]
        if (Array.isArray(v)) {
            console.log(`${k}: Array[${v.length}]`)
            if (v.length > 0 && v[0]) {
                console.log(`  [0] keys:`, Object.keys(v[0]).join(', '))
                console.log(`  [0]:`, JSON.stringify(v[0]).slice(0, 200))
            }
        } else if (typeof v === 'object' && v !== null && !Buffer.isBuffer(v)) {
            const objKeys = Object.keys(v)
            if (objKeys.length > 5) {
                console.log(`${k}: Object{${objKeys.length} keys}`)
            }
        }
    }

    bot.end()
    setTimeout(() => process.exit(0), 500)
})

setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 20000)
