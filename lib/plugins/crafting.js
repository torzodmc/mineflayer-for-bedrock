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
            const actions = []
            const inputChanges = []

            for (const input of recipe.inputs) {
                if (!input || input.id === 0) continue
                let remainingNeeded = input.count
                const slotsToUse = []

                for (let slot = 0; slot < bot.inventory.slots.length; slot++) {
                    const item = bot.inventory.slots[slot]
                    if (!item || item.type !== input.id || (input.meta !== undefined && item.meta !== input.meta)) continue

                    const take = Math.min(item.count, remainingNeeded)
                    slotsToUse.push({ slot, count: take })
                    remainingNeeded -= take

                    if (remainingNeeded <= 0) break
                }

                if (remainingNeeded > 0) throw new Error(`Missing ingredient: item ${input.id} (need ${input.count}, found ${input.count - remainingNeeded})`)

                for (const change of slotsToUse) {
                    const item = bot.inventory.slots[change.slot]
                    actions.push({
                        source_type: 0,
                        inventory_id: craftingTable ? craftingTable.id : 0,
                        slot: change.slot,
                        old_item: item.toNetwork(),
                        new_item: item.count > change.count
                            ? { ...item.toNetwork(), count: item.count - change.count }
                            : { network_id: 0 }
                    })
                    inputChanges.push({ slot: change.slot, count: change.count, item })
                }
            }

            const destSlot = bot.inventory.findEmptySlot()
            if (destSlot === -1) throw new Error('No empty slot for crafting output')

            actions.push({
                source_type: 99999,
                action: 0,
                slot: destSlot,
                old_item: { network_id: 0 },
                new_item: {
                    network_id: recipe.outputId,
                    count: recipe.outputCount,
                    metadata: recipe.outputMeta || 0
                }
            })

            const transactionPromise = new Promise((resolve, reject) => {
                const onInventoryTransaction = (packet) => {
                    if (packet.transaction?.request_id === 0) {
                        bot.removeListener('inventory_transaction', onInventoryTransaction)
                        if (packet.transaction.transaction_type === 0 || packet.success) {
                            resolve()
                        } else {
                            reject(new Error('Transaction failed'))
                        }
                    }
                }
                bot.on('inventory_transaction', onInventoryTransaction)

                setTimeout(() => {
                    bot.removeListener('inventory_transaction', onInventoryTransaction)
                    resolve()
                }, 1000)
            })

            bot.client.queue('inventory_transaction', {
                transaction: {
                    transaction_type: 0,
                    legacy: { legacy_request_id: 0, legacy_transactions: [] },
                    actions
                }
            })

            await transactionPromise

            for (const change of inputChanges) {
                const item = bot.inventory.slots[change.slot]
                if (!item || item.count <= change.count) {
                    bot.inventory.clearSlot(change.slot)
                } else if (item) {
                    item.count -= change.count
                }
            }

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
        type: raw.type || raw.recipe_type || 'unknown',
        pattern: raw.pattern || null,
        inputs: [],
        outputId: 0,
        outputCount: 1,
        outputMeta: 0,
        outputName: '',
        isShaped: raw.type === 'shaped' || raw.recipe_type === 'shaped' || raw.type === 0,
        isShapeless: raw.type === 'shapeless' || raw.recipe_type === 'shapeless' || raw.type === 1
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
