/**
 * The complete mutable state of an ongoing battle.
 *
 * This is the single source of truth during simulation.  The RNG instance
 * lives here so that determinism is guaranteed: the same initial teams +
 * the same seed always produce the same battle outcome.
 */
export class BattleState {
  /**
   * @param {Object}   config
   * @param {import('./Unit.js').Unit[][]} config.teams
   *   Two-element array: [ teamA[], teamB[] ].
   *   Units are NOT removed on death; they are marked isDead = true so the
   *   renderer can still display them as fallen.
   * @param {import('./RNG.js').SeededRNG} config.rng
   *   Seeded RNG for all randomness in the simulation.
   * @param {number}   [config.turn=0]    Current turn counter
   * @param {string[]} [config.log=[]]    Human-readable battle log
   */
  constructor({ teams, rng, turn = 0, log = [] }) {
    this.teams     = teams;
    this.rng       = rng;
    this.turn      = turn;
    this.log       = log;

    /**
     * Winner after battle ends.
     * 0 = Team A, 1 = Team B, 'draw' = mutual wipe-out, null = still running.
     * @type {number|string|null}
     */
    this.winner = null;

    /**
     * Lightweight snapshots captured after every turn.
     * Each entry contains enough data to re-render that moment without
     * storing live Unit/Ability objects.
     * @type {Object[]}
     */
    this.snapshots = [];
  }
}
