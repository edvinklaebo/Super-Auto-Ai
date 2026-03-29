/**
 * Poison Simulator – Path of Exile
 * Core simulation engine + canvas rendering
 */

// ── Types ─────────────────────────────────────────────────────────────────────
/**
 * @typedef {{ dps: number; remaining: number; }} PoisonInstance
 *
 * @typedef {{
 *   poisons: PoisonInstance[];
 *   time: number;
 *   hitAccumulator: number;
 *   totalHits: number;
 *   // config
 *   hitDamage: number;
 *   attackRate: number;
 *   poisonChance: number;
 *   poisonDuration: number;
 *   poisonScaling: number;
 * }} SimState
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const DT = 1 / 60;                // fixed timestep (seconds)
const HISTORY_SECONDS = 12;       // rolling buffer length
const HISTORY_FRAMES  = Math.round(HISTORY_SECONDS / DT);

// ── Simulation ────────────────────────────────────────────────────────────────

/**
 * Create a fresh simulation state.
 * @param {Partial<SimState>} [config]
 * @returns {SimState}
 */
function createState(config = {}) {
  return {
    poisons: [],
    time: 0,
    hitAccumulator: 0,
    totalHits: 0,
    // defaults match PoE feel
    hitDamage:    500,
    attackRate:   3.5,
    poisonChance: 1.0,
    poisonDuration: 2.0,
    poisonScaling:  0.30,
    ...config,
  };
}

/**
 * Attempt to apply a poison stack on a hit.
 * @param {SimState} state
 */
function tryApplyPoison(state) {
  if (Math.random() > state.poisonChance) return;
  const dps = state.hitDamage * state.poisonScaling;
  state.poisons.push({ dps, remaining: state.poisonDuration });
  state.totalHits++;
}

/**
 * Advance simulation by one fixed timestep.
 * Uses fractional hit accumulation for consistent attack-rate handling.
 * @param {SimState} state
 * @returns {{ totalDps: number; stackCount: number }}
 */
function update(state) {
  state.time += DT;

  // ── Fractional hit accumulation ──────────────────────────────────────────
  // Accumulate partial hits instead of flooring each frame, so fractional
  // attack rates (e.g. 3.5 APS) produce the correct long-run hit count.
  state.hitAccumulator += state.attackRate * DT;
  const wholeHits = Math.floor(state.hitAccumulator);
  state.hitAccumulator -= wholeHits;

  for (let i = 0; i < wholeHits; i++) {
    tryApplyPoison(state);
  }

  // ── Tick poisons ─────────────────────────────────────────────────────────
  let totalDps = 0;
  for (let i = state.poisons.length - 1; i >= 0; i--) {
    const p = state.poisons[i];
    p.remaining -= DT;
    if (p.remaining <= 0) {
      state.poisons.splice(i, 1);
    } else {
      totalDps += p.dps;
    }
  }

  return { totalDps, stackCount: state.poisons.length };
}

// ── Rolling history buffer ────────────────────────────────────────────────────

/**
 * @typedef {{ dps: number[]; stacks: number[]; head: number; length: number; }} HistoryBuffer
 */

/** @returns {HistoryBuffer} */
function createHistory() {
  return {
    dps:    new Float64Array(HISTORY_FRAMES),
    stacks: new Uint32Array(HISTORY_FRAMES),
    head:   0,
    length: 0,
  };
}

/**
 * Push a new sample into the ring-buffer.
 * @param {HistoryBuffer} h
 * @param {number} dps
 * @param {number} stacks
 */
function pushHistory(h, dps, stacks) {
  h.dps[h.head]    = dps;
  h.stacks[h.head] = stacks;
  h.head = (h.head + 1) % HISTORY_FRAMES;
  if (h.length < HISTORY_FRAMES) h.length++;
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

const CANVAS_H = 180;

/**
 * Resize a canvas to match its CSS pixel size × devicePixelRatio.
 * @param {HTMLCanvasElement} canvas
 */
function resizeCanvas(canvas) {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width  * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }
}

// Color constants (CSS vars resolved once for canvas use)
const C_BG        = '#0a0a0a';
const C_GRID      = 'rgba(255,255,255,0.04)';
const C_DPS       = '#6abf3e';
const C_DPS_FILL  = 'rgba(106,191,62,0.18)';
const C_STACK     = '#e8a020';
const C_STACK_FILL= 'rgba(232,160,32,0.15)';
const C_TEXT      = 'rgba(212,197,169,0.55)';

/**
 * Draw the DPS + stack-count graph into a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {HistoryBuffer} h
 * @param {number} simTime  current simulation time (seconds)
 */
