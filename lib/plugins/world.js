/**
 * World Plugin for bedrockflayer.
 *
 * Manages the in-memory world representation: chunk loading/unloading,
 * block lookups, block updates, and block entity data.
 *
 * Uses ChunkColumn for full block storage from level_chunk payloads,
 * with fallback to update_block cache for subchunk request mode.
 */

const { Vec3 } = require('../utils/vec3')
const Block = require('../classes/Block')
const ChunkColumn = require('../world/ChunkColumn')

function worldPlugin(bot) {
    // ---- State ----
    /** @type {Map<string, ChunkColumn>} chunk "x,z" → ChunkColumn */
    bot._chunks = new Map()
    /** @type {Map<string, number>} "x,y,z" → block runtime ID (from update_block) */
    bot._blockStore = new Map()
    bot._blockEntities = new Map()
    /** @type {Set<string>} loaded chunk keys */
    bot._loadedChunks = new Set()

    // ---- Provide a world-like interface ----
    bot.world = {
        getBlockStateId(pos) {
            const x = Math.floor(pos.x)
            const y = Math.floor(pos.y)
            const z = Math.floor(pos.z)

            // Try chunk column first
            const chunkX = x >> 4
            const chunkZ = z >> 4
            const chunk = bot._chunks.get(`${chunkX},${chunkZ}`)
            if (chunk) {
                return chunk.getBlockRuntimeId(x, y, z)
            }

            // Fall back to update_block cache
            return bot._blockStore.get(`${x},${y},${z}`) || null
        },

        setBlockStateId(pos, stateId) {
            const x = Math.floor(pos.x)
            const y = Math.floor(pos.y)
            const z = Math.floor(pos.z)

            // Update chunk column if available
            const chunkX = x >> 4
            const chunkZ = z >> 4
            const chunk = bot._chunks.get(`${chunkX},${chunkZ}`)
            if (chunk) {
                chunk.setBlockRuntimeId(x, y, z, stateId)
            }

            // Always update the blockStore cache
            bot._blockStore.set(`${x},${y},${z}`, stateId)
        }
    }

    // ---- Block Update Packets ----
    bot.client.on('update_block', (packet) => {
        const pos = new Vec3(packet.position.x, packet.position.y, packet.position.z)
        const key = `${pos.x},${pos.y},${pos.z}`

        const oldStateId = bot._blockStore.get(key) || 0
        const oldBlock = _createBlock(bot, pos, oldStateId)

        const newStateId = packet.block_runtime_id || 0
        bot._blockStore.set(key, newStateId)

        // Also update chunk column
        const chunkX = pos.x >> 4
        const chunkZ = pos.z >> 4
        const chunk = bot._chunks.get(`${chunkX},${chunkZ}`)
        if (chunk) {
            chunk.setBlockRuntimeId(pos.x, pos.y, pos.z, newStateId)
        }

        const newBlock = _createBlock(bot, pos, newStateId)
        bot.emit('blockUpdate', oldBlock, newBlock)
        bot.emit(`blockUpdate:${pos.x},${pos.y},${pos.z}`, oldBlock, newBlock)
    })

    bot.client.on('update_block_synced', (packet) => {
        const pos = new Vec3(packet.position.x, packet.position.y, packet.position.z)
        const key = `${pos.x},${pos.y},${pos.z}`

        const oldStateId = bot._blockStore.get(key) || 0
        const oldBlock = _createBlock(bot, pos, oldStateId)

        const newStateId = packet.block_runtime_id || 0
        bot._blockStore.set(key, newStateId)

        const chunkX = pos.x >> 4
        const chunkZ = pos.z >> 4
        const chunk = bot._chunks.get(`${chunkX},${chunkZ}`)
        if (chunk) {
            chunk.setBlockRuntimeId(pos.x, pos.y, pos.z, newStateId)
        }

        const newBlock = _createBlock(bot, pos, newStateId)
        bot.emit('blockUpdate', oldBlock, newBlock)
    })

    // ---- Block Entity Data ----
    bot.client.on('block_entity_data', (packet) => {
        const pos = new Vec3(packet.position.x, packet.position.y, packet.position.z)
        bot._blockEntities.set(`${pos.x},${pos.y},${pos.z}`, packet.nbt || packet)
    })

    // ---- Chunk Loading ----
    bot.client.on('level_chunk', (packet) => {
        const chunkX = packet.x
        const chunkZ = packet.z
        const chunkKey = `${chunkX},${chunkZ}`

        bot._loadedChunks.add(chunkKey)

        // Create and parse ChunkColumn
        const column = new ChunkColumn(chunkX, chunkZ)
        const subChunkCount = packet.sub_chunk_count

        if (packet.payload && Buffer.isBuffer(packet.payload)) {
            try {
                column.parsePayload(packet.payload, subChunkCount)
            } catch (e) {
                // Chunk parsing failed — column will be empty, blocks come via update_block
            }
        }

        bot._chunks.set(chunkKey, column)

        const point = new Vec3(chunkX * 16, 0, chunkZ * 16)
        bot.emit('chunkColumnLoad', point)
    })

    // ---- Chunk Unloading via publisher update ----
    bot.client.on('network_chunk_publisher_update', (packet) => {
        if (packet.position) {
            bot._chunkCenter = new Vec3(packet.position.x, packet.position.y, packet.position.z)
            bot._chunkRadius = packet.radius || 64

            // Prune chunks outside view radius
            const centerChunkX = packet.position.x >> 4
            const centerChunkZ = packet.position.z >> 4
            const radiusChunks = Math.ceil(bot._chunkRadius / 16) + 1

            for (const key of bot._loadedChunks) {
                const [cx, cz] = key.split(',').map(Number)
                if (Math.abs(cx - centerChunkX) > radiusChunks || Math.abs(cz - centerChunkZ) > radiusChunks) {
                    bot._loadedChunks.delete(key)
                    bot._chunks.delete(key)
                }
            }
        }
    })

    // ============================================================
    //  Methods injected onto bot
    // ============================================================

    /**
     * Get the block at a world position.
     * Returns Block with name/hardness from registry when available.
     * @param {Vec3} point - World coordinates
     * @param {boolean} [extraInfos=true] - Include block entity data
     * @returns {Block|null}
     */
    bot.blockAt = function (point, extraInfos = true) {
        if (!point) return null
        const x = Math.floor(point.x)
        const y = Math.floor(point.y)
        const z = Math.floor(point.z)

        // Try chunk column first
        const chunkX = x >> 4
        const chunkZ = z >> 4
        const chunk = bot._chunks.get(`${chunkX},${chunkZ}`)
        let stateId

        if (chunk) {
            stateId = chunk.getBlockRuntimeId(x, y, z)
        } else {
            // Fall back to update_block cache
            stateId = bot._blockStore.get(`${x},${y},${z}`)
            if (stateId === undefined) return null
        }

        const pos = new Vec3(x, y, z)
        const block = _createBlock(bot, pos, stateId)

        if (extraInfos) {
            const be = bot._blockEntities.get(`${x},${y},${z}`)
            if (be) block.blockEntity = be
        }

        return block
    }

    /**
     * Find blocks matching a condition in loaded chunks.
     * @param {object} options
     * @param {Vec3} [options.point] - Center of search
     * @param {Function|number|number[]|string} options.matching - Block filter
     * @param {number} [options.maxDistance=16]
     * @param {number} [options.count=1]
     * @returns {Vec3[]}
     */
    bot.findBlocks = function (options = {}) {
        const center = options.point || (bot.entity ? bot.entity.position : new Vec3(0, 0, 0))
        const maxDist = options.maxDistance || 16
        const count = options.count || 1
        const matching = options.matching

        let matchFn
        if (typeof matching === 'function') {
            matchFn = matching
        } else if (typeof matching === 'number') {
            matchFn = (block) => block.type === matching
        } else if (typeof matching === 'string') {
            matchFn = (block) => block.name === matching
        } else if (Array.isArray(matching)) {
            matchFn = (block) => matching.includes(block.type) || matching.includes(block.name)
        } else {
            return []
        }

        const results = []
        const cx = Math.floor(center.x)
        const cy = Math.floor(center.y)
        const cz = Math.floor(center.z)
        const dist = Math.ceil(maxDist)

        for (let x = cx - dist; x <= cx + dist; x++) {
            for (let y = cy - dist; y <= cy + dist; y++) {
                for (let z = cz - dist; z <= cz + dist; z++) {
                    // Check chunk column
                    const chunkX = x >> 4
                    const chunkZ = z >> 4
                    const chunk = bot._chunks.get(`${chunkX},${chunkZ}`)
                    let stateId
                    if (chunk) {
                        stateId = chunk.getBlockRuntimeId(x, y, z)
                    } else {
                        stateId = bot._blockStore.get(`${x},${y},${z}`)
                        if (stateId === undefined) continue
                    }

                    const pos = new Vec3(x, y, z)
                    if (pos.distanceTo(center) > maxDist) continue

                    const block = _createBlock(bot, pos, stateId)
                    if (matchFn(block)) {
                        results.push(pos)
                        if (results.length >= count) {
                            return results.sort((a, b) => a.distanceTo(center) - b.distanceTo(center))
                        }
                    }
                }
            }
        }

        return results.sort((a, b) => a.distanceTo(center) - b.distanceTo(center))
    }

    /**
     * Find a single block matching a condition.
     * @param {object} options
     * @returns {Block|null}
     */
    bot.findBlock = function (options = {}) {
        const positions = bot.findBlocks({ ...options, count: 1 })
        if (positions.length === 0) return null
        return bot.blockAt(positions[0])
    }

    /**
     * Check if the bot can see a block (line-of-sight raycast).
     */
    bot.canSeeBlock = function (block) {
        if (!block || !bot.entity) return false
        const eye = bot.entity.eyePosition || bot.entity.position.offset(0, 1.62, 0)
        const target = block.position.offset(0.5, 0.5, 0.5)
        return _raycast(bot, eye, target)
    }

    /**
     * Get the block the bot is looking at.
     */
    bot.blockAtCursor = function (maxDistance = 256) {
        if (!bot.entity) return null
        const eye = bot.entity.eyePosition || bot.entity.position.offset(0, 1.62, 0)
        const yaw = bot.entity.yaw
        const pitch = bot.entity.pitch

        const dx = -Math.sin(yaw) * Math.cos(pitch)
        const dy = -Math.sin(pitch)
        const dz = Math.cos(yaw) * Math.cos(pitch)
        const dir = new Vec3(dx, dy, dz)

        const stepLen = 0.3125
        const steps = Math.ceil(maxDistance / stepLen)

        for (let i = 1; i <= steps; i++) {
            const point = eye.plus(dir.scaled(i * stepLen))
            const block = bot.blockAt(point)
            if (block && !block.isAir) {
                return block
            }
        }
        return null
    }

    /**
     * Wait for chunks to load.
     */
    bot.waitForChunksToLoad = function () {
        return new Promise((resolve) => {
            if (bot._loadedChunks.size > 0) {
                resolve()
                return
            }
            const onChunk = () => {
                bot.removeListener('chunkColumnLoad', onChunk)
                resolve()
            }
            bot.on('chunkColumnLoad', onChunk)
        })
    }
}

// ---- Internal helpers ----

function _createBlock(bot, pos, stateId) {
    let blockData = null
    if (bot.registry) {
        // Try registry cache first (learned from update_block)
        blockData = bot.registry.blockByStateId(stateId)

        // If not cached, try direct ID lookup
        if (!blockData && bot.registry.blocksById) {
            blockData = bot.registry.blocksById[stateId] || null
        }
    }

    return new Block(blockData, pos, stateId)
}

function _raycast(bot, from, to) {
    const dir = to.minus(from)
    const dist = dir.norm()
    const step = dir.scaled(1 / dist)

    for (let d = 0; d < dist; d += 0.5) {
        const point = from.plus(step.scaled(d))
        const block = bot.blockAt(point, false)
        if (block && block.solid && !block.position.equals(to.floored())) {
            return false
        }
    }
    return true
}

module.exports = worldPlugin
