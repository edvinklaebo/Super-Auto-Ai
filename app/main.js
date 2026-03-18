/**
 * app/main.js – Application entry point.
 *
 * Responsibilities
 * ─────────────────
 * • Create teams (data-driven unit configs)
 * • Wire together: RNG → BattleState → BattleSystem → CanvasRenderer
 * • Provide UI controls: Run Battle, Step Back/Forward, Replay
 *
 * No game logic lives here.
 */

import { SeededRNG }               from '../core/RNG.js';
import { EventBus }                from '../core/EventBus.js';
import { Unit }                    from '../core/Unit.js';
import { BattleState }             from '../core/BattleState.js';
import { BattleSystem }            from '../core/BattleSystem.js';
import { Replay }                  from '../core/Replay.js';
import { createBerserkerAbility }  from '../core/abilities/BerserkerAbility.js';
import { CanvasRenderer }          from '../rendering/CanvasRenderer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SEED = 42;

/**
 * Registry maps ability name → factory function.
 * Required by Replay.restore() to re-create fresh ability instances.
 */
const abilityRegistry = {
  Berserker: createBerserkerAbility,
};

/**
 * Pure factory: returns two fresh teams each call.
 * Data-driven – add/remove units or abilities here.
 * @returns {import('../core/Unit.js').Unit[][]}
 */
function createTeams() {
  return [
    // ── Team A ────────────────────────────────────────────────────
    [
      new Unit({
        id:        'a1',
        name:      'Wolf',
        hp:        10,
        attack:    3,
        teamIndex: 0,
        abilities: [createBerserkerAbility()],
      }),
      new Unit({
        id:        'a2',
        name:      'Bear',
        hp:        14,
        attack:    4,
        teamIndex: 0,
        abilities: [],
      }),
    ],
    // ── Team B ────────────────────────────────────────────────────
    [
      new Unit({
        id:        'b1',
        name:      'Dragon',
        hp:        12,
        attack:    4,
        teamIndex: 1,
        abilities: [],
      }),
      new Unit({
        id:        'b2',
        name:      'Goblin',
        hp:        6,
        attack:    2,
        teamIndex: 1,
        abilities: [createBerserkerAbility()],
      }),
    ],
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a complete simulation and return the final state + replay record.
 * @param {number} seed
 * @returns {{ battleState: BattleState, replayData: Object }}
 */
function runSimulation(seed) {
  const teams       = createTeams();
  const replayData  = Replay.capture(teams, seed);   // capture BEFORE mutation
  const rng         = new SeededRNG(seed);
  const eventBus    = new EventBus();
  const battleState = new BattleState({ teams, rng });
  const battleSystem = new BattleSystem(eventBus);

  battleSystem.run(battleState);
  return { battleState, replayData };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI state
// ─────────────────────────────────────────────────────────────────────────────

const canvas   = document.getElementById('battleCanvas');
const renderer = new CanvasRenderer(canvas);

let currentState         = null;
let currentSnapshotIndex = -1;   // -1 = show post-battle state
let lastReplayData       = null;

// ─────────────────────────────────────────────────────────────────────────────
// Rendering helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Display either the live post-battle state or a historical snapshot.
 */
function showCurrent() {
  if (!currentState) return;

  if (currentSnapshotIndex === -1) {
    // Show final post-battle state
    renderer.render(currentState);
    return;
  }

  const snap = currentState.snapshots[currentSnapshotIndex];
  if (!snap) {
    renderer.render(currentState);
    return;
  }

  // Snapshots hold plain data (no live Unit objects), so pass them directly.
  // winner is only shown on the final snapshot or the post-battle state.
  const isLastSnap = currentSnapshotIndex === currentState.snapshots.length - 1;
  renderer.render({
    teams:  snap.teams,
    log:    snap.log,
    turn:   snap.turn,
    winner: isLastSnap ? currentState.winner : null,
  });
}

function updateLog(log, statusMsg = '') {
  const logDiv = document.getElementById('log');
  const status = statusMsg
    ? `<div class="status ${statusMsg.startsWith('✅') ? 'ok' : 'err'}">${statusMsg}</div>`
    : '';
  logDiv.innerHTML = status + log.map(e => `<div>${e}</div>`).join('');
  logDiv.scrollTop = logDiv.scrollHeight;
}

function updateStepInfo() {
  const el = document.getElementById('stepInfo');
  if (!el || !currentState) return;
  const total = currentState.snapshots.length;
  const label = currentSnapshotIndex === -1
    ? `Final state`
    : `Turn ${currentSnapshotIndex + 1} / ${total}`;
  el.textContent = label;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('runBattle').addEventListener('click', () => {
  const { battleState, replayData } = runSimulation(DEFAULT_SEED);
  currentState         = battleState;
  currentSnapshotIndex = -1;
  lastReplayData       = replayData;

  showCurrent();
  updateLog(battleState.log);
  updateStepInfo();
});

document.getElementById('stepBack').addEventListener('click', () => {
  if (!currentState) return;
  if (currentSnapshotIndex === -1) {
    // Move from final state to last snapshot
    currentSnapshotIndex = currentState.snapshots.length - 1;
  } else {
    currentSnapshotIndex = Math.max(0, currentSnapshotIndex - 1);
  }
  showCurrent();
  updateStepInfo();
});

document.getElementById('stepForward').addEventListener('click', () => {
  if (!currentState) return;
  if (currentSnapshotIndex === -1) return; // already at final
  currentSnapshotIndex++;
  if (currentSnapshotIndex >= currentState.snapshots.length) {
    currentSnapshotIndex = -1; // wrap to final state
  }
  showCurrent();
  updateStepInfo();
});

document.getElementById('replayBattle').addEventListener('click', () => {
  if (!lastReplayData) {
    alert('Run a battle first!');
    return;
  }

  const freshState  = Replay.restore(lastReplayData, abilityRegistry);
  const eventBus    = new EventBus();
  const battleSystem = new BattleSystem(eventBus);
  battleSystem.run(freshState);

  // Determinism check: compare logs
  const match = JSON.stringify(freshState.log) === JSON.stringify(currentState.log);
  const msg   = match
    ? '✅ Replay matches original – simulation is deterministic!'
    : '❌ Replay differs from original – something is non-deterministic!';

  // Show the replayed state
  currentState         = freshState;
  currentSnapshotIndex = -1;

  showCurrent();
  updateLog(freshState.log, msg);
  updateStepInfo();
});

// ─────────────────────────────────────────────────────────────────────────────
// Auto-run on load
// ─────────────────────────────────────────────────────────────────────────────

const { battleState: initialState, replayData: initialReplay } =
  runSimulation(DEFAULT_SEED);

currentState   = initialState;
lastReplayData = initialReplay;

showCurrent();
updateLog(initialState.log);
updateStepInfo();
