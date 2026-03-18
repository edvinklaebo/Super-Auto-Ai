import { Events } from './EventBus.js';

/**
 * Hard cap on the number of turns per battle.
 * If both teams still have survivors after this many turns the battle
 * ends with winner = null (treated as a timeout draw by the app layer).
 * 100 turns is generous enough for any realistic team composition while
 * guarding against degenerate cases such as two immortal units.
 */
const MAX_TURNS = 100;

/**
 * Core battle simulation engine.
 *
 * Responsibilities
 * ────────────────
 * • Orchestrate the battle loop (turn → attack → damage → death)
 * • Emit battle events so abilities can react
 * • Collect per-turn snapshots for replay / step-through rendering
 *
 * Non-responsibilities (intentional)
 * ───────────────────────────────────
 * • No rendering or DOM access
 * • No knowledge of specific ability logic
 * • No global state – all state lives in the BattleState argument
 */
export class BattleSystem {
  /**
   * @param {import('./EventBus.js').EventBus} eventBus
   */
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────

  /**
   * Run a complete battle from start to finish.
   * Mutates `battleState` in place and returns it.
   *
   * Determinism guarantee: given the same initial teams and the same
   * RNG seed, this method always produces an identical sequence of
   * events, damage, and log entries.
   *
   * @param {import('./BattleState.js').BattleState} battleState
   * @returns {import('./BattleState.js').BattleState}
   */
  run(battleState) {
    const state = battleState;

    // Capture all units before the loop so we can unregister abilities
    // even after dead units have been flagged isDead.
    const allUnits = state.teams.flat();

    this._registerAbilities(allUnits, state);

    this.eventBus.emit(Events.BATTLE_START, { state });
    state.log.push('⚔️  Battle begins!');

    let turn = 0;
    while (!this._isBattleOver(state) && turn < MAX_TURNS) {
      state.turn = turn;
      state.log.push(`--- Turn ${turn + 1} ---`);

      this.eventBus.emit(Events.TURN_START, { state, turn });

      this._processTurn(state);

      // Snapshot BEFORE advancing turn counter so snapshot.turn matches the log
      state.snapshots.push(this._captureSnapshot(state, turn));

      this.eventBus.emit(Events.TURN_END, { state, turn });
      turn++;
    }

    state.winner = this._determineWinner(state);

    const winMsg =
      state.winner === 0      ? '🏆 Team A wins!'
      : state.winner === 1    ? '🏆 Team B wins!'
      : state.winner === 'draw' ? '🤝 Draw!'
      :                         '⏱️  Battle timed out (draw)!';

    state.log.push(winMsg);

    this.eventBus.emit(Events.BATTLE_END, { state });
    this._unregisterAbilities(allUnits);

    return state;
  }

  // ─────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────

  /**
   * Process a single turn: the first living unit on each side attacks
   * the first living unit on the opposite side simultaneously.
   * @param {import('./BattleState.js').BattleState} state
   */
  _processTurn(state) {
    const unitA = state.teams[0].find(u => !u.isDead);
    const unitB = state.teams[1].find(u => !u.isDead);
    if (!unitA || !unitB) return;

    this._attack(unitA, unitB, state);
    this._attack(unitB, unitA, state);
  }

  /**
   * Execute one attack: emit ATTACK (allowing abilities to modify damage),
   * then apply the resulting damage if both combatants are still alive.
   *
   * @param {import('./Unit.js').Unit} attacker
   * @param {import('./Unit.js').Unit} target
   * @param {import('./BattleState.js').BattleState} state
   */
  _attack(attacker, target, state) {
    if (attacker.isDead || target.isDead) return;

    state.log.push(`${attacker.name} attacks ${target.name}!`);

    // The payload carries a mutable `damage` field so abilities can
    // intercept and modify it before it is applied (e.g. Berserker +2).
    const payload = { attacker, target, state, damage: attacker.attack };
    this.eventBus.emit(Events.ATTACK, payload);

    // Apply modified damage (ability may have changed payload.damage)
    if (!attacker.isDead && !target.isDead) {
      this._applyDamage(target, payload.damage, attacker, state);
    }
  }

