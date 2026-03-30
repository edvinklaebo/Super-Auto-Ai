/**
 * Playtest – canvas action game
 *
 * Controls
 *   WASD / Arrow keys – move the player
 *   Left-click hold   – attack (blocks movement while held)
 *
 * Enemy: stationary Patchwork Golem with a large HP pool.
 */
(function playtestMain() {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const PLAYER_SPEED  = 220;        // logical px / second
  const PLAYER_RADIUS = 16;         // logical px
  const ENEMY_RADIUS  = 48;         // logical px
  const ENEMY_MAX_HP  = 50_000;
  const ATTACK_DPS    = 500;        // damage / second while in range
  const ATTACK_RANGE  = 120;        // logical px, centre-to-centre
  const SWING_RATE    = 5;          // radians / second (arc animation speed)
  const MAX_FRAME_DT  = 0.1;        // seconds; caps dt to avoid spiral-of-death after tab sleeps
  const ARC_BASE_ALPHA  = 0.30;     // base opacity of the attack cone
  const ARC_PULSE_AMT   = 0.20;     // additional opacity added by pulsing sine wave
  const ARC_PULSE_FREQ  = 3;        // pulse cycles per swing revolution
  const RANGE_CIRCLE_ALPHA = 0.10;  // opacity of the dashed attack-range indicator

  // ── Canvas / context ───────────────────────────────────────────────────────
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('playtestCanvas'));
  const ctx    = canvas.getContext('2d');

  // ── Game state (reset each game) ───────────────────────────────────────────
  /** @type {{ x:number, y:number, facing:number, swingAngle:number }} */
  let player;
  /** @type {{ x:number, y:number, hp:number, dead:boolean }} */
  let enemy;
  let isAttacking = false;

  // ── Runtime state ──────────────────────────────────────────────────────────
  let ptRunning = false;
  let lastTime  = 0;
  let dpr       = 1;

  // ── Input ──────────────────────────────────────────────────────────────────
  const keys    = {};
  let mouseX    = 0;   // logical canvas coordinates
  let mouseY    = 0;
  let mouseDown = false;

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  /** @returns {number} logical width of the canvas */
  function logW() { return canvas.width  / dpr; }
  /** @returns {number} logical height of the canvas */
  function logH() { return canvas.height / dpr; }

  // ── Canvas resize ──────────────────────────────────────────────────────────
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const nw   = Math.round(rect.width  * dpr);
    const nh   = Math.round(rect.height * dpr);
    if (canvas.width !== nw || canvas.height !== nh) {
      canvas.width  = nw;
      canvas.height = nh;
    }
  }

  // ── Game init / restart ────────────────────────────────────────────────────
  function initGame() {
    resizeCanvas();
    const w = logW(), h = logH();
    player = { x: w * 0.25, y: h * 0.50, facing: 0, swingAngle: 0 };
    enemy  = { x: w * 0.70, y: h * 0.50, hp: ENEMY_MAX_HP, dead: false };
    isAttacking = false;
    mouseDown   = false;
    Object.keys(keys).forEach(k => { keys[k] = false; });
  }

  // ── Input event listeners ──────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (!ptRunning) return;
    // Prevent page scroll while playing
    if (['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    keys[e.code] = true;
  });

  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Track mouse in logical (CSS-pixel) coordinates relative to the canvas
  document.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouseDown = true;
  });

  // Release on document so drag-release outside canvas is caught
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Restart button
  const btnRestart = document.getElementById('btnPlaytestRestart');
  if (btnRestart) {
    btnRestart.addEventListener('click', initGame);
  }

  // ── Update (game logic) ────────────────────────────────────────────────────
  function update(dt) {
    if (enemy.dead) return;

    isAttacking = mouseDown;

    if (isAttacking) {
      // ── Attacking: face cursor, animate swing, deal damage ────────────────
      player.facing    = Math.atan2(mouseY - player.y, mouseX - player.x);
      player.swingAngle = (player.swingAngle + SWING_RATE * dt) % (Math.PI * 2);

      const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (dist <= ATTACK_RANGE + ENEMY_RADIUS) {
        enemy.hp = Math.max(0, enemy.hp - ATTACK_DPS * dt);
        if (enemy.hp <= 0) { enemy.hp = 0; enemy.dead = true; }
      }
    } else {
      // ── Moving: WASD / arrow keys ─────────────────────────────────────────
      player.swingAngle = 0;

      let vx = 0, vy = 0;
      if (keys['KeyW'] || keys['ArrowUp'])    vy -= 1;
      if (keys['KeyS'] || keys['ArrowDown'])  vy += 1;
      if (keys['KeyA'] || keys['ArrowLeft'])  vx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) vx += 1;

      if (vx !== 0 || vy !== 0) {
        const len = Math.hypot(vx, vy);
        vx /= len; vy /= len;
        player.facing = Math.atan2(vy, vx);
        const w = logW(), h = logH();
        player.x = Math.max(PLAYER_RADIUS, Math.min(w - PLAYER_RADIUS, player.x + vx * PLAYER_SPEED * dt));
        player.y = Math.max(PLAYER_RADIUS, Math.min(h - PLAYER_RADIUS, player.y + vy * PLAYER_SPEED * dt));
      }
    }
  }

  // ── Draw helpers ───────────────────────────────────────────────────────────
  function drawBackground() {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth   = 1;
    const gs = 40 * dpr;
    for (let gx = gs; gx < W; gx += gs) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = gs; gy < H; gy += gs) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
  }

  function drawEnemy() {
    const cx = enemy.x * dpr, cy = enemy.y * dpr;
    const r  = ENEMY_RADIUS * dpr;

    if (enemy.dead) {
      ctx.save();
      ctx.globalAlpha  = 0.35;
      ctx.fillStyle    = '#3a1a1a';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle    = '#888';
      ctx.font         = `bold ${13 * dpr}px 'Segoe UI', sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☠ DEFEATED', cx, cy);
      ctx.textBaseline = 'alphabetic';
      return;
    }

    // Glow
    ctx.save();
    ctx.shadowColor = 'rgba(192,57,43,0.55)';
    ctx.shadowBlur  = 22 * dpr;

    // Body
    ctx.fillStyle = '#5d0d0d';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring
    ctx.strokeStyle = '#8b0000';
    ctx.lineWidth   = 2.5 * dpr;
    ctx.stroke();
    ctx.restore();

    // Patchwork stitching
    ctx.save();
    ctx.strokeStyle = 'rgba(139,0,0,0.55)';
    ctx.lineWidth   = 1.5 * dpr;

    // Cross dividers
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.8, cy); ctx.lineTo(cx + r * 0.8, cy);
    ctx.moveTo(cx, cy - r * 0.8); ctx.lineTo(cx, cy + r * 0.8);
    ctx.stroke();

    // Small X stitches around the body
    const stitchSize = 4 * dpr;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const sx  = cx + Math.cos(ang) * r * 0.6;
      const sy  = cy + Math.sin(ang) * r * 0.6;
      ctx.beginPath();
      ctx.moveTo(sx - stitchSize, sy - stitchSize); ctx.lineTo(sx + stitchSize, sy + stitchSize);
      ctx.moveTo(sx + stitchSize, sy - stitchSize); ctx.lineTo(sx - stitchSize, sy + stitchSize);
      ctx.stroke();
    }
    ctx.restore();

    // ── HP bar ────────────────────────────────────────────────────────────
    const barW = 120 * dpr, barH = 9 * dpr;
    const barX = cx - barW / 2;
    const barY = cy - r - 20 * dpr;

    ctx.fillStyle = '#1a0000';
    ctx.fillRect(barX, barY, barW, barH);

    const pct      = enemy.hp / ENEMY_MAX_HP;
    const hpColor  = pct > 0.5 ? '#c0392b' : pct > 0.25 ? '#e67e22' : '#f39c12';
    ctx.fillStyle  = hpColor;
    ctx.fillRect(barX, barY, barW * pct, barH);

    ctx.strokeStyle = '#444';
    ctx.lineWidth   = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // HP numbers
    ctx.fillStyle    = '#ccc';
    ctx.font         = `${9 * dpr}px 'Segoe UI', sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `${Math.ceil(enemy.hp).toLocaleString()} / ${ENEMY_MAX_HP.toLocaleString()} HP`,
      cx, barY - 2 * dpr
    );

    // Name tag
    ctx.fillStyle    = '#c0392b';
    ctx.font         = `bold ${10 * dpr}px 'Segoe UI', sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('Patchwork Golem', cx, cy + r + 6 * dpr);
    ctx.textBaseline = 'alphabetic';
  }

  function drawPlayer() {
    const cx = player.x * dpr, cy = player.y * dpr;
    const r  = PLAYER_RADIUS * dpr;

    // ── Swing arc (drawn before the player body) ───────────────────────────
    if (isAttacking) {
      const arcR     = ATTACK_RANGE * dpr * 0.7;
      const halfSweep = 0.85;

      // Filled cone
      ctx.save();
      ctx.globalAlpha = ARC_BASE_ALPHA + ARC_PULSE_AMT * Math.abs(Math.sin(player.swingAngle * ARC_PULSE_FREQ));
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, arcR);
      grad.addColorStop(0, 'rgba(232,160,32,0.7)');
      grad.addColorStop(1, 'rgba(232,160,32,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, arcR, player.facing - halfSweep, player.facing + halfSweep);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Animated sword line
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = '#ffe082';
      ctx.lineWidth   = 2.5 * dpr;
      const swingOff  = Math.sin(player.swingAngle * 2) * halfSweep * 0.9;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(player.facing + swingOff) * arcR,
        cy + Math.sin(player.facing + swingOff) * arcR
      );
      ctx.stroke();
      ctx.restore();
    }

    // ── Player body ───────────────────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = isAttacking ? 'rgba(232,160,32,0.75)' : 'rgba(106,191,62,0.55)';
    ctx.shadowBlur  = 18 * dpr;

    ctx.fillStyle = isAttacking ? '#7b5d00' : '#1b5e20';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isAttacking ? '#e8a020' : '#6abf3e';
    ctx.lineWidth   = 2 * dpr;
    ctx.stroke();
    ctx.restore();

    // Direction indicator
    ctx.strokeStyle = isAttacking ? '#ffe082' : '#a5d6a7';
    ctx.lineWidth   = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(player.facing) * r * 1.6,
      cy + Math.sin(player.facing) * r * 1.6
    );
    ctx.stroke();

    // Label
    ctx.fillStyle    = isAttacking ? '#e8a020' : '#6abf3e';
    ctx.font         = `bold ${9 * dpr}px 'Segoe UI', sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('YOU', cx, cy + r + 4 * dpr);
    ctx.textBaseline = 'alphabetic';
  }

  function drawHUD() {
    const pad = 10 * dpr;

    // Status bar background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(pad, pad, 300 * dpr, 22 * dpr);

    ctx.fillStyle    = '#d4c5a9';
    ctx.font         = `${9 * dpr}px 'Segoe UI', sans-serif`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';

    const status = enemy.dead
      ? '✓ Enemy defeated! Press Restart to play again.'
      : isAttacking
        ? '⚔ Attacking'
        : '↕ Moving';

    ctx.fillText(
      `WASD: Move  |  LMB Hold: Attack     ${status}`,
      pad + 7 * dpr, pad + 11 * dpr
    );
    ctx.textBaseline = 'alphabetic';

    // Faint attack-range circle when idle
    if (!isAttacking && !enemy.dead) {
      ctx.save();
      ctx.globalAlpha = RANGE_CIRCLE_ALPHA;
      ctx.strokeStyle = '#6abf3e';
      ctx.lineWidth   = 1 * dpr;
      ctx.setLineDash([5 * dpr, 5 * dpr]);
      ctx.beginPath();
      ctx.arc(player.x * dpr, player.y * dpr, ATTACK_RANGE * dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ── Main draw ──────────────────────────────────────────────────────────────
  function draw() {
    resizeCanvas();
    drawBackground();
    drawEnemy();
    drawPlayer();
    drawHUD();
  }

  // ── Game loop ──────────────────────────────────────────────────────────────
  function gameLoop(timestamp) {
    if (!ptRunning) return;
    requestAnimationFrame(gameLoop);
    const dt = Math.min((timestamp - lastTime) / 1000, MAX_FRAME_DT);
    lastTime = timestamp;
    update(dt);
    draw();
  }

  // ── Start / stop ───────────────────────────────────────────────────────────
  function startPlaytest() {
    if (ptRunning) return;
    initGame();
    ptRunning = true;
    lastTime  = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function stopPlaytest() {
    ptRunning = false;
    Object.keys(keys).forEach(k => { keys[k] = false; });
    mouseDown = false;
  }

  // ── Tab switching ──────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      document.querySelectorAll('.tab-panel').forEach(p => {
        const panelId = 'panel' + tab.charAt(0).toUpperCase() + tab.slice(1);
        p.classList.toggle('hidden', p.id !== panelId);
      });

      if (tab === 'playtest') {
        startPlaytest();
      } else {
        stopPlaytest();
      }
    });
  });

  window.addEventListener('resize', () => {
    if (ptRunning) draw();
  });

})();
