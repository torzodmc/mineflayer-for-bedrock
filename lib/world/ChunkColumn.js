/**
 * ChunkColumn — Stores a 16×384×16 column of blocks.
 *
 * Bedrock worlds span Y=-64 to Y=319 (24 SubChunks of 16 each).
 * Each SubChunk stores 16×16×16 blocks as runtime IDs.
 *
 * This class manages SubChunk storage and provides block access by world Y.
 */

const { SubChunk, parseBlockStorage } = require('./SubChunk')

const DEFAULT_MIN_Y = -64
const DEFAULT_MAX_Y = 319
const DEFAULT_SUBCHUNK_COUNT = 24
const SECTION_HEIGHT = 16
const MAX_SECTION_INDEX = 24

const LEGACY_ID_TO_RUNTIME = {
    0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
    10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15, 16: 16, 17: 17,
    18: 18, 19: 19, 20: 20, 21: 21, 22: 22, 23: 23, 24: 24, 25: 25,
    26: 26, 27: 27, 28: 28, 29: 29, 30: 30, 31: 31, 32: 32, 33: 33,
    34: 34, 35: 35, 36: 36, 37: 37, 38: 38, 39: 39, 40: 40, 41: 41,
    42: 42, 43: 43, 44: 44, 45: 45, 46: 46, 47: 47, 48: 48, 49: 49,
    50: 50, 51: 51, 52: 52, 53: 53, 54: 54, 55: 55, 56: 56, 57: 57,
    58: 58, 59: 59, 60: 60, 61: 61, 62: 62, 63: 63, 64: 64, 65: 65,
    66: 66, 67: 67, 68: 68, 69: 69, 70: 70, 71: 71, 72: 72, 73: 73,
    74: 74, 75: 75, 76: 76, 77: 77, 78: 78, 79: 79, 80: 80, 81: 81,
    82: 82, 83: 83, 84: 84, 85: 85, 86: 86, 87: 87, 88: 88, 89: 89,
    90: 90, 91: 91, 92: 92, 93: 93, 94: 94, 95: 95, 96: 96, 97: 97,
    98: 98, 99: 99, 100: 100, 101: 101, 102: 102, 103: 103, 104: 104,
    105: 105, 106: 106, 107: 107, 108: 108, 109: 109, 110: 110, 111: 111,
    112: 112, 113: 113, 114: 114, 115: 115, 116: 116, 117: 117, 118: 118,
    119: 119, 120: 120, 121: 121, 122: 122, 123: 123, 124: 124, 125: 125,
    126: 126, 127: 127, 128: 128, 129: 129, 130: 130, 131: 131, 132: 132,
    133: 133, 134: 134, 135: 135, 136: 136, 137: 137, 138: 138, 139: 139,
    140: 140, 141: 141, 142: 142, 143: 143, 144: 144, 145: 145, 146: 146,
    147: 147, 148: 148, 149: 149, 150: 150, 151: 151, 152: 152, 153: 153,
    154: 154, 155: 155, 156: 156, 157: 157, 158: 158, 159: 159, 160: 160,
    161: 161, 162: 162, 163: 163, 164: 164, 165: 165, 166: 166, 167: 167,
    168: 168, 169: 169, 170: 170, 171: 171, 172: 172, 173: 173, 174: 174,
    175: 175, 176: 176, 177: 177, 178: 178, 179: 179, 180: 180, 181: 181,
    182: 182, 183: 183, 184: 184, 185: 185, 186: 186, 187: 187, 188: 188,
    189: 189, 190: 190, 191: 191, 192: 192, 193: 193, 194: 194, 195: 195,
    196: 196, 197: 197, 198: 198, 199: 199, 200: 200, 201: 201, 202: 202,
    203: 203, 204: 204, 205: 205, 206: 206, 207: 207, 208: 208, 209: 209,
    210: 210, 211: 211, 212: 212, 213: 213, 214: 214, 215: 215, 216: 216,
    217: 217, 218: 218, 219: 219, 220: 220, 221: 221, 222: 222, 223: 223,
    224: 224, 225: 225, 226: 226, 227: 227, 228: 228, 229: 229, 230: 230,
    231: 231, 232: 232, 233: 233, 234: 234, 235: 235, 236: 236, 237: 237,
    238: 238, 239: 239, 240: 240, 241: 241, 242: 242, 243: 243, 244: 244,
    245: 245, 246: 246, 247: 247, 248: 248, 249: 249, 250: 250, 251: 251,
    252: 252, 253: 253, 254: 254, 255: 255
}

