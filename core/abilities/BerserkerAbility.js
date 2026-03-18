import { Ability } from '../Ability.js';
import { Events }  from '../EventBus.js';

/**
 * Factory – creates a fresh Berserker ability instance.
 *
 * Effect: When this unit attacks, deal +2 bonus damage on top of its
 *         normal attack value.
 *
 * Implementation note:
 *   The ATTACK event payload carries a mutable `damage` field that
 *   BattleSystem reads AFTER the event is emitted.  Incrementing it
 *   here is safe and avoids any circular damage-event loops.
 *
 * @returns {Ability}
 */
export function createBerserkerAbility() {
  return new Ability({
    name:        'Berserker',
    description: 'Deal +2 bonus damage when attacking.',
    handlers: {
      [Events.ATTACK]: (payload, ctx) => {
        // Only trigger for the unit that owns this ability
        if (payload.attacker !== ctx.unit || ctx.unit.isDead) return;

        payload.damage += 2;
        payload.state.log.push(
          `  💪 ${ctx.unit.name}'s Berserker: +2 bonus damage!`
        );
      },
    },
  });
}
