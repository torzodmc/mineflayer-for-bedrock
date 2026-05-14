/**
 * Furnace window class for bedrockflayer.
 *
 * Extends Window with furnace-specific slot accessors
 * and fuel/progress tracking from container_set_data packets.
 *
 * Slot layout (Bedrock furnace):
 *   0 = Input
 *   1 = Fuel
 *   2 = Output
 */

const Window = require('./Window')

class Furnace extends Window {
    /**
     * @param {number} id - Window ID
     */
    constructor(id) {
        super(id, 'furnace', 'Furnace', 3)
        this.fuel = 0          // 0–1 fuel remaining
        this.progress = 0      // 0–1 smelt progress
        this.xp = 0            // stored XP
        this._fuelMax = 0
        this._fuelCurrent = 0
        this._progressMax = 200
        this._progressCurrent = 0
    }

    /** Get the input slot item. @returns {Item|null} */
    get inputItem() { return this.slots[0] || null }

    /** Get the fuel slot item. @returns {Item|null} */
    get fuelItem() { return this.slots[1] || null }

    /** Get the output slot item. @returns {Item|null} */
    get outputItem() { return this.slots[2] || null }

    /**
     * Update fuel/progress from a container_set_data packet.
     * @param {number} property - Data property ID
     * @param {number} value - Property value
     */
    updateData(property, value) {
        switch (property) {
            case 0: // SMELT_PROGRESS (0-200)
                this._progressCurrent = value
                if (this._progressMax > 0) this.progress = this._progressCurrent / this._progressMax
                break
            case 1: // REMAINING_FUEL_TIME
                this._fuelCurrent = value
                if (this._fuelMax > 0) this.fuel = this._fuelCurrent / this._fuelMax
                break
            case 2: // MAX_FUEL_TIME
                this._fuelMax = value
                if (this._fuelMax > 0) this.fuel = this._fuelCurrent / this._fuelMax
                break
            case 3: // STORED_XP
                this.xp = value
                break
            case 4: // FUEL_AUX (optional)
                this.fuelAux = value
                break
        }
    }
}

module.exports = Furnace
