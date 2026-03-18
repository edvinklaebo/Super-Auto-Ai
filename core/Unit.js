/**
 * Represents a unit (fighter) in battle.
 *
 * Units are mutable during simulation (hp changes, isDead flag).
 * Abilities are attached as independent objects; no ability logic
 * lives inside Unit itself.
 */
export class Unit {
  /**
   * @param {Object}   config
   * @param {string}   config.id         Unique identifier
   * @param {string}   config.name       Display name
   * @param {number}   config.hp         Starting hit points (also used as maxHp)
   * @param {number}   config.attack     Base attack damage per strike
   * @param {number}   config.teamIndex  0 = team A, 1 = team B
   * @param {import('./Ability.js').Ability[]} [config.abilities=[]]
   */
  constructor({ id, name, hp, attack, teamIndex, abilities = [] }) {
    this.id         = id;
    this.name       = name;
    this.hp         = hp;
    this.maxHp      = hp;
    this.attack     = attack;
    this.teamIndex  = teamIndex;
    this.abilities  = abilities;
    this.isDead     = false;
  }
}