  /**
   * Reduce a unit's HP, emit DAMAGE_TAKEN, and handle death.
   *
   * @param {import('./Unit.js').Unit} unit    Unit receiving damage
   * @param {number}                   amount  Damage amount
   * @param {import('./Unit.js').Unit} source  Unit causing the damage
   * @param {import('./BattleState.js').BattleState} state
   */
  _applyDamage(unit, amount, source, state) {
    if (unit.isDead) return;

    unit.hp -= amount;
    state.log.push(`  ${unit.name} takes ${amount} damage → HP: ${unit.hp}`);

    this.eventBus.emit(Events.DAMAGE_TAKEN, { unit, amount, source, state });

    if (unit.hp <= 0 && !unit.isDead) {
      unit.isDead = true;
      state.log.push(`  💀 ${unit.name} has died!`);
      this.eventBus.emit(Events.DEATH, { unit, state });
    }
  }

  /**
   * Restore HP to a unit, capped at maxHp.
   *
   * @param {import('./Unit.js').Unit} unit
   * @param {number} amount
   * @param {import('./BattleState.js').BattleState} state
   */
  _heal(unit, amount, state) {
    if (unit.isDead) return;
    unit.hp = Math.min(unit.maxHp, unit.hp + amount);
    state.log.push(`  💚 ${unit.name} heals ${amount} → HP: ${unit.hp}`);
  }

  /**
   * @param {import('./BattleState.js').BattleState} state
   * @returns {boolean}
   */
  _isBattleOver(state) {
    return state.teams.some(team => team.every(u => u.isDead));
  }

  /**
   * @param {import('./BattleState.js').BattleState} state
   * @returns {number|string|null}
   */
  _determineWinner(state) {
    const aAlive = state.teams[0].filter(u => !u.isDead);
    const bAlive = state.teams[1].filter(u => !u.isDead);
    if (aAlive.length === 0 && bAlive.length === 0) return 'draw';
    if (aAlive.length === 0) return 1;
    if (bAlive.length === 0) return 0;
    return null; // ended by turn limit
  }

  /**
   * Capture a plain-object snapshot suitable for serialisation and
   * step-through rendering.  No live Unit or Ability objects are stored.
   *
   * @param {import('./BattleState.js').BattleState} state
   * @param {number} turn
   * @returns {Object}
   */
  _captureSnapshot(state, turn) {
    return {
      turn,
      teams: state.teams.map(team =>
        team.map(unit => ({
          id:           unit.id,
          name:         unit.name,
          hp:           unit.hp,
          maxHp:        unit.maxHp,
          attack:       unit.attack,
          teamIndex:    unit.teamIndex,
          isDead:       unit.isDead,
          abilityNames: unit.abilities.map(a => a.name),
        }))
      ),
      log: [...state.log],
    };
  }

  /**
   * Register every ability for every unit, building a context with
   * convenience helpers so abilities never need a direct reference to
   * BattleSystem internals.
   *
   * @param {import('./Unit.js').Unit[]} units
   * @param {import('./BattleState.js').BattleState} state
   */
  _registerAbilities(units, state) {
    for (const unit of units) {
      const context = {
        unit,
        state,
        dealDamage: (target, amount) =>
          this._applyDamage(target, amount, unit, state),
        heal: (target, amount) =>
          this._heal(target, amount, state),
      };
      for (const ability of unit.abilities) {
        ability.register(this.eventBus, context);
      }
    }
  }

  /**
   * Unregister every ability for every unit (including dead ones).
   * @param {import('./Unit.js').Unit[]} units
   */
  _unregisterAbilities(units) {
    for (const unit of units) {
      for (const ability of unit.abilities) {
        ability.unregister(this.eventBus);
      }
    }
  }
}
