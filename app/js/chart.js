// Minimal dependency-free canvas line chart with reference bands, dashed limit lines,
// mean line and point markers. Used by the live monitor and the logbook.
NS.chart = (function () {
  const C = {
    grid: 'rgba(148,163,184,0.10)', axis: '#7b8aa3', band: 'rgba(52,211,153,0.07)',
    normal: 'rgba(52,211,153,0.75)', warn: 'rgba(248,113,113,0.85)', mean: 'rgba(226,232,240,0.55)',
    line: '#5eb3ff', ok: '#34d399', caution: '#fbbf24', crit: '#f87171', text: '#9fb0c8',
  };

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function hline(ctx, x0, x1, y, color, dash, width) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(y) + 0.5);
    ctx.lineTo(x1, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * opts: { pts:[{x,y}], xmin, xmax, def, mean, markers:[{x,y,color,r}], xfmt(x), compact, statusColor }
   */
  function draw(canvas, opts) {
    const { ctx, w, h } = setup(canvas);
    const def = opts.def || {};
    const pad = { l: opts.padL != null ? opts.padL : opts.compact ? 30 : 40, r: opts.padR != null ? opts.padR : opts.compact ? 6 : 10, t: 6, b: opts.compact ? 14 : 20 };
    const pts = opts.pts.filter((p) => p.y != null && !isNaN(p.y));

    // y-range: reference axis widened to data
    let ymin = def.axis ? def.axis[0] : Infinity, ymax = def.axis ? def.axis[1] : -Infinity;
    for (const p of pts) { if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
    if (!isFinite(ymin) || !isFinite(ymax)) { ymin = 0; ymax = 1; }
    if (ymax - ymin < 1e-6) { ymin -= 1; ymax += 1; }
    const yr = ymax - ymin; ymin -= yr * 0.04; ymax += yr * 0.04;

    const X = (x) => pad.l + (x - opts.xmin) / (opts.xmax - opts.xmin || 1) * (w - pad.l - pad.r);
    const Y = (y) => pad.t + (1 - (y - ymin) / (ymax - ymin)) * (h - pad.t - pad.b);
    const x0 = pad.l, x1 = w - pad.r;

    // normal band
    if (def.normal) {
      const a = def.normal[0] == null ? ymin : Math.max(ymin, def.normal[0]);
      const b = def.normal[1] == null ? ymax : Math.min(ymax, def.normal[1]);
      if (b > a) { ctx.fillStyle = C.band; ctx.fillRect(x0, Y(b), x1 - x0, Y(a) - Y(b)); }
    }
    // grid + y labels
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = C.axis;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ticks = niceTicks(ymin, ymax, opts.compact ? 3 : 5);
    for (const tv of ticks) {
      hline(ctx, x0, x1, Y(tv), C.grid);
      ctx.fillText(short(tv), x0 - 4, Y(tv));
    }
    // reference lines (dashed): normal limits green, caution limits red
    const lim = [];
    if (def.normal) def.normal.forEach((v) => v != null && lim.push([v, C.normal, [5, 4]]));
    if (def.warn) def.warn.forEach((v) => v != null && lim.push([v, C.warn, [2, 3]]));
    for (const [v, col, dash] of lim) {
      if (v < ymin || v > ymax) continue;
      hline(ctx, x0, x1, Y(v), col, dash, 1.2);
    }
    // mean line
    if (opts.mean != null && isFinite(opts.mean)) hline(ctx, x0, x1, Y(opts.mean), C.mean, [1, 3], 1.2);

    // x labels
    if (opts.xfmt) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = C.axis;
      const xt = niceTicks(opts.xmin, opts.xmax, opts.compact ? 3 : 6);
      for (const xv of xt) {
        if (xv < opts.xmin || xv > opts.xmax) continue;
        ctx.fillText(opts.xfmt(xv), X(xv), h - pad.b + 3);
      }
    }

    // series
    if (pts.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, x1 - x0, h);
      ctx.clip();
      ctx.strokeStyle = opts.color || C.line;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false, prevX = null;
      for (const p of pts) {
        const px = X(p.x), py = Y(p.y);
        if (!started || (opts.gap && prevX != null && p.x - prevX > opts.gap)) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
        prevX = p.x;
      }
      ctx.stroke();
      if (opts.dots) {
        ctx.fillStyle = opts.color || C.line;
        for (const p of pts) { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 1.8, 0, 7); ctx.fill(); }
      }
      // last point
      const last = pts[pts.length - 1];
      if (!opts.noLast) {
        ctx.fillStyle = opts.statusColor || C.line;
        ctx.beginPath();
        ctx.arc(X(last.x), Y(last.y), 3.2, 0, 7);
        ctx.fill();
      }
      ctx.restore();
    }
    // markers (anomalies/events)
    for (const m of opts.markers || []) {
      const px = X(m.x);
      if (m.y == null) {
        ctx.fillStyle = m.color; ctx.globalAlpha = 0.18;
        ctx.fillRect(px - (m.w || 2) / 2, pad.t, m.w || 2, h - pad.t - pad.b);
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.strokeStyle = m.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, Y(m.y), m.r || 5, 0, 7); ctx.stroke();
    }
    // hovered point: guide line + filled dot
    if (opts.hover) {
      const px = X(opts.hover.x), py = Y(opts.hover.y);
      ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = opts.color || C.line; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fill(); ctx.stroke();
    }
    canvas._map = { X, Y, pts }; // lets callers hit-test the mouse against the plotted points
  }

  function short(v) {
    const a = Math.abs(v);
    if (a >= 10000) return (v / 1000).toFixed(0) + 'k';
    if (a >= 1000) return (v / 1000).toFixed(1) + 'k';
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(0);
    if (a >= 1) return v.toFixed(1);
    return v.toFixed(2);
  }

  function niceTicks(a, b, n) {
    const span = b - a;
    if (span <= 0) return [a];
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  return { draw, C };
})();
