/** Maximum characters rendered per log entry (canvas width constraint). */
const MAX_LOG_ENTRY_LENGTH = 110;
 *
 * Strictly presentation-only:
 * • No game logic, no simulation code
 * • Accepts plain data objects (live Unit instances OR snapshot objects)
 * • Never modifies state
 *
 * Coordinate system
 * ─────────────────
 * Team A occupies the left half, Team B the right half.
 * Units are drawn as styled circles with HP bars and stat labels.
 * The bottom 130 px are reserved for the battle log.
 */
export class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────

  /**
   * Render a complete battle state snapshot.
   *
   * @param {Object} state
   *   Must have:
   *     teams:    { name, hp, maxHp, attack, teamIndex, isDead, abilities?|abilityNames? }[][]
   *     log:      string[]
   *     turn?:    number
   *     winner?:  number|string|null
   */
  render(state) {
    const { ctx, canvas } = this;
    const ARENA_H = canvas.height - 130;

    // ── Background ──────────────────────────────────────────────────
    ctx.fillStyle = '#0f0f1f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── Divider line ────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth   = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 45);
    ctx.lineTo(canvas.width / 2, ARENA_H - 10);
    ctx.stroke();
    ctx.restore();

    // ── Team labels ─────────────────────────────────────────────────
    this._text('Team A', canvas.width / 4,       28, '#4a90d9', 'bold 16px Arial');
    this._text('Team B', (canvas.width * 3) / 4, 28, '#e74c3c', 'bold 16px Arial');

    // ── Turn counter ────────────────────────────────────────────────
    if (state.turn !== undefined && state.turn !== null) {
      this._text(
        `Turn ${state.turn + 1}`,
        canvas.width / 2, 20,
        '#666', '12px Arial'
      );
    }

    // ── Units ───────────────────────────────────────────────────────
    this._renderTeam(state.teams[0], 0,                  0, canvas.width / 2, ARENA_H);
    this._renderTeam(state.teams[1], canvas.width / 2,   0, canvas.width / 2, ARENA_H);

    // ── Log panel ───────────────────────────────────────────────────
    this._renderLog(state);

    // ── Winner overlay (only when battle is finished) ───────────────
    if (state.winner !== null && state.winner !== undefined) {
      this._renderWinnerOverlay(state.winner, ARENA_H);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────

  _renderTeam(units, offsetX, offsetY, width, arenaH) {
    if (!units || units.length === 0) return;
    const spacing = Math.min(140, width / (units.length + 0.5));
    const startX  = offsetX + width / 2 - ((units.length - 1) * spacing) / 2;

    units.forEach((unit, i) => {
      this._renderUnit(unit, startX + i * spacing, offsetY + arenaH / 2);
    });
  }

  _renderUnit(unit, x, y) {
    const { ctx } = this;
    const R        = 38;
    const alive    = !unit.isDead;
    const teamCol  = unit.teamIndex === 0 ? '#4a90d9' : '#e74c3c';
    const fillCol  = unit.teamIndex === 0 ? '#1a3d5c' : '#5c1a1a';

    // ── Glow ────────────────────────────────────────────────────────
    if (alive) {
      ctx.shadowColor = teamCol;
      ctx.shadowBlur  = 18;
    }

    // ── Circle ──────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle   = alive ? fillCol : '#1e1e1e';
    ctx.fill();
    ctx.strokeStyle = alive ? teamCol : '#444';
    ctx.lineWidth   = 3;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // ── Name ────────────────────────────────────────────────────────
    ctx.fillStyle  = alive ? '#ffffff' : '#555';
    ctx.font       = 'bold 12px Arial';
    ctx.textAlign  = 'center';
    ctx.fillText(unit.name, x, y - R - 10);

    // ── Stats (attack / hp) ─────────────────────────────────────────
    if (alive) {
      ctx.font      = '12px Arial';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`⚔ ${unit.attack}`, x - 14, y + 5);
      ctx.fillStyle = '#ff7b7b';
      ctx.fillText(`♥ ${unit.hp}`,     x + 14, y + 5);
    } else {
      ctx.font      = 'bold 22px Arial';
      ctx.fillStyle = '#c0392b';
      ctx.fillText('✕', x, y + 8);
    }

    // ── Ability label ────────────────────────────────────────────────
    const label = this._abilityLabel(unit);
    if (label) {
      ctx.font      = '9px Arial';
      ctx.fillStyle = alive ? '#8ab4d9' : '#444';
      ctx.fillText(label, x, y + R + 14);
    }

    // ── HP bar ──────────────────────────────────────────────────────
    const barW  = 64;
    const barH  = 5;
    const barX  = x - barW / 2;
    const barY  = y + R + 20;
    const ratio = alive ? Math.max(0, unit.hp / unit.maxHp) : 0;

    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);

    const hpColor =
      ratio > 0.5 ? '#2ecc71' :
      ratio > 0.2 ? '#f39c12' :
                    '#e74c3c';
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, barW * ratio, barH);
  }

  _renderLog(state) {
    const { ctx, canvas } = this;
    const logY   = canvas.height - 130;
    const logH   = 130;
    const entries = (state.log || []).slice(-6);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, logY, canvas.width, logH);

    // Top border
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, logY);
    ctx.lineTo(canvas.width, logY);
    ctx.stroke();

    // Heading
    ctx.fillStyle = '#666';
    ctx.font      = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Battle Log', 12, logY + 14);

    // Entries
    entries.forEach((entry, i) => {
      const isLast = i === entries.length - 1;
      ctx.fillStyle = isLast ? '#eee' : '#888';
      ctx.font      = '11px monospace';
      ctx.fillText(entry.slice(0, MAX_LOG_ENTRY_LENGTH), 12, logY + 28 + i * 17);
    });
  }

  _renderWinnerOverlay(winner, arenaH) {
    const { ctx, canvas } = this;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, arenaH);

    const text =
      winner === 0      ? '🏆  Team A Wins!'  :
      winner === 1      ? '🏆  Team B Wins!'  :
      winner === 'draw' ? '🤝  Draw!'         :
                          '⏱️  Time Out!';

    const color =
      winner === 0 ? '#4a90d9' :
      winner === 1 ? '#e74c3c' :
                     '#f39c12';

    ctx.font      = 'bold 38px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 20;
    ctx.fillText(text, canvas.width / 2, arenaH / 2);
    ctx.shadowBlur = 0;
  }

  /** Returns a display string for the unit's abilities. */
  _abilityLabel(unit) {
    if (unit.abilities && unit.abilities.length > 0) {
      return unit.abilities.map(a => a.name).join(', ');
    }
    if (unit.abilityNames && unit.abilityNames.length > 0) {
      return unit.abilityNames.join(', ');
    }
    return '';
  }

  /** Convenience: draw centred text. */
  _text(str, x, y, color, font) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font      = font;
    ctx.fillText(str, x, y);
  }
}
