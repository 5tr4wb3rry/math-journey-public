/* Math Journey — animation drawing kit.
 *
 * Shared visual vocabulary for every scene in public/assets/anim/. Lifted out of the
 * first scene (rates-add.js) once it was approved, so the three scenes that follow it
 * don't each reinvent easing curves, glass tanks, water, pipes, ripples, punch-in
 * captions, number lines, or the paper/grid background — and so all four look like they
 * belong to the same channel.
 *
 * PURITY RULE — every function below must be a pure function of the arguments it is
 * handed:
 *   - no Math.random, Date, Date.now, performance.now, setTimeout/setInterval,
 *     requestAnimationFrame, and no module-level variable that is read or mutated
 *     between calls. The renderer that turns a scene into video asks for arbitrary
 *     scene times in arbitrary order and requires byte-identical pixels for identical
 *     inputs — a function here that depended on anything but its own arguments would
 *     silently break that contract for every scene that uses it, not just one.
 *   - colours always come from the `tokens` object a caller hands in (see anim.js's
 *     defaultTokens for the shape) — never a literal hex or rgb() written here.
 *   - sizes are always derived from the view box / rect a caller hands in — never a
 *     hardcoded pixel count. (The one intentional exception is drawGround's grid cell,
 *     documented at its definition: it mirrors the site's own CSS grid unit, a design
 *     constant, not a proportion of the canvas.)
 *   - every function is documented in one line: what it draws or computes, and what its
 *     arguments mean. Three more scene authors are working from this file alone.
 *
 * Load order: after anim.js (which creates window.MathAnim / module.exports), before
 * any scene file. Scenes reach this through the SAME global anim.js already uses —
 * MathAnim.kit — never a second global.
 *
 * Loaded two ways, exactly like anim.js and rates-add.js:
 *   - As a plain <script src="kit.js"> in the browser, after anim.js.
 *   - Via require('./kit.js') in Node with no DOM at all. Every function here only
 *     touches the CanvasRenderingContext2D it's handed, never `document` or `window`,
 *     so requiring this file (or calling its functions against a node-canvas-style
 *     mock context) never throws for lack of a browser.
 *
 * No build step, no dependencies: hand-written ES5, one file, one job — same house
 * style as anim.js and every scene.
 */

