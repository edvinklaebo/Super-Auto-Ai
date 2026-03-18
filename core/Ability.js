/**
 * Base class for all unit abilities.
 *
 * Abilities are completely independent of the core battle loop.
 * They react to events emitted by BattleSystem and may modify battle
 * state through the context object provided at registration time.
 *
 * Adding a new ability requires zero changes to BattleSystem or Unit.
 *
 * @example
 * import { Ability } from './Ability.js';
 * import { Events }  from './EventBus.js';
 *
 * export function createMyAbility() {
 *   return new Ability({
 *     name: 'MyAbility',
 *     description: 'Does something cool.',
 *     handlers: {
 *       [Events.ATTACK]: (payload, ctx) => {
 *         if (payload.attacker === ctx.unit) {
 *           ctx.dealDamage(payload.target, 1);
 *         }
 *       },
 *     },
 *   });
 * }
 */
export class Ability {
  /**
   * @param {Object} config
   * @param {string} config.name         Unique ability name (used as registry key)
   * @param {string} [config.description='']
   * @param {Object.<string, function(*, AbilityContext): void>} config.handlers
   *   Map of event-type string → handler function.
   */
  constructor({ name, description = '', handlers }) {
    this.name        = name;
    this.description = description;
    /** @private */
    this._handlers      = handlers;
    /** @private – bound wrappers keyed by eventType */
    this._boundHandlers = {};
  }

  /**
   * Register all event handlers with the given EventBus, bound to `context`.
   * Must be called once per battle (before BattleStart).
   *
   * @param {import('./EventBus.js').EventBus} eventBus
   * @param {AbilityContext} context
   */
  register(eventBus, context) {
    for (const [eventType, handler] of Object.entries(this._handlers)) {
      const bound = (payload) => handler(payload, context);
      this._boundHandlers[eventType] = bound;
      eventBus.on(eventType, bound);
    }
  }

  /**
   * Unregister all event handlers from the EventBus.
   * Must be called after the battle ends to avoid memory leaks.
   *
   * @param {import('./EventBus.js').EventBus} eventBus
   */
  unregister(eventBus) {
    for (const [eventType, bound] of Object.entries(this._boundHandlers)) {
      eventBus.off(eventType, bound);
    }
    this._boundHandlers = {};
  }

  /**
   * Return a fresh copy of this ability (required for replay / reset).
   * @returns {Ability}
   */
  clone() {
    return new Ability({
      name:        this.name,
      description: this.description,
      handlers:    { ...this._handlers },
    });
  }
}

/**
 * Context object passed to every ability handler at registration time.
 * Abilities use this to interact with the battle without tight coupling.
 *
 * @typedef {Object} AbilityContext
 * @property {import('./Unit.js').Unit}              unit       The unit that owns this ability
 * @property {import('./BattleState.js').BattleState} state      Live battle state (mutable reference)
 * @property {(target: import('./Unit.js').Unit, amount: number) => void} dealDamage
 *   Deal ability damage from the owning unit to a target
 * @property {(target: import('./Unit.js').Unit, amount: number) => void} heal
 *   Heal a target unit
 */
