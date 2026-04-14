/**
 * ChunkColumn — Stores a 16×384×16 column of blocks.
 *
 * Bedrock worlds span Y=-64 to Y=319 (24 SubChunks of 16 each).
 * Each SubChunk stores 16×16×16 blocks as runtime IDs.
 *
 * This class manages SubChunk storage and provides block access by world Y.
 */

const { SubChunk, parseBlockStorage } = require('./SubChunk')

const MIN_Y = -64
const MAX_Y = 319
const SUBCHUNK_COUNT = 24
const SECTION_HEIGHT = 16

class ChunkColumn {
    /**
     * @param {number} x - Chunk X coordinate
     * @param {number} z - Chunk Z coordinate
     */
    constructor(x, z) {
        this.x = x
        this.z = z
        /** @type {(SubChunk|null)[]} 24 SubChunks, index 0 = Y -64..-49 */
        this.sections = new Array(SUBCHUNK_COUNT).fill(null)
    }

    /**
     * Get the SubChunk index for a world Y coordinate.
     * @param {number} y - World Y coordinate
     * @returns {number} Section index (0..23)
     */
    _sectionIndex(y) {
        return Math.floor((y - MIN_Y) / SECTION_HEIGHT)
    }

    /**
     * Get block runtime ID at world coordinates.
     * @param {number} x - World X (only lower 4 bits used)
     * @param {number} y - World Y
     * @param {number} z - World Z (only lower 4 bits used)
     * @returns {number} Block runtime ID, or 0 (air) if section not loaded
     */
    getBlockRuntimeId(x, y, z) {
        if (y < MIN_Y || y > MAX_Y) return 0
        const sIdx = this._sectionIndex(y)
        const section = this.sections[sIdx]
        if (!section) return 0
        return section.getBlock(x & 0xF, (y - MIN_Y) & 0xF, z & 0xF)
    }

    /**
     * Set block runtime ID at world coordinates.
     */
    setBlockRuntimeId(x, y, z, runtimeId) {
        if (y < MIN_Y || y > MAX_Y) return
        const sIdx = this._sectionIndex(y)
        if (!this.sections[sIdx]) {
            this.sections[sIdx] = new SubChunk()
        }
        this.sections[sIdx].setBlock(x & 0xF, (y - MIN_Y) & 0xF, z & 0xF, runtimeId)
    }

    /**
     * Parse level_chunk payload into SubChunk sections.
     *
     * For sub_chunk_count >= 0:
     *   The payload contains `sub_chunk_count` serialized SubChunks,
     *   each starting with a version byte, then block storage layer(s).
     *
     * For sub_chunk_count < 0 (subchunk request mode, BDS 1.18+):
     *   The payload contains biome/heightmap data only.
     *   Block data arrives via separate subchunk packets or update_block.
     *
     * @param {Buffer} payload
     * @param {number} subChunkCount
     */
    parsePayload(payload, subChunkCount) {
        if (!Buffer.isBuffer(payload) || payload.length === 0) return
        if (subChunkCount < 0) {
            // Subchunk request mode — payload is biome/height data only
            // Block data will come via update_block packets
            return
        }

        let offset = 0

        for (let i = 0; i < subChunkCount && offset < payload.length; i++) {
            // SubChunk version byte
            const version = payload[offset++]

            if (version === 1) {
                // Legacy format: 4096 block IDs (1 byte each)
                const subchunk = new SubChunk()
                const end = Math.min(offset + 4096, payload.length)
                for (let b = 0; b < 4096 && offset < end; b++) {
                    subchunk.blocks[b] = payload[offset++]
                }
                this.sections[i] = subchunk
                // Skip 4096 bytes of block data metadata
                offset += 4096
            } else if (version === 8 || version === 9) {
                // Modern palette format
                const layerCount = version === 9 ? payload[offset++] : 1

                for (let layer = 0; layer < layerCount && offset < payload.length; layer++) {
                    const result = parseBlockStorage(payload, offset)
                    if (layer === 0) {
                        // Primary block layer
                        this.sections[i] = result.subchunk
                    }
                    // layer 1 = waterlogging data (ignored for now)
                    offset += result.bytesRead
                    if (result.bytesRead === 0) break // couldn't parse
                }
            } else {
                // Unknown version — skip this SubChunk
                break
            }
        }
    }
}

module.exports = ChunkColumn