function drawGraph(canvas, h, simTime) {
  resizeCanvas(canvas);
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, W, H);

  if (h.length < 2) return;

  // ── Determine max values for y-scaling ──────────────────────────────────
  let maxDps    = 0;
  let maxStacks = 0;
  for (let i = 0; i < h.length; i++) {
    if (h.dps[i]    > maxDps)    maxDps    = h.dps[i];
    if (h.stacks[i] > maxStacks) maxStacks = h.stacks[i];
  }
  if (maxDps    === 0) maxDps    = 1;
  if (maxStacks === 0) maxStacks = 1;

  const pad = { top: 18 * dpr, right: 14 * dpr, bottom: 28 * dpr, left: 52 * dpr };
  const gW = W - pad.left - pad.right;
  const gH = H - pad.top  - pad.bottom;

  // ── Grid lines ───────────────────────────────────────────────────────────
  ctx.strokeStyle = C_GRID;
  ctx.lineWidth   = 1;
  const yDivs = 4;
  for (let i = 0; i <= yDivs; i++) {
    const y = pad.top + (gH * i) / yDivs;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + gW, y);
    ctx.stroke();
  }

  // ── Y-axis labels (DPS) ──────────────────────────────────────────────────
  ctx.fillStyle = C_TEXT;
  ctx.font = `${10 * dpr}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'right';
  for (let i = 0; i <= yDivs; i++) {
    const v = maxDps * (1 - i / yDivs);
    const y = pad.top + (gH * i) / yDivs + 3 * dpr;
    ctx.fillText(formatNumber(v), pad.left - 4 * dpr, y);
  }

  // ── X-axis time labels ───────────────────────────────────────────────────
  ctx.textAlign = 'center';
  const timeSpan = HISTORY_SECONDS;
  const xDivs = 6;
  for (let i = 0; i <= xDivs; i++) {
    const t = simTime - timeSpan + (timeSpan * i) / xDivs;
    if (t < 0) continue;
    const x = pad.left + (gW * i) / xDivs;
    ctx.fillText(t.toFixed(1) + 's', x, H - pad.bottom + 14 * dpr);
  }

  // ── Helper: map ring-buffer index → canvas X ────────────────────────────
  // Oldest sample is leftmost, newest is rightmost
  function sampleX(sampleIdx) {
    // sampleIdx 0 = oldest in current window
    return pad.left + (sampleIdx / (h.length - 1)) * gW;
  }

  // Flatten ring-buffer in order (oldest → newest)
  const count   = h.length;
  const oldest  = (h.head - count + HISTORY_FRAMES) % HISTORY_FRAMES;

  // ── DPS filled area ──────────────────────────────────────────────────────
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const ri  = (oldest + i) % HISTORY_FRAMES;
    const x   = sampleX(i);
    const y   = pad.top + gH * (1 - h.dps[ri] / maxDps);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  // Close path down to baseline
  ctx.lineTo(sampleX(count - 1), pad.top + gH);
  ctx.lineTo(sampleX(0),         pad.top + gH);
  ctx.closePath();
  ctx.fillStyle = C_DPS_FILL;
  ctx.fill();

  // DPS line
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const ri = (oldest + i) % HISTORY_FRAMES;
    const x  = sampleX(i);
    const y  = pad.top + gH * (1 - h.dps[ri] / maxDps);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = C_DPS;
  ctx.lineWidth   = 1.5 * dpr;
  ctx.stroke();

  // ── Stack count (secondary y-axis, dashed) ───────────────────────────────
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const ri = (oldest + i) % HISTORY_FRAMES;
    const x  = sampleX(i);
    const y  = pad.top + gH * (1 - h.stacks[ri] / maxStacks);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = C_STACK;
  ctx.lineWidth   = 1.5 * dpr;
  ctx.setLineDash([4 * dpr, 3 * dpr]);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Legend ───────────────────────────────────────────────────────────────
  const lx = pad.left + 8 * dpr;
  const ly = pad.top + 10 * dpr;
  const ls = 8 * dpr;

  // DPS legend dot
  ctx.fillStyle = C_DPS;
  ctx.fillRect(lx, ly - ls * 0.75, ls, ls * 0.6);
  ctx.fillStyle = 'rgba(212,197,169,0.75)';
  ctx.font = `${9 * dpr}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('DPS', lx + ls + 3 * dpr, ly);

  // Stack legend
  ctx.strokeStyle = C_STACK;
  ctx.lineWidth = 1.5 * dpr;
  ctx.setLineDash([4 * dpr, 3 * dpr]);
  ctx.beginPath();
  ctx.moveTo(lx + 55 * dpr, ly - ls * 0.4);
  ctx.lineTo(lx + 55 * dpr + ls, ly - ls * 0.4);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(212,197,169,0.75)';
  ctx.fillText('Stacks', lx + 55 * dpr + ls + 3 * dpr, ly);
}

// ── Number formatting ─────────────────────────────────────────────────────────
/** @param {number} n */
function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return n.toFixed(0);
}

