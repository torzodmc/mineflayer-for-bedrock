/**
 * Resource Pack Plugin for bedrockflayer.
 *
 * bedrock-protocol already handles the resource pack handshake internally
 * (automatically accepts all packs). This plugin only EMITS events so user
 * scripts can react to resource pack information if needed.
 *
 * NOTE: We do NOT send any resource_pack_client_response packets here
 * because bedrock-protocol's internal handler already does this.
 * Sending duplicate responses breaks the login handshake.
 */

function resourcePackPlugin(bot) {
    // ---- Emit resource pack info events ----
    bot.client.on('resource_packs_info', (packet) => {
        const packs = packet.texture_packs || packet.resource_packs || []
        bot.emit('resourcePack', {
            mustAccept: packet.must_accept || false,
            hasAddonPacks: packet.has_addon_packs || false,
            hasScripts: packet.has_scripts || false,
            packs: packs.map(p => ({
                id: p.uuid || p.pack_id,
                version: p.version,
                size: p.size
            }))
        })
    })

    // ---- Resource pack data (download chunks) ----
    bot.client.on('resource_pack_data_info', (packet) => {
        bot.emit('resourcePackDownload', {
            id: packet.pack_id,
            size: packet.max_chunk_size,
            chunkCount: packet.chunk_count
        })
    })
}

module.exports = resourcePackPlugin
