/**
 * Crafting Plugin for bedrockflayer.
 *
 * Handles crafting recipes received from the server, recipe lookups,
 * and crafting via inventory_transaction packets.
 *
 * Bedrock sends all available recipes in the `crafting_data` packet
 * once on join.
 */

const Item = require('../classes/Item')

function craftingPlugin(bot) {
    // ---- State ----
    bot.recipes = []            // All known recipes
    bot._recipesByOutput = {}   // index: outputItemId → [recipe]

    // ---- Receive recipes from server ----
    bot.client.on('crafting_data', (packet) => {
        const recipes = packet.recipes || []
        bot.recipes = []
        bot._recipesByOutput = {}

        for (const raw of recipes) {
            const recipe = _parseRecipe(raw)
            if (recipe) {
                bot.recipes.push(recipe)
                const key = recipe.outputId
                if (!bot._recipesByOutput[key]) bot._recipesByOutput[key] = []
                bot._recipesByOutput[key].push(recipe)
            }
        }

        bot.emit('recipesUpdated', bot.recipes.length)
    })

    // ============================================================
    //  Methods
    // ============================================================

    /**
     * Find recipes that produce a given item.
     * @param {number} itemId - Output item type ID
     * @param {number} [metadata] - Output metadata (optional)
     * @param {boolean} [requireCraftable=false] - Only return recipes we have ingredients for
     * @returns {Array}
     */
    bot.recipesFor = function (itemId, metadata, requireCraftable = false) {
        const candidates = bot._recipesByOutput[itemId] || []

        let results = candidates
        if (metadata !== undefined) {
            results = candidates.filter(r => r.outputMeta === metadata || r.outputMeta === undefined)
        }

        if (requireCraftable) {
            results = results.filter(r => _hasIngredients(bot, r))
        }

        return results
    }

    /**
     * Find all recipes producing an item by name.
     * @param {string} name - Item name (e.g., 'crafting_table')
     * @returns {Array}
     */
    bot.recipesForName = function (name) {
        return bot.recipes.filter(r => r.outputName === name)
    }

    /**
     * Craft a recipe.
     * @param {object} recipe - A recipe from bot.recipesFor()
     * @param {number} [count=1] - How many times to craft
     * @param {Window} [craftingTable] - If recipe requires 3x3 grid, pass the open crafting table window
     * @returns {Promise<void>}
     */
    bot.craft = async function (recipe, count = 1, craftingTable = null) {
        if (!recipe) throw new Error('No recipe specified')

        for (let i = 0; i < count; i++) {
            // Build the craft transaction
            const actions = []

            // Consume input items
            for (const input of recipe.inputs) {
                if (!input || input.id === 0) continue
                const slot = bot.inventory.findItemSlot(input.id, input.meta)
                if (slot === -1) throw new Error(`Missing ingredient: item ${input.id}`)

                const item = bot.inventory.slots[slot]
                actions.push({
                    source_type: 'container',
                    window_id: craftingTable ? craftingTable.id : 0,
                    source_flags: 0,
                    slot,
                    old_item: item.toNetwork(),
                    new_item: item.count > input.count
                        ? { ...item.toNetwork(), count: item.count - input.count }
                        : { network_id: 0 }
                })

                // Optimistic update
                if (item.count <= input.count) {
                    bot.inventory.clearSlot(slot)
                } else {
                    item.count -= input.count
                }
            }

            // Receive output item
            const destSlot = bot.inventory.findEmptySlot()
            if (destSlot === -1) throw new Error('No empty slot for crafting output')

            actions.push({
                source_type: 'creative', // crafting output source
                window_id: craftingTable ? craftingTable.id : 0,
                source_flags: 0,
                slot: destSlot,
                old_item: { network_id: 0 },
                new_item: {
                    network_id: recipe.outputId,
                    count: recipe.outputCount,
                    metadata: recipe.outputMeta || 0
                }
            })

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 'normal',
                    transactions: actions
                }
            })

            // Optimistic: set the output
            const outputItem = new Item(recipe.outputId, recipe.outputCount, recipe.outputMeta || 0)
            bot.inventory.setSlot(destSlot, outputItem)
        }

        bot.emit('craftingComplete', recipe, count)
    }
}

// ---- Internal helpers ----

function _parseRecipe(raw) {
    if (!raw) return null

    const recipe = {
        type: raw.type || 'unknown',
        id: raw.recipe_id || raw.uuid || null,
        inputs: [],
        outputId: 0,
        outputCount: 1,
        outputMeta: 0,
        outputName: ''
    }

    // Parse output
    const output = raw.output || (raw.result ? raw.result[0] : null)
    if (output) {
        recipe.outputId = output.network_id || output.id || 0
        recipe.outputCount = output.count || 1
        recipe.outputMeta = output.metadata || output.damage || 0
        recipe.outputName = output.name || ''
    }

    if (recipe.outputId === 0) return null

    // Parse inputs
    const inputs = raw.input || raw.ingredients || []
    for (const inp of inputs) {
        if (!inp) { recipe.inputs.push(null); continue }
        recipe.inputs.push({
            id: inp.network_id || inp.id || 0,
            count: inp.count || 1,
            meta: inp.metadata || inp.damage || 0
        })
    }

    return recipe
}

function _hasIngredients(bot, recipe) {
    // Check if inventory has all required ingredients
    const needed = {}
    for (const input of recipe.inputs) {
        if (!input || input.id === 0) continue
        const key = `${input.id}:${input.meta || 0}`
        needed[key] = (needed[key] || 0) + input.count
    }

    for (const key in needed) {
        const [id, meta] = key.split(':').map(Number)
        const have = bot.inventory.count(id, meta)
        if (have < needed[key]) return false
    }

    return true
}

module.exports = craftingPlugin
