/**
 * IRng interface (documented via JSDoc)
 * @typedef {Object} IRng
 * @property {() => number} next      – float in [0, 1)
 * @property {(min: number, max: number) => number} nextInt – integer in [min, max]
 * @property {(array: any[]) => any} pick – random element from an array
 */

/**
 * Seeded pseudo-random number generator using the Mulberry32 algorithm.
 * Same seed always produces the same sequence (fully deterministic).
 * Never uses Math.random – all randomness flows through this class.
 */
export class SeededRNG {
  /**
   * @param {number} seed  Integer seed value (treated as unsigned 32-bit int)
   */
  constructor(seed) {
    this._seed = seed >>> 0;
  }

  /**
   * Returns the next pseudo-random float in [0, 1).
   * Advances internal state.
   * @returns {number}
   */
  next() {
    // Mulberry32 – fast, high-quality 32-bit PRNG
    let t = (this._seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a pseudo-random integer in [min, max] (inclusive).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Returns a pseudo-random element from an array.
   * @param {any[]} array
   * @returns {any}
   */
  pick(array) {
    if (array.length === 0) throw new Error('Cannot pick from an empty array');
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Returns the current internal seed state for serialisation.
   * @returns {number}
   */
  getState() {
    return this._seed;
  }
}
