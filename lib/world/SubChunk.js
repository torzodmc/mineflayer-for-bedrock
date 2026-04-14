/**
 * SubChunk — Bedrock Edition SubChunk block storage parser.
 *
 * Each SubChunk is 16×16×16 blocks using palette-based compression:
 * 1. Version byte → bits-per-block
 * 2. Packed block indices (32-bit words, little-endian)
 * 3. Palette of block runtime IDs (varint-encoded)
 *
 * Block ordering: x + (z * 16) + (y * 16 * 16) — XZY order
 *
 * Reference: Bedrock LevelDB format wiki + bedrock-protocol level_chunk payload
 */

class SubChunk {
    constructor() {
        /** @type {Uint32Array} 4096 block runtime IDs indexed by XZY */
        this.blocks = new Uint32Array(4096)
    }

    /**
     * Get block runtime ID at local coordinates.
     * @param {number} x - 0..15
     * @param {number} y - 0..15
     * @param {number} z - 0..15
     * @returns {number} Block runtime ID
     */
    getBlock(x, y, z) {
        return this.blocks[(x & 0xF) + ((z & 0xF) << 4) + ((y & 0xF) << 8)]
    }

    /**
     * Set block runtime ID at local coordinates.
     */
    setBlock(x, y, z, runtimeId) {
        this.blocks[(x & 0xF) + ((z & 0xF) << 4) + ((y & 0xF) << 8)] = runtimeId
    }
}

/**
 * Parse a SubChunk block storage layer from a Buffer.
 *
 * Format:
 *   byte 0: (bitsPerBlock << 1) | isRuntime
 *   bytes 1..N: packed indices (ceil(4096 / blocksPerWord) × 4 bytes)
 *   varint: palette size
 *   varints: palette entries (block runtime IDs)
 *
 * @param {Buffer} buf
 * @param {number} offset
 * @returns {{ subchunk: SubChunk, bytesRead: number }}
 */
function parseBlockStorage(buf, offset) {
    const subchunk = new SubChunk()
    let pos = offset

    if (pos >= buf.length) return { subchunk, bytesRead: 0 }

    const header = buf[pos++]
    const bitsPerBlock = header >> 1
    // const isRuntime = header & 1

    if (bitsPerBlock === 0) {
        // All blocks are the same — read single palette entry
        if (pos + 4 <= buf.length) {
            const runtimeId = readVarInt(buf, pos)
            subchunk.blocks.fill(runtimeId.value)
            pos = runtimeId.offset
        }
        return { subchunk, bytesRead: pos - offset }
    }

    const blocksPerWord = Math.floor(32 / bitsPerBlock)
    const wordCount = Math.ceil(4096 / blocksPerWord)
    const mask = (1 << bitsPerBlock) - 1

    // Read packed block indices
    const indices = new Uint32Array(4096)
    let blockIndex = 0

    for (let w = 0; w < wordCount && pos + 4 <= buf.length; w++) {
        const word = buf.readUInt32LE(pos)
        pos += 4

        for (let b = 0; b < blocksPerWord && blockIndex < 4096; b++) {
            indices[blockIndex++] = (word >>> (b * bitsPerBlock)) & mask
        }
    }

    // Read palette
    const paletteSize = readVarInt(buf, pos)
    pos = paletteSize.offset
    const palette = new Uint32Array(paletteSize.value)

    for (let i = 0; i < paletteSize.value && pos < buf.length; i++) {
        const entry = readVarInt(buf, pos)
        palette[i] = entry.value
        pos = entry.offset
    }

    // Map indices to runtime IDs via palette
    for (let i = 0; i < 4096; i++) {
        const idx = indices[i]
        subchunk.blocks[i] = idx < palette.length ? palette[idx] : 0
    }

    return { subchunk, bytesRead: pos - offset }
}

/**
 * Read a VarInt (unsigned) from a Buffer.
 * @param {Buffer} buf
 * @param {number} offset
 * @returns {{ value: number, offset: number }}
 */
function readVarInt(buf, offset) {
    let value = 0
    let shift = 0
    let pos = offset

    while (pos < buf.length) {
        const byte = buf[pos++]
        value |= (byte & 0x7F) << shift
        if ((byte & 0x80) === 0) break
        shift += 7
        if (shift > 35) break // prevent infinite loop
    }

    return { value: value >>> 0, offset: pos }
}

module.exports = { SubChunk, parseBlockStorage, readVarInt }