class ChunkColumn {
    /**
     * @param {number} x - Chunk X coordinate
     * @param {number} z - Chunk Z coordinate
     * @param {number} [minY] - Minimum Y coordinate (default: -64)
     * @param {number} [maxY] - Maximum Y coordinate (default: 319)
     */
    constructor(x, z, minY = DEFAULT_MIN_Y, maxY = DEFAULT_MAX_Y) {
        this.x = x
        this.z = z
        this.minY = minY
        this.maxY = maxY
        const subChunkCount = Math.ceil((maxY - minY + 1) / SECTION_HEIGHT)
        /** @type {(SubChunk|null)[]} SubChunks spanning minY..maxY */
        this.sections = new Array(subChunkCount).fill(null)
        this.heightmaps = []
        this.biomes = null
        this.blockEntities = []
    }

    /**
     * Get the SubChunk index for a world Y coordinate.
     * @param {number} y - World Y coordinate
     * @returns {number} Section index (0..23), or -1 if out of range
     */
    _sectionIndex(y) {
        if (y < this.minY || y > this.maxY) return -1
        const idx = Math.floor((y - this.minY) / SECTION_HEIGHT)
        return Math.min(idx, this.sections.length - 1)
    }

    /**
     * Get block runtime ID at world coordinates.
     * @param {number} x - World X (only lower 4 bits used)
     * @param {number} y - World Y
     * @param {number} z - World Z (only lower 4 bits used)
     * @returns {number} Block runtime ID, or 0 (air) if section not loaded
     */
    getBlockRuntimeId(x, y, z) {
        if (y < this.minY || y > this.maxY) return 0
        const sIdx = this._sectionIndex(y)
        const section = this.sections[sIdx]
        if (!section) return 0
        return section.getBlock(x & 0xF, (y - this.minY) & 0xF, z & 0xF)
    }