// ── App ───────────────────────────────────────────────────────────────────────
(function main() {

  /** @type {SimState} */
  let state   = createState();
  /** @type {HistoryBuffer} */
  let history = createHistory();

  let running  = false;
  let rafId    = null;

  // Current display values
  let lastDps     = 0;
  let lastStacks  = 0;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const canvas    = /** @type {HTMLCanvasElement} */ (document.getElementById('mainCanvas'));
  const btnRun    = document.getElementById('btnRun');
  const btnReset  = document.getElementById('btnReset');

  const elDps     = document.getElementById('statDps');
  const elStacks  = document.getElementById('statStacks');
  const elTime    = document.getElementById('statTime');
  const elHits    = document.getElementById('statHits');

  // ── Sliders ────────────────────────────────────────────────────────────────
  const sliders = [
    { id: 'sDamage',   key: 'hitDamage',      fmt: v => Math.round(v).toString() },
    { id: 'sRate',     key: 'attackRate',      fmt: v => v.toFixed(2) + ' APS' },
    { id: 'sChance',   key: 'poisonChance',    fmt: v => Math.round(v * 100) + '%' },
    { id: 'sDuration', key: 'poisonDuration',  fmt: v => v.toFixed(1) + 's' },
    { id: 'sScaling',  key: 'poisonScaling',   fmt: v => (v * 100).toFixed(0) + '%' },
  ];

  sliders.forEach(({ id, key, fmt }) => {
    const input = /** @type {HTMLInputElement} */ (document.getElementById(id));
    const display = document.getElementById(id + 'Val');
    if (!input || !display) return;

    // init display from state default
    display.textContent = fmt(state[key]);

    input.addEventListener('input', () => {
      const raw = parseFloat(input.value);
      state[key] = raw;
      display.textContent = fmt(raw);
    });
  });

  // ── Tooltip on canvas hover ────────────────────────────────────────────────
  const tooltip = document.getElementById('tooltip');
  canvas.addEventListener('mousemove', (e) => {
    if (!tooltip) return;
    const rect = canvas.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;

    // Map to history index
    const idx = Math.round(relX * (history.length - 1));
    if (idx < 0 || idx >= history.length) {
      tooltip.style.display = 'none';
      return;
    }
    const oldest = (history.head - history.length + HISTORY_FRAMES) % HISTORY_FRAMES;
    const ri = (oldest + idx) % HISTORY_FRAMES;
    const dps = history.dps[ri];
    const stacks = history.stacks[ri];

    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top  = (e.clientY - 10) + 'px';
    tooltip.innerHTML  = `DPS: <b style="color:#6abf3e">${formatNumber(dps)}</b>&nbsp;&nbsp;Stacks: <b style="color:#e8a020">${stacks}</b>`;
  });

  canvas.addEventListener('mouseleave', () => {
    if (tooltip) tooltip.style.display = 'none';
  });

  // ── Simulation loop ────────────────────────────────────────────────────────
  let lastTimestamp = 0;
  let simFrameDebt  = 0;   // time debt in seconds (real time → sim frames)
  const MAX_CATCHUP = 0.25; // seconds; prevents the spiral-of-death after tab sleeps

  function loop(timestamp) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);

    const elapsed = Math.min((timestamp - lastTimestamp) / 1000, MAX_CATCHUP);
    lastTimestamp = timestamp;
    simFrameDebt += elapsed;

    // Run as many fixed-timestep frames as real time has passed
    while (simFrameDebt >= DT) {
      const { totalDps, stackCount } = update(state);
      pushHistory(history, totalDps, stackCount);
      lastDps    = totalDps;
      lastStacks = stackCount;
      simFrameDebt -= DT;
    }

    render();
    updateStats();
  }

  function render() {
    drawGraph(canvas, history, state.time);
  }

  function updateStats() {
    if (elDps)    elDps.textContent    = formatNumber(lastDps);
    if (elStacks) elStacks.textContent = lastStacks.toString();
    if (elTime)   elTime.textContent   = state.time.toFixed(1) + 's';
    if (elHits)   elHits.textContent   = state.totalHits.toString();
  }

  // ── Buttons ────────────────────────────────────────────────────────────────
  function startSim() {
    if (running) return;
    running       = true;
    lastTimestamp = performance.now();
    simFrameDebt  = 0;
    btnRun.textContent = '⏸ Pause';
    btnRun.classList.add('active');
    rafId = requestAnimationFrame(loop);
  }

  function pauseSim() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    btnRun.textContent = '▶ Run';
    btnRun.classList.remove('active');
  }

  function resetSim() {
    pauseSim();
    // Preserve config, reset state
    const cfg = {
      hitDamage:      state.hitDamage,
      attackRate:     state.attackRate,
      poisonChance:   state.poisonChance,
      poisonDuration: state.poisonDuration,
      poisonScaling:  state.poisonScaling,
    };
    state   = createState(cfg);
    history = createHistory();
    lastDps    = 0;
    lastStacks = 0;
    updateStats();
    render();
  }

  btnRun.addEventListener('click', () => {
    if (running) pauseSim(); else startSim();
  });

  btnReset.addEventListener('click', resetSim);

  // ── Initial render + resize handling ──────────────────────────────────────
  resizeCanvas(canvas);
  render();

  window.addEventListener('resize', () => {
    resizeCanvas(canvas);
    render();
  });

})();
