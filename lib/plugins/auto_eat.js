/**
 * Auto-Eat Plugin for bedrockflayer.
 *
 * Automatically consumes food from inventory when hunger drops below a threshold.
 *
 * Usage:
 *   bot.loadPlugin(require('./plugins/auto_eat'))
 *   bot.autoEat.enable()
 *   bot.autoEat.disable()
 *   bot.autoEat.options.priority = 'saturation' // or 'foodPoints'
 *
 * Events:
 *   'autoEat_started' — eating started
 *   'autoEat_finished' — eating completed
 *   'autoEat_error' — no food or eat failed
 */

// Foods sorted by saturation restoration (best first)
const FOODS = {
    golden_apple: { food: 4, saturation: 9.6 },
    enchanted_golden_apple: { food: 4, saturation: 9.6 },
    cooked_beef: { food: 8, saturation: 12.8 },
    steak: { food: 8, saturation: 12.8 },
    cooked_porkchop: { food: 8, saturation: 12.8 },
    cooked_mutton: { food: 6, saturation: 9.6 },
    cooked_salmon: { food: 6, saturation: 9.6 },
    cooked_rabbit: { food: 5, saturation: 6 },
    cooked_cod: { food: 5, saturation: 6 },
    cooked_chicken: { food: 6, saturation: 7.2 },
    bread: { food: 5, saturation: 6 },
    baked_potato: { food: 5, saturation: 6 },
    mushroom_stew: { food: 6, saturation: 7.2 },
    beetroot_soup: { food: 6, saturation: 7.2 },
    rabbit_stew: { food: 10, saturation: 12 },
    pumpkin_pie: { food: 8, saturation: 4.8 },
    golden_carrot: { food: 6, saturation: 14.4 },
    apple: { food: 4, saturation: 2.4 },
    carrot: { food: 3, saturation: 3.6 },
    potato: { food: 1, saturation: 0.6 },
    beetroot: { food: 1, saturation: 1.2 },
    melon_slice: { food: 2, saturation: 1.2 },
    sweet_berries: { food: 2, saturation: 0.4 },
    glow_berries: { food: 2, saturation: 0.4 },
    dried_kelp: { food: 1, saturation: 0.6 },
    cookie: { food: 2, saturation: 0.4 },
    raw_beef: { food: 3, saturation: 1.8 },
    raw_porkchop: { food: 3, saturation: 1.8 },
    raw_chicken: { food: 2, saturation: 1.2 },
    raw_mutton: { food: 2, saturation: 1.2 },
    raw_rabbit: { food: 3, saturation: 1.8 },
    raw_cod: { food: 2, saturation: 0.4 },
    raw_salmon: { food: 2, saturation: 0.4 },
}

function autoEatPlugin(bot) {
    bot.autoEat = {
        enabled: false,
        eating: false,
        options: {
            priority: 'saturation',   // 'saturation' | 'foodPoints'
            startAt: 14,              // Start eating when hunger <= this
            bannedFood: [],           // Food names to never eat
            cooldown: 3000,           // ms between eat attempts
        },
        _lastEat: 0,

        enable() {
            bot.autoEat.enabled = true
        },

        disable() {
            bot.autoEat.enabled = false
        },

        /**
         * Manually trigger eating the best available food.
         * @returns {Promise<boolean>} true if ate successfully
         */
        async eat() {
            return _tryEat(bot)
        }
    }

    // Monitor hunger
    bot.on('health', () => {
        if (!bot.autoEat.enabled) return
        if (bot.autoEat.eating) return
        if (bot.food > bot.autoEat.options.startAt) return

        const now = Date.now()
        if (now - bot.autoEat._lastEat < bot.autoEat.options.cooldown) return

        _tryEat(bot)
    })
}

async function _tryEat(bot) {
    if (bot.autoEat.eating) return false
    bot.autoEat.eating = true

    try {
        // Find best food in inventory
        const food = _findBestFood(bot)
        if (!food) {
            bot.emit('autoEat_error', new Error('No food in inventory'))
            bot.autoEat.eating = false
            return false
        }

        bot.emit('autoEat_started', food.item)

        // Equip the food to hotbar and use it
        if (bot.equip) {
            await bot.equip(food.item, 'hand')
        }

        // Send use item (eating)
        bot.client.queue('inventory_transaction', {
            transaction: {
                transaction_type: 'item_use',
                transaction_data: {
                    action_type: 'click_air',
                    block_position: { x: 0, y: 0, z: 0 },
                    face: 0,
                    hotbar_slot: bot.quickBarSlot || 0,
                    held_item: food.item.toNetwork ? food.item.toNetwork() : { network_id: 0 },
                    player_position: bot.entity ? {
                        x: bot.entity.position.x,
                        y: bot.entity.position.y,
                        z: bot.entity.position.z
                    } : { x: 0, y: 0, z: 0 },
                    click_position: { x: 0, y: 0, z: 0 },
                    block_runtime_id: 0
                }
            }
        })

        // Wait for eat duration (~1.6 seconds)
        await new Promise(resolve => setTimeout(resolve, 1700))

        bot.autoEat._lastEat = Date.now()
        bot.autoEat.eating = false
        bot.emit('autoEat_finished', food.item)
        return true
    } catch (e) {
        bot.autoEat.eating = false
        bot.emit('autoEat_error', e)
        return false
    }
}

function _findBestFood(bot) {
    if (!bot.inventory) return null

    const banned = bot.autoEat.options.bannedFood || []
    const priority = bot.autoEat.options.priority || 'saturation'
    const candidates = []

    for (let i = 0; i < bot.inventory.slots.length; i++) {
        const item = bot.inventory.slots[i]
        if (!item) continue

        const name = item.name
        const foodInfo = FOODS[name]
        if (!foodInfo) continue
        if (banned.includes(name)) continue

        candidates.push({
            slot: i,
            item: item,
            name: name,
            food: foodInfo.food,
            saturation: foodInfo.saturation
        })
    }

    if (candidates.length === 0) return null

    // Sort by priority
    if (priority === 'saturation') {
        candidates.sort((a, b) => b.saturation - a.saturation)
    } else {
        candidates.sort((a, b) => b.food - a.food)
    }

    return candidates[0]
}

module.exports = autoEatPlugin
