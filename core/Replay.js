import { SeededRNG }    from './RNG.js';
import { Unit }         from './Unit.js';
import { BattleState }  from './BattleState.js';

/**
 * Utilities for capturing and restoring initial battle state.
 *
 * Replay works because the simulation is fully deterministic:
 *   same initial teams + same seed  →  identical battle outcome.
 *
 * Usage
 * ─────
 * // Before battle
 * const replayData = Replay.capture(teams, seed);
 *
 * // Later – run again from scratch
 * const freshState = Replay.restore(replayData, abilityRegistry);
 * new BattleSystem(new EventBus()).run(freshState);
 */
export class Replay {
  /**
   * Serialise initial teams and seed into a plain JS object that can
   * be stored (localStorage, JSON, etc.) and later used with restore().
   *
   * Must be called BEFORE any mutation (i.e. before BattleSystem.run()).
   *
   * @param {import('./Unit.js').Unit[][]} teams
   * @param {number} seed
   * @returns {Object}  Serialisable replay record
   */
  static capture(teams, seed) {
    return {
      seed,
      timestamp: Date.now(),
      teams: teams.map(team =>
        team.map(unit => ({
          id:           unit.id,
          name:         unit.name,
          hp:           unit.maxHp,   // Always the starting value
          attack:       unit.attack,
          teamIndex:    unit.teamIndex,
          abilityNames: unit.abilities.map(a => a.name),
        }))
      ),
    };
  }

  /**
   * Reconstruct a fresh BattleState from a previously captured replay record.
   *
   * @param {Object} replayData
   *   The object returned by Replay.capture().
   * @param {Object.<string, () => import('./Ability.js').Ability>} abilityRegistry
   *   Map of ability name → factory function.
   *   Every ability name present in the replay must have a matching entry.
   * @returns {import('./BattleState.js').BattleState}
   */
  static restore(replayData, abilityRegistry) {
    const rng = new SeededRNG(replayData.seed);

    const teams = replayData.teams.map(teamData =>
      teamData.map(unitData =>
        new Unit({
          id:        unitData.id,
          name:      unitData.name,
          hp:        unitData.hp,
          attack:    unitData.attack,
          teamIndex: unitData.teamIndex,
          abilities: unitData.abilityNames
            .map(name => {
              const factory = abilityRegistry[name];
              if (!factory) {
                console.warn(`[Replay] Unknown ability "${name}" – skipping`);
                return null;
              }
              return factory();
            })
            .filter(Boolean),
        })
      )
    );

    return new BattleState({ teams, rng });
  }
}