    /**
     * Set block runtime ID at world coordinates.
     */
    setBlockRuntimeId(x, y, z, runtimeId) {
        if (y < this.minY || y > this.maxY) return
        const sIdx = this._sectionIndex(y)
        if (sIdx < 0 || !this.sections[sIdx]) {
            this.sections[sIdx] = new SubChunk()
        }
        this.sections[sIdx].setBlock(x & 0xF, (y - this.minY) & 0xF, z & 0xF, runtimeId)
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
     * @param {object} [blockEntityParser] - Optional function to parse block entities
     */
    parsePayload(payload, subChunkCount, blockEntityParser) {
        if (!Buffer.isBuffer(payload) || payload.length === 0) return

        let offset = 0

        if (subChunkCount >= 0) {
            for (let i = 0; i < subChunkCount && offset < payload.length; i++) {
                const version = payload[offset++]

                if (version === 0) {
                    const subchunk = new SubChunk()
                    subchunk.blocks.fill(0)
                    this.sections[i] = subchunk
                } else if (version === 1) {
                    const subchunk = new SubChunk()
                    const end = Math.min(offset + 4096, payload.length)
                    for (let b = 0; b < 4096 && offset < end; b++) {
                        const legacyId = payload[offset++]
                        subchunk.blocks[b] = LEGACY_ID_TO_RUNTIME[legacyId] ?? legacyId
                    }
                    this.sections[i] = subchunk
                } else if (version === 8 || version === 9) {
                    const layerCount = version === 9 ? payload[offset++] : 1
                    let waterloggingData = null

                    for (let layer = 0; layer < layerCount && offset < payload.length; layer++) {
                        const result = parseBlockStorage(payload, offset)
                        if (result.bytesRead === 0) break

                        if (layer === 0) {
                            this.sections[i] = result.subchunk
                        } else if (layer === 1) {
                            waterloggingData = result.subchunk
                        }
                        offset += result.bytesRead
                    }

                    if (waterloggingData) {
                        this.sections[i].waterlogging = waterloggingData
                    }
                } else if (version >= 10) {
                    const cacheEnabled = (version >= 11)
                    let waterloggingData = null

                    if (cacheEnabled && offset < payload.length) {
                        offset++
                    }

                    while (offset < payload.length) {
                        const result = parseBlockStorage(payload, offset)
                        if (result.bytesRead === 0) break

                        if (!this.sections[i]) {
                            this.sections[i] = result.subchunk
                        } else if (!waterloggingData) {
                            waterloggingData = result.subchunk
                        }
                        offset += result.bytesRead
                    }

                    if (waterloggingData && this.sections[i]) {
                        this.sections[i].waterlogging = waterloggingData
                    }
                } else {
                    break
                }
            }

            if (offset < payload.length) {
                const remaining = payload.length - offset
                if (remaining >= 512 && offset + 512 <= payload.length) {
                    this.heightmaps = this._parseHeightmap(payload, offset)
                    offset += 512
                }
                const biomeRemaining = payload.length - offset
                if (biomeRemaining >= 4096 && offset + 4096 <= payload.length) {
                    this.biomes = this._parseBiomes(payload, offset, true)
                    offset += 4096
                } else if (biomeRemaining >= 256 && offset + 256 <= payload.length) {
                    this.biomes = this._parseBiomes(payload, offset, false)
                    offset += 256
                }
            }
        } else {
            if (payload.length >= 512 && offset + 512 <= payload.length) {
                this.heightmaps = this._parseHeightmap(payload, offset)
                offset += 512
            }
            const biomeRemaining = payload.length - offset
            if (biomeRemaining >= 4096 && offset + 4096 <= payload.length) {
                this.biomes = this._parseBiomes(payload, offset, true)
            } else if (biomeRemaining >= 256 && offset + 256 <= payload.length) {
                this.biomes = this._parseBiomes(payload, offset, false)
            }
        }

        if (blockEntityParser && offset < payload.length) {
            this.blockEntities = blockEntityParser(payload, offset)
        }
    }

    _parseHeightmap(payload, offset) {
        if (offset < 0 || offset + 512 > payload.length) {
            return new Uint32Array(256)
        }
        const heightmap = new Uint32Array(256)
        for (let i = 0; i < 256; i++) {
            const pos = offset + i * 4
            if (pos + 4 <= payload.length) {
                heightmap[i] = payload.readUInt32LE(pos)
            }
        }
        return heightmap
    }

    _parseBiomes(payload, offset, is3D = false) {
        const size = is3D ? 4096 : 256
        if (offset < 0 || offset + size > payload.length) {
            return is3D ? new Uint8Array(4096) : new Uint8Array(256)
        }
        const biome = new Uint8Array(size)
        for (let i = 0; i < size; i++) {
            biome[i] = payload[offset + i]
        }
        return biome
    }

    /**
     * Get biome at world coordinates.
     * @param {number} x - World X (0-15 within chunk)
     * @param {number} y - World Y
     * @param {number} z - World Z (0-15 within chunk)
     * @returns {number} Biome ID
     */
    getBiome(x, y, z) {
        if (!this.biomes) return 0
        const size = this.biomes.length
        if (size === 4096) {
            const localY = y - this.minY
            if (localY < 0 || localY > 319) return 0
            return this.biomes[(localY << 8) | (z << 4) | x]
        }
        return this.biomes[(z << 4) | x] || 0
    }

    dispose() {
        for (let i = 0; i < this.sections.length; i++) {
            this.sections[i] = null
        }
        this.heightmaps = null
        this.biomes = null
        this.blockEntities = []
    }
}

module.exports = ChunkColumn
