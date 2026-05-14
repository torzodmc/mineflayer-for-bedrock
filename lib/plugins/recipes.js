/**
 * Recipe Plugin for bedrockflayer.
 *
 * Listens for the `crafting_data` packet from the server to build
 * a recipe database. Provides:
 *   bot.recipesFor(itemId|itemName) — find recipes that produce an item
 *   bot.recipesAll — all known recipes
 *   bot.craft(recipe, count, craftingTable) — craft an item
 */

function recipesPlugin(bot) {
    /** @type {Array} All recipes from the server */
    bot._recipes = []
    /** @type {boolean} Whether crafting data has been received */
    bot._recipesLoaded = false

    // ---- Listen for crafting_data packet ----
    bot.client.on('crafting_data', (packet) => {
        try {
            bot._recipes = _parseRecipes(packet)
            bot._recipesLoaded = true
            bot.emit('recipesLoaded', bot._recipes.length)
        } catch (e) {
            bot._recipes = []
        }
    })

    /**
     * Get all recipes that produce a given item.
     * @param {number|string} item - Item network ID or name
     * @param {string} [type] - Filter by recipe type: 'shaped', 'shapeless', 'furnace'
     * @returns {Array} Matching recipes
     */
    bot.recipesFor = function (item, type) {
        const recipes = bot._recipes.filter(r => {
            // Match by output item
            let match = false
            if (typeof item === 'number') {
                match = r.outputId === item
            } else if (typeof item === 'string') {
                const clean = item.replace('minecraft:', '')
                match = r.outputName === clean || r.outputName === item
            }
            if (!match) return false
            if (type && r.type !== type) return false
            return true
        })
        return recipes
    }

    /**
     * Get all loaded recipes.
     * @returns {Array}
     */
    Object.defineProperty(bot, 'recipesAll', {
        get() { return bot._recipes }
    })

    /**
     * Craft an item using a recipe.
     * Sends an inventory_transaction to the server.
     *
     * @param {object} recipe - Recipe from recipesFor()
     * @param {number} [count=1] - Number of times to craft
     * @param {object} [craftingTable] - Block object of a crafting table (for 3x3 recipes)
     * @returns {Promise<void>}
     */
    bot.craft = function (recipe, count = 1, craftingTable = null) {
        return new Promise((resolve, reject) => {
            if (!recipe) return reject(new Error('No recipe specified'))

            // If recipe requires a crafting table, interact with it
            if (recipe.requiresTable && !craftingTable) {
                return reject(new Error('This recipe requires a crafting table'))
            }

            if (craftingTable && bot.activateBlock) {
                bot.activateBlock(craftingTable)
            }

            // Send craft transactions
            for (let i = 0; i < count; i++) {
                try {
                    bot.client.queue('inventory_transaction', {
                        transaction: {
                            transaction_type: 0,
                            legacy: { legacy_request_id: 0, legacy_transactions: [] },
                            actions: _buildCraftActions(bot, recipe)
                        }
                    })
                } catch (e) {
                    return reject(new Error(`Craft failed: ${e.message}`))
                }
            }

            // Server will send inventory_content updates
            // Wait a moment for the server to process
            setTimeout(() => {
                bot.emit('craft', recipe, count)
                resolve()
            }, 200 * count)
        })
    }
}

// ---- Internal helpers ----

/**
 * Parse the crafting_data packet into a normalized recipe array.
 */
function _parseRecipes(packet) {
    const recipes = []

    if (!packet || !packet.recipes) return recipes

    const rawList = Array.isArray(packet.recipes) ? packet.recipes : Object.values(packet.recipes)

    for (const raw of rawList) {
        try {
            if (!raw || !raw.type) continue
            // Skip invalid/meta entries
            if (raw.type === 'invalid' || raw.type === 'int_id_meta') continue

            // BDS nests actual recipe data under .recipe key
            const recipeData = raw.recipe || raw
            recipeData._outerType = raw.type

            const recipe = _normalizeRecipe(recipeData, raw.type)
            if (recipe) recipes.push(recipe)
        } catch {
            // Skip malformed recipes
        }
    }

    return recipes
}

/**
 * Normalize a single recipe entry from the crafting_data packet.
 */
function _normalizeRecipe(raw, outerType) {
    const type = outerType || raw.type

    if (type === 'shaped' || type === 1) {
        return _parseShaped(raw)
    } else if (type === 'shapeless' || type === 0) {
        return _parseShapeless(raw)
    } else if (type === 'furnace' || type === 2 || type === 'furnace_with_metadata' || type === 3) {
        return _parseFurnace(raw)
    }

    // Other recipe types (smithing, stonecutter, etc.)
    return null
}

function _parseShaped(raw) {
    const output = _extractOutput(raw)
    if (!output) return null

    return {
        type: 'shaped',
        id: raw.recipe_id || raw.uuid || null,
        width: raw.width || 0,
        height: raw.height || 0,
        input: raw.input || [],
        output: output.item,
        outputId: output.id,
        outputName: output.name,
        outputCount: output.count,
        requiresTable: (raw.width > 2 || raw.height > 2),
        tag: raw.tag || raw.block || 'crafting_table',
        priority: raw.priority || 0,
        networkId: raw.network_id || 0
    }
}

function _parseShapeless(raw) {
    const output = _extractOutput(raw)
    if (!output) return null

    const inputCount = raw.input ? raw.input.length : 0

    return {
        type: 'shapeless',
        id: raw.recipe_id || raw.uuid || null,
        input: raw.input || [],
        output: output.item,
        outputId: output.id,
        outputName: output.name,
        outputCount: output.count,
        requiresTable: inputCount > 4,
        tag: raw.tag || raw.block || 'crafting_table',
        priority: raw.priority || 0,
        networkId: raw.network_id || 0
    }
}

function _parseFurnace(raw) {
    const output = _extractOutput(raw)
    if (!output) return null

    const inputId = raw.input_id || (raw.input ? raw.input.network_id : 0) || 0

    return {
        type: 'furnace',
        id: raw.recipe_id || null,
        inputId: inputId,
        inputMeta: raw.input_meta || 0,
        output: output.item,
        outputId: output.id,
        outputName: output.name,
        outputCount: output.count,
        requiresTable: false,
        tag: raw.tag || raw.block || 'furnace'
    }
}

/**
 * Extract output item info from a recipe.
 */
function _extractOutput(raw) {
    let outputItem = null

    // Try .output (array or single)
    if (raw.output) {
        outputItem = Array.isArray(raw.output) ? raw.output[0] : raw.output
    } else if (raw.result) {
        outputItem = Array.isArray(raw.result) ? raw.result[0] : raw.result
    }

    if (!outputItem) return null

    const id = outputItem.network_id || outputItem.id || 0
    const name = (outputItem.name || '').replace('minecraft:', '')
    const count = outputItem.count || 1

    return { item: outputItem, id, name, count }
}

/**
 * Build inventory transaction actions for a craft.
 */
function _buildCraftActions(bot, recipe) {
    const actions = []

    if (recipe.input) {
        for (const ingredient of recipe.input) {
            if (ingredient && ingredient.network_id) {
                actions.push({
                    source_type: 99999,
                    action: 0,
                    slot: 0,
                    old_item: ingredient,
                    new_item: { network_id: 0 }
                })
            }
        }
    }

    actions.push({
        source_type: 99999,
        action: 0,
        slot: 50,
        old_item: { network_id: 0 },
        new_item: recipe.output || { network_id: recipe.outputId, count: recipe.outputCount }
    })

    return actions
}

module.exports = recipesPlugin
