// Minimal bot — no plugins, no chat, just connect and stay alive
// This isolates whether it's our code or bedrock-protocol causing the kick
const bp = require('bedrock-protocol')

const client = bp.createClient({
    host: 'localhost',
    port: 19132,
    username: 'MinimalBot',
    offline: true,
    skipPing: true
})

client.on('start_game', () => {
    console.log('[+] start_game received')
})

client.on('spawn', () => {
    console.log('[+] spawn — bot is alive, doing nothing...')
})

client.on('disconnect', (pkt) => {
    console.log('[KICKED]', pkt.message || pkt.reason || JSON.stringify(pkt))
})

client.on('close', () => {
    console.log('[CLOSED]')
    process.exit(0)
})

client.on('error', (e) => {
    console.error('[ERROR]', e.message)
})

// Keep alive for 30 seconds
setTimeout(() => {
    console.log('[+] Survived 30 seconds! Connection is stable.')
    client.close()
    process.exit(0)
}, 30000)