(function () {
  'use strict';

  var MathAnim = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./anim.js')
    : (typeof window !== 'undefined' ? window.MathAnim : undefined);
  if (!MathAnim) throw new Error('kit.js: MathAnim host not found — load anim.js first');

  /* ----------------------------------------------------------------- easing helpers
   * Pure numeric curves. `ease` turns a time into 0..1 linear progress through a
   * window; the rest reshape a 0..1 input into a different 0..1 (or briefly
   * out-of-range, for the overshoot ones) output. Nothing here reads a clock — the
   * caller always supplies `t` or `u` itself. */

  // Clamps v into [lo, hi].
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // 0..1 linear progress of t through the window [t0, t1], clamped at both ends.
  function ease(t0, t1, t) { return clamp((t - t0) / (t1 - t0), 0, 1); }

  // Smoothstep: eases a 0..1 input to a 0..1 output with zero slope at both ends.
  function smooth(u) { return u * u * (3 - 2 * u); }

  // Cubic ease-out: fast start, gentle landing. u and output both 0..1.
  function easeOutCubic(u) { var x = 1 - u; return 1 - x * x * x; }

  // Cubic ease-in: gentle start, fast finish. u and output both 0..1.
  function easeInCubic(u) { return u * u * u; }

  // Cubic ease-in-out: gentle at both ends, fastest through the middle.
  function easeInOutCubic(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }

  // Ease-out with a small overshoot past 1 before settling — the "pop" a punched-in
  // keyword or label snaps in with. u is 0..1; output briefly exceeds 1.
  function easeOutBack(u) {
    var c1 = 1.70158, c3 = c1 + 1;
    var x = u - 1;
    return 1 + c3 * x * x * x + c1 * x * x;
  }

  // Symmetric decaying cosine bump: 1 at t === center, falling smoothly to 0 by
  // t === center +/- halfWidth, and exactly 0 beyond. Useful for a brief camera-shake
  // impulse timed to a single instant. Pure in t — no memory of previous calls.
  function pulseAt(t, center, halfWidth) {
    var d = Math.abs(t - center);
    if (d > halfWidth) return 0;
    return Math.cos((d / halfWidth) * Math.PI / 2);
  }

  /* ------------------------------------------------------- colour: tokens only
   * Every fill/stroke in this kit reads from the `tokens` object a caller supplies.
   * Translucency is done by re-encoding one of those token colours at a new alpha —
   * never by writing a new hex here. */

  // Parses a '#rgb' / '#rrggbb' hex string or an 'rgb(...)'/'rgba(...)' string into
  // {r, g, b} (0-255 each). Unrecognised input returns black rather than throwing.
  function parseRgb(str) {
    if (!str) return { r: 0, g: 0, b: 0 };
    var s = String(str).trim();
    var m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
      var num = parseInt(h, 16);
      return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }
    m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]) };
    return { r: 0, g: 0, b: 0 };
  }

  // Returns 'rgba(r,g,b,alpha)' for a token colour (hex or rgb string) at a new alpha —
  // a translucent variant of an existing token, never a fabricated hue.
  function rgba(tokenColor, alpha) {
    var c = parseRgb(tokenColor);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
  }

  /* --------------------------------------------------------------- shape helper */

  // Traces a rounded-rect path (x,y,w,h, corner radius r) on ctx; does not fill or
  // stroke — the caller does that, so this can be reused for both fills and clips.
  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* ------------------------------------------------------------------- text
   * Both label functions measure with ctx.measureText and shrink the font until the
   * string fits opts.maxWidth, so no string can ever cross the safe area regardless of
   * layout or camera move. Neither wraps — they only shrink; a caller that needs
   * multiple lines still has to split the string itself. */

  // Sets ctx.font from a tokens font-family key ('display' | 'body' | 'mono'), a CSS
  // weight string, and a pixel size.
  function setFont(ctx, tokens, family, weight, size) {
    ctx.font = weight + ' ' + Math.round(size) + 'px ' + tokens[family];
  }

  // Draws one line of body/display/mono text centered (by default) at (x, y), shrunk
  // to fit opts.maxWidth if given. opts: family/weight/size (font), color, align,
  // baseline, alpha, minSize (shrink floor), maxWidth.
  function drawLabel(ctx, str, x, y, tokens, opts) {
    opts = opts || {};
    var family = opts.family || 'body';
    var weight = opts.weight || '500';
    var size = opts.size || 16;
    setFont(ctx, tokens, family, weight, size);
    if (opts.maxWidth) {
      var w = ctx.measureText(str).width;
      if (w > opts.maxWidth) {
        size = Math.max(opts.minSize || 8, size * (opts.maxWidth / w));
        setFont(ctx, tokens, family, weight, size);
      }
    }
    ctx.fillStyle = opts.color || tokens.ink;
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.globalAlpha = opts.alpha === undefined ? 1 : opts.alpha;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  // Draws str as an uppercase (by default), letter-spaced mono label at (x, y),
  // measured character-by-character (mono font, so one glyph's width stands for all of
  // them) and shrunk to fit opts.maxWidth. opts: family/weight/size (font), tracking
  // (letter-spacing in em, default 0.14), align ('left'|'center'|'right'), color,
  // baseline, alpha, minSize, maxWidth, upper (set false to keep original case).
  function drawTrackedLabel(ctx, str, x, y, tokens, opts) {
    opts = opts || {};
    var text = opts.upper === false ? str : String(str).toUpperCase();
    var family = opts.family || 'mono';
    var weight = opts.weight || '500';
    var size = opts.size || 12;
    var trackingEm = opts.tracking === undefined ? 0.14 : opts.tracking;
    var align = opts.align || 'center';

    function measureAt(sz) {
      setFont(ctx, tokens, family, weight, sz);
      var tracking = trackingEm * sz;
      var w = 0;
      for (var i = 0; i < text.length; i++) {
        w += ctx.measureText(text[i]).width;
        if (i < text.length - 1) w += tracking;
      }
      return { width: w, tracking: tracking };
    }

    var m = measureAt(size);
    if (opts.maxWidth && m.width > opts.maxWidth) {
      size = Math.max(opts.minSize || 7, size * (opts.maxWidth / m.width));
      m = measureAt(size);
    }

    ctx.fillStyle = opts.color || tokens.inkSoft;
    ctx.textAlign = 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.globalAlpha = opts.alpha === undefined ? 1 : opts.alpha;

    var startX = x;
    if (align === 'center') startX = x - m.width / 2;
    else if (align === 'right') startX = x - m.width;

    var cx = startX;
    for (var i = 0; i < text.length; i++) {
      ctx.fillText(text[i], cx, y);
      cx += ctx.measureText(text[i]).width + m.tracking;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
  }

  /* --------------------------------------------------------------- layout / safe area */

  // Returns { x0, y0, innerW, innerH, inset } for a margin of opts.insetFrac
  // (default 0.06) of the shorter side of view, all four sides — the safe area every
  // scene composes its content inside so nothing sits flush against the frame edge.
  function safeArea(view, opts) {
    opts = opts || {};
    var frac = opts.insetFrac === undefined ? 0.06 : opts.insetFrac;
    var inset = Math.min(view.width, view.height) * frac;
    return {
      x0: inset,
      y0: inset,
      innerW: view.width - inset * 2,
      innerH: view.height - inset * 2,
      inset: inset
    };
  }

  /* --------------------------------------------------------------------- ground
   * Paper gradient + faint grid + vignette. The channel's signature background —
   * every scene should paint this first, before anything else. */

  // Fills the whole view with a top-to-bottom paper gradient (tokens.paper to
  // tokens.paperDeep), a faint grid at `gridCell` px (default 26 — the site's own CSS
  // grid unit from quiz.css, a fixed design constant rather than a fraction of the
  // canvas, so it lines up with the grid behind the page chrome regardless of the
  // canvas's own size), and a radial vignette darkening the corners.
  function drawGround(ctx, view, gridCell) {
    var W = view.width, H = view.height, tokens = view.tokens;
    var cell = gridCell || 26;

    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, tokens.paper);
    grad.addColorStop(1, tokens.paperDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = rgba(tokens.line, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    var gx, gy;
    for (gx = 0; gx <= W; gx += cell) { ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, H); }
    for (gy = 0; gy <= H; gy += cell) { ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5); }
    ctx.stroke();
    ctx.restore();

    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, rgba(tokens.ink, 0));
    vg.addColorStop(1, rgba(tokens.ink, 0.16));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  /* --------------------------------------------------------------------- camera
   * The mechanical half of a camera move: given a { scale, dx, dy } a scene has
   * already computed for the current t (that computation is scene-specific — which
   * moments push in, which recoil — so it stays in the scene file), applies it as one
   * ctx.save() + transform. The caller is responsible for the matching ctx.restore()
   * once everything under the camera has been drawn. */

  // Applies a save + scale-about-center + translate camera transform to ctx, built
  // from cam = { scale, dx, dy } (dx/dy pan in view-space pixels, scale about the view
  // center). Pairs with a plain ctx.restore() once the scene's content is drawn.
  function applyCamera(ctx, view, cam) {
    var W = view.width, H = view.height;
    ctx.save();
    ctx.translate(W / 2 + cam.dx, H / 2 + cam.dy);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-W / 2, -H / 2);
  }

  /* ---------------------------------------------------------------- glass tank
   * Shadow, glass body, water (gradient fill + two-sine surface + meniscus +
   * bubbles), inner edge highlights, diagonal sheen, stroke. */

  // Draws a glass tank at (x, y, w, h) filled to `level` (0..1) with water tinted by
  // waterToken. tokens supplies the glass/ink/card colours; t drives the surface
  // waves and rising bubbles; seed offsets the wave phase and bubble timing so
  // multiple tanks on screen at once don't move in lockstep. Returns
  // { surfaceY } — the y of the water's surface at the tank's horizontal center, so a
  // caller can land a pour stream or ripples exactly on the water.
  function drawGlassTank(ctx, x, y, w, h, level, tokens, waterToken, t, seed) {
    var r = Math.min(w, h) * 0.09;
    var lvl = clamp(level, 0, 1);

    // soft drop shadow
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = tokens.ink;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + h * 0.05, w * 0.46, Math.max(1, h * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // body
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = tokens.card;
    ctx.fill();

    var surfaceY = y + h;

    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();

    if (lvl > 0.002) {
      var waveA1 = h * 0.014, waveA2 = h * 0.008;
      var k1 = (2 * Math.PI) / Math.max(1, w * 0.85);
      var k2 = (2 * Math.PI) / Math.max(1, w * 0.47);
      var baseSurfaceY = y + h * (1 - lvl);
      var surfY = function (px) {
        return baseSurfaceY
          - waveA1 * Math.sin(k1 * px + t * 1.7 + seed)
          - waveA2 * Math.sin(k2 * px + t * 2.6 + seed * 0.6);
      };
      surfaceY = surfY(x + w / 2);

      var grad = ctx.createLinearGradient(0, baseSurfaceY - h * 0.05, 0, y + h);
      grad.addColorStop(0, rgba(waterToken, 0.55));
      grad.addColorStop(1, rgba(waterToken, 0.92));

      var steps = 14, i, px, py;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      for (i = 0; i <= steps; i++) {
        px = x + (w * i / steps);
        py = surfY(px);
        ctx.lineTo(px, py);
      }
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // meniscus — a brighter line riding the surface
      ctx.beginPath();
      for (i = 0; i <= steps; i++) {
        px = x + (w * i / steps);
        py = surfY(px);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = rgba(tokens.card, 0.55);
      ctx.lineWidth = Math.max(1, h * 0.008);
      ctx.stroke();

      // two or three slow rising bubbles, positions from fixed constants plus t
      var bubbleCount = 3;
      for (i = 0; i < bubbleCount; i++) {
        var cycle = 3.4 + i * 0.9;
        var ph0 = seed * 0.41 + i * 1.7;
        var raw = (t + ph0) / cycle;
        var fr = raw - Math.floor(raw);
        var by = (y + h) - fr * (h * lvl * 0.85);
        if (by < baseSurfaceY + h * 0.02) continue;
        var bx = x + w * (0.28 + i * 0.22) + Math.sin(t * 0.8 + seed + i) * w * 0.02;
        var br = Math.max(1, h * 0.011 * (1 + 0.25 * Math.sin(t * 1.3 + i)));
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = rgba(tokens.card, 0.32 * (1 - fr * 0.3));
        ctx.fill();
      }
    }

    // inner highlight, bright down the left edge
    var lg = ctx.createLinearGradient(x, 0, x + w * 0.16, 0);
    lg.addColorStop(0, rgba(tokens.card, 0.5));
    lg.addColorStop(1, rgba(tokens.card, 0));
    ctx.fillStyle = lg;
    ctx.fillRect(x, y, w * 0.16, h);

    // dimmer one down the right edge
    var rg = ctx.createLinearGradient(x + w * 0.86, 0, x + w, 0);
    rg.addColorStop(0, rgba(tokens.ink, 0));
    rg.addColorStop(1, rgba(tokens.ink, 0.12));
    ctx.fillStyle = rg;
    ctx.fillRect(x + w * 0.86, y, w * 0.14, h);

    // translucent diagonal sheen across the upper area
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = tokens.card;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.06, y + h * 0.06);
    ctx.lineTo(x + w * 0.42, y + h * 0.06);
    ctx.lineTo(x + w * 0.22, y + h * 0.36);
    ctx.lineTo(x + w * 0.06, y + h * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore(); // clip

    ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.018);
    ctx.strokeStyle = tokens.line;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();

    return { surfaceY: surfaceY };
  }

  /* ----------------------------------------------------------------- pipe / stream */

  // Draws a short pipe mouth centered above a tank of width tankW at (tankX, tankY).
  // Returns { x, y } — the point directly below the pipe's opening, for landing a
  // pour stream.
  function drawPipe(ctx, tankX, tankY, tankW, tokens) {
    var pipeW = tankW * 0.24;
    var pipeH = Math.max(4, tankW * 0.06);
    var pipeX = tankX + tankW / 2 - pipeW / 2;
    var pipeY = tankY - pipeH * 1.7;

    roundRect(ctx, pipeX, pipeY, pipeW, pipeH, pipeH * 0.3);
    ctx.fillStyle = tokens.card;
    ctx.fill();
    ctx.lineWidth = Math.max(1, pipeH * 0.12);
    ctx.strokeStyle = tokens.line;
    roundRect(ctx, pipeX, pipeY, pipeW, pipeH, pipeH * 0.3);
    ctx.stroke();

    roundRect(ctx, pipeX + pipeW * 0.15, pipeY + pipeH * 0.5, pipeW * 0.7, pipeH * 0.5, pipeH * 0.15);
    ctx.fillStyle = rgba(tokens.ink, 0.18);
    ctx.fill();

    return { x: tankX + tankW / 2, y: pipeY + pipeH };
  }

  // Draws a tapering, wobbling stream of colorToken-tinted water from `mouth` (a pipe
  // mouth's return value) down to `surfaceY`. t drives the wobble; seed offsets its
  // phase so multiple streams don't wobble in lockstep.
  function drawStream(ctx, mouth, surfaceY, tokens, colorToken, t, seed) {
    var topY = mouth.y, botY = surfaceY;
    var h = botY - topY;
    if (h < 2) return;

    var topW = Math.max(2, h * 0.1);
    var botW = Math.max(1.4, h * 0.05);
    var wob = Math.sin(t * 3.1 + seed) * h * 0.04;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(mouth.x - topW / 2, topY);
    ctx.quadraticCurveTo(mouth.x - topW * 0.3 + wob, topY + h * 0.5, mouth.x - botW / 2 + wob, botY);
    ctx.lineTo(mouth.x + botW / 2 + wob, botY);
    ctx.quadraticCurveTo(mouth.x + topW * 0.3 + wob, topY + h * 0.5, mouth.x + topW / 2, topY);
    ctx.closePath();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = colorToken;
    ctx.fill();

    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = rgba(tokens.card, 0.65);
    ctx.lineWidth = Math.max(0.6, topW * 0.12);
    ctx.beginPath();
    ctx.moveTo(mouth.x - topW * 0.4, topY);
    ctx.lineTo(mouth.x - botW * 0.4 + wob, botY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouth.x + topW * 0.4, topY);
    ctx.lineTo(mouth.x + botW * 0.4 + wob, botY);
    ctx.stroke();
    ctx.restore();
  }

  // Draws two expanding, fading ripple rings centered at (landX, landY), clipped to
  // the tank rect (tankX, tankY, tankW, tankH, tankR) so they never draw outside the
  // glass. maxR bounds the ring radius; t (with a fixed 0.9s period) drives the
  // expand-and-fade cycle; seed offsets phase between tanks.
  function drawRipples(ctx, tankX, tankY, tankW, tankH, tankR, landX, landY, maxR, tokens, colorToken, t, seed) {
    ctx.save();
    roundRect(ctx, tankX, tankY, tankW, tankH, tankR);
    ctx.clip();

    var period = 0.9;
    for (var i = 0; i < 2; i++) {
      var raw = (t + seed + i * period / 2) / period;
      var fr = raw - Math.floor(raw);
      var rad = fr * maxR;
      ctx.beginPath();
      ctx.arc(landX, landY, rad, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, maxR * 0.06 * (1 - fr));
      ctx.strokeStyle = rgba(colorToken, 0.4 * (1 - fr));
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------------ chip
   * A pill that can be progressively struck through and then lose its colour and
   * fall — the "that answer was wrong" beat. */

  // Draws a w x h pill centered at (cx, cy) holding `text` (letter-spaced mono).
  // strikeU (0..1) progressively draws a cross through it (first diagonal 0..0.5,
  // second 0.5..1) and fades the text to tokens.inkFaint as it completes; fallU
  // (0..1) then drops, rotates and fades the whole chip out. Both are driven by the
  // caller from t — nothing here reads time itself.
  function drawStrikeChip(ctx, cx, cy, w, h, tokens, text, strikeU, fallU) {
    fallU = clamp(fallU || 0, 0, 1);
    var fallEase = easeInCubic(fallU);
    var dy = fallEase * h * 1.9;
    var rot = fallEase * 0.4;
    var alphaFall = 1 - fallEase * 0.72;
    var dieU = clamp(strikeU * 0.5 + fallEase, 0, 1);

    ctx.save();
    ctx.translate(cx, cy + dy);
    ctx.rotate(rot);
    ctx.globalAlpha = alphaFall;

    roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.5);
    ctx.fillStyle = tokens.card;
    ctx.fill();

    ctx.save();
    roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.5);
    ctx.clip();
    ctx.globalAlpha = alphaFall * (1 - dieU);
    ctx.fillStyle = tokens.warmSoft;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalAlpha = alphaFall * dieU * 0.7;
    ctx.fillStyle = tokens.card;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();

    ctx.lineWidth = Math.max(1, h * 0.07);
    ctx.strokeStyle = tokens.line;
    roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.5);
    ctx.stroke();

    drawTrackedLabel(ctx, text, 0, h * 0.16, tokens, {
      family: 'mono', weight: '600', size: h * 0.42, color: tokens.warm,
      alpha: (1 - dieU) * alphaFall, tracking: 0.08, maxWidth: w * 0.86
    });
    if (dieU > 0.1) {
      drawTrackedLabel(ctx, text, 0, h * 0.16, tokens, {
        family: 'mono', weight: '600', size: h * 0.42, color: tokens.inkFaint,
        alpha: dieU * alphaFall, tracking: 0.08, maxWidth: w * 0.86
      });
    }

    // the cross, drawn progressively — first diagonal, then the second
    if (strikeU > 0) {
      var half = Math.min(w, h) * 0.32;
      ctx.lineCap = 'round';
      ctx.strokeStyle = tokens.bad;
      ctx.lineWidth = Math.max(2, h * 0.11);
      var u1 = clamp(strikeU / 0.5, 0, 1);
      var u2 = clamp((strikeU - 0.5) / 0.5, 0, 1);
      if (u1 > 0) {
        ctx.beginPath();
        ctx.moveTo(-half, -half);
        ctx.lineTo(-half + (2 * half) * u1, -half + (2 * half) * u1);
        ctx.stroke();
      }
      if (u2 > 0) {
        ctx.beginPath();
        ctx.moveTo(half, -half);
        ctx.lineTo(half - (2 * half) * u2, -half + (2 * half) * u2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /* ---------------------------------------------------------------- keyword punch-in
   * A short word or number that scales in with an overshoot, holds, then scales back
   * out — the channel's caption style in place of a full sentence on screen. */

  // Returns { alpha, scale } for a keyword window [start, end] at time t: 0 before
  // start and after end, an easeOutBack overshoot scaling in, a steady 1/1 hold, then
  // an ease-in scale/fade out over the window's last opts-implied fraction. Pure in t.
  function punchProgress(t, start, end) {
    if (t <= start || t >= end) return { alpha: 0, scale: 0.6 };
    var span = end - start;
    var inDur = Math.min(0.5, span * 0.35);
    var outDur = Math.min(0.45, span * 0.3);
    if (t < start + inDur) {
      var u = ease(start, start + inDur, t);
      return { alpha: clamp(u * 1.3, 0, 1), scale: easeOutBack(u) };
    }
    if (t > end - outDur) {
      var u2 = ease(end - outDur, end, t);
      return { alpha: 1 - easeInCubic(u2), scale: 1 - 0.15 * easeInCubic(u2) };
    }
    return { alpha: 1, scale: 1 };
  }

  // Draws every { big, small, start, end } item in `items` whose window contains t,
  // centered in the box (x0, y0, innerW, innerH). An item with a non-empty `big` draws
  // a small tracked label above a large display number/fraction; one with an empty
  // `big` draws just `small` as a single display line. tokens supplies colour, view
  // supplies width/height for sizing. At most a handful of items are ever on screen
  // at once in practice, since windows are authored not to overlap.
  function drawKeywordPunch(ctx, tokens, view, x0, y0, innerW, innerH, items, t) {
    var maxW = innerW * 0.92;
    var unit = Math.min(view.width, view.height);
    var cx = x0 + innerW / 2;

    for (var i = 0; i < items.length; i++) {
      var k = items[i];
      var p = punchProgress(t, k.start, k.end);
      if (p.alpha <= 0.002) continue;

      if (k.big) {
        drawTrackedLabel(ctx, k.small, cx, y0 + innerH * 0.045, tokens, {
          family: 'mono', weight: '600', size: Math.max(9, unit * 0.024) * p.scale,
          color: tokens.inkSoft, alpha: p.alpha, tracking: 0.18, maxWidth: maxW
        });
        drawLabel(ctx, k.big, cx, y0 + innerH * 0.13, tokens, {
          family: 'display', weight: '700', size: unit * 0.155 * p.scale, minSize: 16,
          color: tokens.ink, alpha: p.alpha, maxWidth: maxW
        });
      } else {
        drawLabel(ctx, k.small, cx, y0 + innerH * 0.09, tokens, {
          family: 'display', weight: '600', size: unit * 0.072 * p.scale, minSize: 14,
          color: tokens.ink, alpha: p.alpha, maxWidth: maxW
        });
      }
    }
  }

  /* --------------------------------------------------------------------- number line */

  // Draws a horizontal number line from geo.min to geo.max in steps of geo.step,
  // spanning x geo.x0..geo.x1 at height geo.y, with a tick and a letter-spaced label
  // under each step. geo.innerW/geo.innerH size the line weight, tick length and
  // label size proportionally, the same way the scene's own safe area does. Returns
  // { toX: function(value) } mapping a value on the line to its x, so a caller can
  // place other markers (a moving token, a struck-out candidate) on the same scale.
  function drawNumberLine(ctx, tokens, geo) {
    var x0 = geo.x0, x1 = geo.x1, y = geo.y;
    var innerW = geo.innerW, innerH = geo.innerH;
    var min = geo.min, max = geo.max, step = geo.step;
    var labelColor = geo.labelColor || tokens.inkFaint;

    var toX = function (v) { return x0 + (x1 - x0) * ((v - min) / (max - min)); };

    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = Math.max(1.5, innerW * 0.003);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();

    var tickSize = innerH * 0.012;
    for (var v = min; v <= max; v += step) {
      var tx = toX(v);
      ctx.beginPath();
      ctx.moveTo(tx, y - tickSize);
      ctx.lineTo(tx, y + tickSize);
      ctx.stroke();
      drawTrackedLabel(ctx, String(v), tx, y + tickSize + innerH * 0.03, tokens, {
        family: 'mono', weight: '400', size: Math.max(8, innerW * 0.016), color: labelColor,
        tracking: 0.05, maxWidth: (x1 - x0) / 7
      });
    }
    return { toX: toX };
  }

  /* ------------------------------------------------------------------------ export */

  var kit = {
    clamp: clamp,
    ease: ease,
    smooth: smooth,
    easeOutCubic: easeOutCubic,
    easeInCubic: easeInCubic,
    easeInOutCubic: easeInOutCubic,
    easeOutBack: easeOutBack,
    pulseAt: pulseAt,

    parseRgb: parseRgb,
    rgba: rgba,

    roundRect: roundRect,

    setFont: setFont,
    drawLabel: drawLabel,
    drawTrackedLabel: drawTrackedLabel,

    safeArea: safeArea,
    drawGround: drawGround,
    applyCamera: applyCamera,

    drawGlassTank: drawGlassTank,
    drawPipe: drawPipe,
    drawStream: drawStream,
    drawRipples: drawRipples,

    drawStrikeChip: drawStrikeChip,

    punchProgress: punchProgress,
    drawKeywordPunch: drawKeywordPunch,

    drawNumberLine: drawNumberLine
  };

  if (typeof Object.freeze === 'function') Object.freeze(kit);

  MathAnim.kit = kit;

  if (typeof module === 'object' && module.exports) {
    module.exports = kit;
  }
  if (typeof window !== 'undefined') {
    window.MathAnim.kit = kit;
  }
})();
