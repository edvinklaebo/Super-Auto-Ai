/**
 * Battle event type constants.
 * Import these instead of using raw strings to avoid typos.
 */
export const Events = Object.freeze({
  BATTLE_START:  'BattleStart',
  TURN_START:    'TurnStart',
  ATTACK:        'Attack',
  DAMAGE_TAKEN:  'DamageTaken',
  DEATH:         'Death',
  TURN_END:      'TurnEnd',
  BATTLE_END:    'BattleEnd',
});

/**
 * Lightweight publish-subscribe event bus.
 *
 * - No global state: every instance is fully independent.
 * - Handlers are called synchronously in registration order.
 * - A snapshot of the handler list is taken before each emit so
 *   handlers may safely call off() without causing missed/skipped calls.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Function[]>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event type.
   * @param {string}   eventType
   * @param {Function} handler
   * @returns {this}   chainable
   */
  on(eventType, handler) {
    if (!this._listeners.has(eventType)) {
      this._listeners.set(eventType, []);
    }
    this._listeners.get(eventType).push(handler);
    return this;
  }

  /**
   * Unsubscribe a previously-registered handler.
   * @param {string}   eventType
   * @param {Function} handler
   * @returns {this}
   */
  off(eventType, handler) {
    const handlers = this._listeners.get(eventType);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
    return this;
  }

  /**
   * Emit an event, calling all registered handlers with `payload`.
   * @param {string} eventType
   * @param {*}      payload
   */
  emit(eventType, payload) {
    const handlers = this._listeners.get(eventType);
    if (!handlers || handlers.length === 0) return;
    // Snapshot before iterating so off() calls inside handlers are safe
    for (const handler of [...handlers]) {
      handler(payload);
    }
  }

  /**
   * Remove all listeners (useful for cleanup / test isolation).
   */
  clear() {
    this._listeners.clear();
  }
}
