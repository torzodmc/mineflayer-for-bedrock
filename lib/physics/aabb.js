/**
 * Axis-Aligned Bounding Box (AABB) for collision detection.
 *
 * An AABB is defined by two corners: (minX, minY, minZ) and (maxX, maxY, maxZ).
 * Used for player/entity collision with world blocks.
 */

class AABB {
    /**
     * @param {number} minX
     * @param {number} minY
     * @param {number} minZ
     * @param {number} maxX
     * @param {number} maxY
     * @param {number} maxZ
     */
    constructor(minX, minY, minZ, maxX, maxY, maxZ) {
        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(minZ) ||
            !Number.isFinite(maxX) || !Number.isFinite(maxY) || !Number.isFinite(maxZ)) {
            throw new Error('AABB constructor requires finite numbers')
        }
        if (minX > maxX || minY > maxY || minZ > maxZ) {
            throw new Error('AABB min must be less than max')
        }
        this.minX = minX
        this.minY = minY
        this.minZ = minZ
        this.maxX = maxX
        this.maxY = maxY
        this.maxZ = maxZ
    }

    /**
     * Create a deep copy of this AABB.
     * @returns {AABB}
     */
    clone() {
        return new AABB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ)
    }

    /**
     * Return a new AABB offset by (dx, dy, dz).
     * @param {number} dx
     * @param {number} dy
     * @param {number} dz
     * @returns {AABB}
     */
    offset(dx, dy, dz) {
        return new AABB(
            this.minX + dx, this.minY + dy, this.minZ + dz,
            this.maxX + dx, this.maxY + dy, this.maxZ + dz
        )
    }

    /**
     * Return a new AABB expanded by (dx, dy, dz) in each direction.
     * @param {number} dx
     * @param {number} dy
     * @param {number} dz
     * @returns {AABB}
     */
    expand(dx, dy, dz) {
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) {
            throw new Error('expand requires finite numbers')
        }
        const newMinX = this.minX - dx
        const newMinY = this.minY - dy
        const newMinZ = this.minZ - dz
        const newMaxX = this.maxX + dx
        const newMaxY = this.maxY + dy
        const newMaxZ = this.maxZ + dz
        if (newMinX > newMaxX || newMinY > newMaxY || newMinZ > newMaxZ) {
            throw new Error('expand would create invalid AABB with negative dimensions')
        }
        return new AABB(newMinX, newMinY, newMinZ, newMaxX, newMaxY, newMaxZ)
    }

    /**
     * Check if this AABB intersects another AABB.
     * @param {AABB} other
     * @returns {boolean}
     */
    intersects(other) {
        if (!other) return false
        return (
            this.maxX > other.minX && this.minX < other.maxX &&
            this.maxY > other.minY && this.minY < other.maxY &&
            this.maxZ > other.minZ && this.minZ < other.maxZ
        )
    }

    /**
     * Compute how much to push this AABB on the Y axis to resolve collision with `other`.
     * Returns the adjusted dy offset.
     * @param {AABB} other
     * @param {number} dy - Proposed Y movement
     * @returns {number} Resolved dy
     */
    computeOffsetY(other, dy) {
        if (!other) return dy
        if (this.maxX <= other.minX || this.minX >= other.maxX) return dy
        if (this.maxZ <= other.minZ || this.minZ >= other.maxZ) return dy

        if (dy > 0 && this.maxY <= other.minY) {
            const gap = other.minY - this.maxY
            if (gap < dy) dy = gap
        }
        if (dy < 0 && this.minY >= other.maxY) {
            const gap = other.maxY - this.minY
            if (gap > dy) dy = gap
        }
        return dy
    }

    /**
     * Compute how much to push this AABB on the X axis to resolve collision with `other`.
     * @param {AABB} other
     * @param {number} dx - Proposed X movement
     * @returns {number} Resolved dx
     */
    computeOffsetX(other, dx) {
        if (!other) return dx
        if (this.maxY <= other.minY || this.minY >= other.maxY) return dx
        if (this.maxZ <= other.minZ || this.minZ >= other.maxZ) return dx

        if (dx > 0 && this.maxX <= other.minX) {
            const gap = other.minX - this.maxX
            if (gap < dx) dx = gap
        }
        if (dx < 0 && this.minX >= other.maxX) {
            const gap = other.maxX - this.minX
            if (gap > dx) dx = gap
        }
        return dx
    }

    /**
     * Compute how much to push this AABB on the Z axis to resolve collision with `other`.
     * @param {AABB} other
     * @param {number} dz - Proposed Z movement
     * @returns {number} Resolved dz
     */
    computeOffsetZ(other, dz) {
        if (!other) return dz
        if (this.maxX <= other.minX || this.minX >= other.maxX) return dz
        if (this.maxY <= other.minY || this.minY >= other.maxY) return dz

        if (dz > 0 && this.maxZ <= other.minZ) {
            const gap = other.minZ - this.maxZ
            if (gap < dz) dz = gap
        }
        if (dz < 0 && this.minZ >= other.maxZ) {
            const gap = other.maxZ - this.minZ
            if (gap > dz) dz = gap
        }
        return dz
    }

    /**
     * Merge this AABB with another (union).
     * @param {AABB} other
     * @returns {AABB}
     */
    union(other) {
        if (!other) return this.clone()
        return new AABB(
            Math.min(this.minX, other.minX),
            Math.min(this.minY, other.minY),
            Math.min(this.minZ, other.minZ),
            Math.max(this.maxX, other.maxX),
            Math.max(this.maxY, other.maxY),
            Math.max(this.maxZ, other.maxZ)
        )
    }

    /**
     * Create an AABB for a full block at the given position.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {AABB}
     */
    static fromBlock(x, y, z) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            throw new Error('fromBlock requires finite numbers')
        }
        return new AABB(x, y, z, x + 1, y + 1, z + 1)
    }

    /**
     * Create an AABB for a player entity at a position (feet position).
     * @param {object} pos - { x, y, z }
     * @param {number} width - Player width (default 0.6)
     * @param {number} height - Player height (default 1.8)
     * @returns {AABB}
     */
    static fromPlayer(pos, width = 0.6, height = 1.8) {
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
            throw new Error('fromPlayer requires a valid position with finite coordinates')
        }
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
            throw new Error('fromPlayer requires finite width and height')
        }
        const hw = width / 2
        return new AABB(
            pos.x - hw, pos.y, pos.z - hw,
            pos.x + hw, pos.y + height, pos.z + hw
        )
    }
}

module.exports = AABB
