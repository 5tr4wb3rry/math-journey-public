/* Math Journey — scene "rates-add".
 *
 * Companion animation for public/lessons/rate-work-and-mixture-problems.html. Same
 * example, same numbers, no others: one pipe fills a pool in 4 hours, another in 6;
 * running together the pool fills in 12/5 = 2.4 hours, because rates add and times don't.
 *
 * CONTRACT — a separate repo (math-journey-video) renders this to video by calling
 * scene.render(ctx, t, view) for arbitrary scene times, in arbitrary order, timed to
 * synthesised narration instead of wall-clock playback. That only works if state(t) and
 * draw() are PURE functions of their arguments:
 *   - same t always produces the identical state object (deep-equal) and identical pixels
 *   - no Math.random, Date, Date.now, performance.now, setTimeout/setInterval,
 *     requestAnimationFrame, CSS transitions, or any module-level variable that gets
 *     mutated between calls — anything like that would make a frame depend on when or
 *     how many times it was asked for, not just on t
 *   - draw() reads only from the state object and view; it clears its own frame first
 *
 * Loaded as a plain <script> after anim.js and kit.js (browser: reads window.MathAnim /
 * window.MathAnim.kit) or via require() in Node with no DOM at all (the video renderer's
 * scene-source.js reads scene.id/duration/script this way before any canvas exists) —
 * see the MathAnim/kit lookup at the top, which handles both without throwing.
 *
 * KIT PASS (this rewrite) — the generic drawing vocabulary (easing curves, colour/text
 * helpers, the paper/grid background, the camera transform, glass tanks and water,
 * pipes/streams/ripples, the strike-through chip, keyword punch-ins, the number line)
 * moved to the shared public/assets/anim/kit.js so the next three scenes can reuse it
 * instead of re-deriving it. What stays here is specific to THIS scene's own metaphor
 * (pools/pipes/rate-bars) and its own timeline:
 *   - state(t) is UNCHANGED, field-for-field, value-for-value, from the previous
 *     version — this rewrite does not touch its source at all, including the local
 *     clamp/ease/smooth/phaseFor helpers it depends on, so its output is guaranteed
 *     identical to before this pass, not merely intended to be.
 *   - Every draw()-side call to a function that moved goes through `kit.<name>` instead;
 *     every formula that moved is copied verbatim (same literal expressions, same
 *     evaluation order) so floating-point results are bit-identical, not just visually
 *     equivalent.
 *   - No new hex colours: every fill/stroke reads view.tokens; translucency is done with
 *     globalAlpha or kit.rgba() (an rgba() re-encoding of a token's own channels) — never
 *     a fabricated colour.
 */

(function () {
  'use strict';

  var MathAnim = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./anim.js')
    : (typeof window !== 'undefined' ? window.MathAnim : undefined);
  if (!MathAnim) throw new Error('rates-add.js: MathAnim host not found — load anim.js first');

  var kit = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./kit.js')
    : (MathAnim && MathAnim.kit);
  if (!kit) throw new Error('rates-add.js: MathAnim.kit not found — load kit.js after anim.js and before rates-add.js');

  /* ---------------------------------------------------------------- constants
   * The only numbers this scene ever uses: 4, 6, 1/4, 1/6, 5/12, 12/5, 2.4, 10, 5 —
   * the lesson's own worked example. Rates are kept as exact {n, d} fractions so
   * "1/4 + 1/6 === 5/12" can be checked by cross-multiplying integers rather than by
   * comparing floats that were arrived at via different arithmetic paths. */

  var HOURS_A = 4;
  var HOURS_B = 6;
  var RATE_A = { n: 1, d: 4 };     // 1/4 pool per hour
  var RATE_B = { n: 1, d: 6 };     // 1/6 pool per hour
  var RATE_SUM = { n: 5, d: 12 };  // 1/4 + 1/6 = 3/12 + 2/12 = 5/12 pool per hour
  var HOURS_TOGETHER = { n: 12, d: 5 }; // flip the rate: 1 / (5/12) = 12/5 hours
  var HOURS_TOGETHER_DECIMAL = 2.4;     // 12/5 = 2.4, shown alongside the fraction

  var RATE_A_DECIMAL = RATE_A.n / RATE_A.d;
  var RATE_B_DECIMAL = RATE_B.n / RATE_B.d;

  // Phase boundaries in seconds, exactly the timeline in the spec.
  var PHASE = {
    titleEnd: 5.0,
    questionEnd: 8.0,
    kill10End: 13.0,
    kill5End: 18.0,
    perHourEnd: 23.5,
    stackEnd: 28.0,
    flipEnd: 32.0,
    checkEnd: 36.0
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  // 0..1 linear progress of t through [t0, t1]. Pure arithmetic — deterministic in t.
  function ease(t0, t1, t) { return clamp((t - t0) / (t1 - t0), 0, 1); }
  // Smoothstep: same inputs, same output, just an easing curve — still pure.
  function smooth(u) { return u * u * (3 - 2 * u); }

  function phaseFor(t) {
    if (t < PHASE.titleEnd) return 'title';
    if (t < PHASE.questionEnd) return 'question';
    if (t < PHASE.kill10End) return 'kill10';
    if (t < PHASE.kill5End) return 'kill5';
    if (t < PHASE.perHourEnd) return 'perhour';
    if (t < PHASE.stackEnd) return 'stack';
    if (t < PHASE.flipEnd) return 'flip';
    return 'check';
  }

  /* -------------------------------------------------------------------- state
   * Pure: a plain object of numbers/strings/small fraction objects, nothing else.
   * No drawing, no DOM, no canvas — draw() is the only place pixels happen.
   * UNCHANGED from the previous version — see the file header. */

  function state(t) {
    var phase = phaseFor(t);

    // Pool A is the elimination witness in both kill phases: it is shown already full,
    // because it finishes at hour 4 regardless of which wrong candidate (10 or 5) is
    // being tested against it.
    var poolA = 0;
    if (phase === 'kill10') poolA = smooth(ease(8.0, 10.0, t));
    else if (phase === 'kill5' || phase === 'perhour' || phase === 'stack' || phase === 'flip' || phase === 'check') poolA = 1;

    var axisMarker = null;
    var axisStrike = 0;
    if (phase === 'kill10') { axisMarker = 10; axisStrike = smooth(ease(10.0, 12.0, t)); }
    if (phase === 'kill5') { axisMarker = 5; axisStrike = smooth(ease(13.0, 15.0, t)); }

    var barReveal = 0;
    if (phase === 'perhour') barReveal = smooth(ease(18.0, 20.0, t));
    else if (phase === 'stack' || phase === 'flip' || phase === 'check') barReveal = 1;

    var stackMerge = 0;
    if (phase === 'stack') stackMerge = smooth(ease(23.5, 26.0, t));
    else if (phase === 'flip' || phase === 'check') stackMerge = 1;

    var stackLabelReveal = 0;
    if (phase === 'stack') stackLabelReveal = ease(26.0, 27.5, t);
    else if (phase === 'flip' || phase === 'check') stackLabelReveal = 1;

    var flipAngle = 0;
    if (phase === 'flip') flipAngle = smooth(ease(28.0, 30.0, t));
    else if (phase === 'check') flipAngle = 1;

    // elapsedFraction goes 0 -> 1 linearly across the whole flip phase (28s -> 32s), and
    // IS the fill level of the "Both" tank directly — not elapsed_hours * rate computed
    // as a separate float multiplication. That's what guarantees the tank is at exactly
    // 1.0 the instant t hits 32 (poolBoth = (32-28)/(32-28) = 1 exactly), with no
    // floating-point residue from multiplying 2.4 by 5/12 to get there.
    var elapsedFraction = 0;
    if (phase === 'flip') elapsedFraction = ease(28.0, 32.0, t);
    else if (phase === 'check') elapsedFraction = 1;

    var poolBoth = elapsedFraction;
    var fillHours = elapsedFraction * HOURS_TOGETHER_DECIMAL; // display only, 0..2.4

    var bothQuestion = (phase === 'title' || phase === 'question' || phase === 'kill10' ||
      phase === 'kill5' || phase === 'perhour' || phase === 'stack');

    var checkReveal = (phase === 'check') ? ease(32.0, 34.0, t) : 0;

    var titleReveal = smooth(ease(0.0, 1.5, t));
    var questionFocus = phase === 'title' ? 0 : (phase === 'question' ? smooth(ease(5.0, 6.5, t)) : 1);

    return {
      t: t,
      phase: phase,

      hoursA: HOURS_A,
      hoursB: HOURS_B,
      rateA: RATE_A,
      rateB: RATE_B,
      rateSum: RATE_SUM,
      rateADecimal: RATE_A_DECIMAL,
      rateBDecimal: RATE_B_DECIMAL,
      hoursTogether: HOURS_TOGETHER,
      hoursTogetherDecimal: HOURS_TOGETHER_DECIMAL,

      titleReveal: titleReveal,
      questionFocus: questionFocus,

      poolA: poolA,
      poolB: 0,
      poolBoth: poolBoth,
      bothQuestion: bothQuestion,

      axisMarker: axisMarker,
      axisStrike: axisStrike,

      barReveal: barReveal,

      stackMerge: stackMerge,
      stackLabelReveal: stackLabelReveal,

      flipAngle: flipAngle,
      elapsedFraction: elapsedFraction,
      fillHours: fillHours,

      checkReveal: checkReveal,
      checkUnderFour: fillHours < HOURS_A
    };
  }

  /* --------------------------------------------------------------------- draw
   * Pure: reads only ctx, s, view. Clears its own frame first. Every size is derived
   * from view.width/view.height so the same scene composes at 1920x1080 (wide) and
   * 1080x1920 (tall). Tokens only — no second palette, no fabricated colour. Generic
   * visual vocabulary (easing, colour, text, background, camera, tanks, water, pipes,
   * streams, ripples, the strike chip, keyword punch-ins, the number line) comes from
   * `kit`; everything below is specific to this scene's pools/pipes/rate-bars. */

  /* ---- ground: gradient paper, faint grid, vignette — depth, not a blank canvas ---- */
  /* (kit.drawGround) */

  /* ---- camera: one global transform, a pure function of t ---- */

  function cameraFor(t, view) {
    var unit = Math.min(view.width, view.height);

    // Slow push in through the flip beat, then settle back down through the check beat.
    var rise = smooth(ease(28.0, 30.5, t));
    var fall = smooth(ease(32.5, 36.0, t));
    var flipPush = rise * (1 - fall);

    // A small knock-back impulse at the instant each wrong answer finishes being struck.
    var p10 = kit.pulseAt(t, 12.0, 0.4);
    var p5 = kit.pulseAt(t, 15.0, 0.4);

    var scale = 1 + flipPush * 0.035 - p10 * 0.014 - p5 * 0.014;
    var dx = (p10 - p5) * unit * 0.01;
    var dy = (p10 + p5) * unit * 0.006;

    return { scale: scale, dx: dx, dy: dy };
  }

  /* ---- glass tanks / pipe / stream / ripples: kit.drawGlassTank, kit.drawPipe,
   *      kit.drawStream, kit.drawRipples ---- */

  // Rects for `count` pools, side by side in 'wide', stacked in 'tall'. Specific to
  // this scene's own multi-tank layouts (not listed among the generic kit vocabulary).
  function poolRects(view, x0, y0, innerW, innerH, count) {
    var rects = [];
    var i;
    if (view.layout === 'wide') {
      var gap = innerW * 0.06;
      var w = (innerW - gap * (count - 1)) / count;
      var h = innerH * 0.58;
      var y = y0 + innerH * 0.12;
      for (i = 0; i < count; i++) rects.push({ x: x0 + i * (w + gap), y: y, w: w, h: h });
    } else {
      var gapV = innerH * 0.05;
      var hh = (innerH * 0.72 - gapV * (count - 1)) / count;
      var ww = innerW * 0.6;
      var xx = x0 + (innerW - ww) / 2;
      for (i = 0; i < count; i++) rects.push({ x: xx, y: y0 + i * (hh + gapV), w: ww, h: hh });
    }
    return rects;
  }

  /* ---- keyword punch-ins — replace the old full-sentence caption. At most four words
   * on screen at once, big numbers biggest, scaled in with overshoot, fitted to the
   * safe area by measurement so nothing can ever cross the frame edge. Windows below
   * mirror the phase boundaries and script cues above; nothing here changes them.
   * The mechanic itself is kit.drawKeywordPunch / kit.punchProgress — this list of
   * words is this scene's own content. ---- */

  var KEYWORDS = [
    { big: '4', small: 'HOURS', start: 0.35, end: 2.20 },
    { big: '6', small: 'HOURS', start: 2.40, end: 4.90 },
    { big: '', small: 'TOGETHER?', start: 5.20, end: 7.80 },
    { big: '10', small: 'HOURS?', start: 8.20, end: 9.80 },
    { big: '', small: 'NO.', start: 11.60, end: 12.90 },
    { big: '5', small: 'HOURS?', start: 13.20, end: 14.70 },
    { big: '', small: 'NO.', start: 15.00, end: 16.40 },
    { big: '', small: 'RATES ADD', start: 18.30, end: 22.00 },
    { big: '5/12', small: 'PER HOUR', start: 23.80, end: 27.60 },
    { big: '', small: 'FLIP IT', start: 28.20, end: 29.60 },
    { big: '2.4', small: 'HOURS', start: 29.90, end: 32.00 },
    { big: '', small: 'UNDER 4 HOURS', start: 32.30, end: 35.80 }
  ];

  /* ---- a wrong-answer chip: kit.drawStrikeChip ---- */

  /* ---- title / question: three glass tanks ---- */

  function drawTanksScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var rects = poolRects(view, x0, y0, innerW, innerH, 3);
    var labels = ['PIPE A — 4 HOURS', 'PIPE B — 6 HOURS', 'BOTH — ?'];
    var levels = [s.poolA, s.poolB, s.bothQuestion ? 0 : s.poolBoth];
    var waterTokens = [tokens.inkFaint, tokens.inkFaint, tokens.accent];
    var seeds = [0.0, 1.7, 3.3];
    var fontSize = Math.max(9, Math.min(innerW, innerH) * 0.03);

    for (var i = 0; i < 3; i++) {
      var r = rects[i];
      var focus = (i === 2) ? s.questionFocus : 1;
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.6 * focus;
      if (i === 2 && focus > 0) {
        ctx.save();
        ctx.globalAlpha = focus * 0.35;
        kit.roundRect(ctx, r.x - r.w * 0.06, r.y - r.h * 0.06, r.w * 1.12, r.h * 1.12, Math.min(r.w, r.h) * 0.12);
        ctx.fillStyle = tokens.accentSoft;
        ctx.fill();
        ctx.restore();
      }
      kit.drawGlassTank(ctx, r.x, r.y, r.w, r.h, levels[i], tokens, waterTokens[i], s.t, seeds[i]);
      kit.drawTrackedLabel(ctx, labels[i], r.x + r.w / 2, r.y + r.h + fontSize * 1.6, tokens, {
        family: 'mono', weight: '500', size: fontSize, color: tokens.inkSoft, tracking: 0.08, maxWidth: r.w * 1.15
      });
      if (i === 2 && s.bothQuestion) {
        kit.drawLabel(ctx, '?', r.x + r.w / 2, r.y + r.h / 2 + fontSize * 0.9, tokens, {
          family: 'display', weight: '600', size: fontSize * 2.6, color: tokens.ink, alpha: 0.5 + 0.5 * focus
        });
      }
      ctx.restore();
    }
  }

  /* ---- kill10 / kill5: time axis with a struck-through, falling chip ---- */

  function drawKillScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var isWrong10 = s.phase === 'kill10';

    var tankW = innerW * (view.layout === 'wide' ? 0.24 : 0.34);
    var tankH = innerH * 0.3;
    var tankX = x0 + innerW / 2 - tankW / 2;
    var tankY = y0 + innerH * 0.2;
    kit.drawPipe(ctx, tankX, tankY, tankW, tokens);
    var tank = kit.drawGlassTank(ctx, tankX, tankY, tankW, tankH, s.poolA, tokens, tokens.accent, s.t, 0.6);

    if (isWrong10 && s.poolA < 0.995) {
      var mouth = { x: tankX + tankW / 2, y: tankY - Math.max(4, tankW * 0.06) * 0.7 };
      kit.drawStream(ctx, mouth, tank.surfaceY, tokens, tokens.accent, s.t, 0.6);
      kit.drawRipples(ctx, tankX, tankY, tankW, tankH, Math.min(tankW, tankH) * 0.09,
        mouth.x, tank.surfaceY, tankW * 0.12, tokens, tokens.accent, s.t, 0.6);
    }

    kit.drawTrackedLabel(ctx, 'PIPE A — ALREADY FULL AT HOUR 4', tankX + tankW / 2, tankY + tankH + innerH * 0.05, tokens, {
      family: 'mono', weight: '500', size: Math.max(9, innerW * 0.022), color: tokens.inkSoft, tracking: 0.06, maxWidth: innerW * 0.92
    });

    // Time axis, 0..12 hours.
    var axisY = y0 + innerH * 0.78;
    var axisX0 = x0 + innerW * 0.06;
    var axisX1 = x0 + innerW * 0.94;
    var hourToX = kit.drawNumberLine(ctx, tokens, {
      x0: axisX0, x1: axisX1, y: axisY, innerW: innerW, innerH: innerH, min: 0, max: 12, step: 2
    }).toX;

    // The struck-out candidate chip.
    var mx = hourToX(s.axisMarker);
    ctx.beginPath();
    ctx.arc(mx, axisY, Math.max(3, innerW * 0.007), 0, Math.PI * 2);
    ctx.fillStyle = kit.rgba(tokens.warm, 0.7);
    ctx.fill();

    var chipW = innerW * (view.layout === 'wide' ? 0.15 : 0.24);
    var chipH = innerH * 0.05;
    var chipCy = axisY - chipH * 1.4;
    var strikeEnd = isWrong10 ? 12.0 : 15.0;
    var fallEnd = isWrong10 ? 13.0 : 16.2;
    var fallU = ease(strikeEnd, fallEnd, s.t);
    kit.drawStrikeChip(ctx, mx, chipCy, chipW, chipH, tokens, s.axisMarker + ' HOURS?', s.axisStrike, fallU);
  }

  /* ---- perhour: two bars, 1/4 and 1/6 of a pool ---- */

  function barGeometry(view, x0, y0, innerW, innerH) {
    var trackW = innerW * (view.layout === 'wide' ? 0.5 : 0.72);
    var trackX = x0 + innerW / 2 - trackW / 2;
    var barH = innerH * 0.05;
    return { trackX: trackX, trackW: trackW, barH: barH };
  }

  function drawRateBar(ctx, x, y, trackW, barH, frac, tokens, color, label) {
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = tokens.ink;
    ctx.beginPath();
    ctx.ellipse(x + trackW / 2, y + barH + barH * 0.22, trackW * 0.48, Math.max(1, barH * 0.12), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    kit.roundRect(ctx, x, y, trackW, barH, barH * 0.3);
    ctx.fillStyle = tokens.card;
    ctx.fill();
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = Math.max(1, barH * 0.06);
    ctx.stroke();

    var w = trackW * clamp(frac, 0, 1);
    if (w > 0) {
      var grad = ctx.createLinearGradient(x, y, x, y + barH);
      grad.addColorStop(0, kit.rgba(color, 0.85));
      grad.addColorStop(1, kit.rgba(color, 1));
      kit.roundRect(ctx, x, y, w, barH, barH * 0.3);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.save();
      kit.roundRect(ctx, x, y, w, barH, barH * 0.3);
      ctx.clip();
      var hl = ctx.createLinearGradient(x, y, x, y + barH * 0.4);
      hl.addColorStop(0, kit.rgba(tokens.card, 0.35));
      hl.addColorStop(1, kit.rgba(tokens.card, 0));
      ctx.fillStyle = hl;
      ctx.fillRect(x, y, w, barH * 0.4);
      ctx.restore();
    }
    kit.drawTrackedLabel(ctx, label, x, y - barH * 0.75, tokens, {
      family: 'mono', weight: '600', size: barH * 0.85, color: tokens.inkSoft, align: 'left', tracking: 0.08, maxWidth: trackW
    });
  }

  function drawPerHourScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var geo = barGeometry(view, x0, y0, innerW, innerH);
    var yA = y0 + innerH * 0.36;
    var yB = y0 + innerH * 0.58;
    var reveal = kit.easeOutCubic(s.barReveal);

    drawRateBar(ctx, geo.trackX, yA, geo.trackW, geo.barH, s.rateADecimal * reveal, tokens, tokens.accent,
      '1/4 OF A POOL');
    drawRateBar(ctx, geo.trackX, yB, geo.trackW, geo.barH, s.rateBDecimal * reveal, tokens, tokens.warm,
      '1/6 OF A POOL');
  }

  /* ---- stack: the two bars merge into one, labelled 5/12 ---- */

  function drawStackScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var geo = barGeometry(view, x0, y0, innerW, innerH);
    var separateYA = y0 + innerH * 0.36;
    var separateYB = y0 + innerH * 0.58;
    var stackedY = y0 + innerH * 0.46;
    var merge = kit.easeInOutCubic(s.stackMerge);

    var yA = separateYA + (stackedY - separateYA) * merge;
    var yB = separateYB + (stackedY - separateYB) * merge;

    var wA = geo.trackW * RATE_A_DECIMAL;
    var wB = geo.trackW * RATE_B_DECIMAL;
    var xB = geo.trackX + wA * merge;

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = tokens.ink;
    ctx.beginPath();
    ctx.ellipse(geo.trackX + geo.trackW / 2, stackedY + geo.barH + geo.barH * 0.22, geo.trackW * 0.48, Math.max(1, geo.barH * 0.12), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    kit.roundRect(ctx, geo.trackX, yA, geo.trackW, geo.barH, geo.barH * 0.3);
    ctx.fillStyle = tokens.card;
    ctx.fill();
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = Math.max(1, geo.barH * 0.06);
    ctx.stroke();

    var gA = ctx.createLinearGradient(geo.trackX, yA, geo.trackX, yA + geo.barH);
    gA.addColorStop(0, kit.rgba(tokens.accent, 0.85));
    gA.addColorStop(1, kit.rgba(tokens.accent, 1));
    kit.roundRect(ctx, geo.trackX, yA, wA, geo.barH, geo.barH * 0.3);
    ctx.fillStyle = gA;
    ctx.fill();

    var gB = ctx.createLinearGradient(xB, yB, xB, yB + geo.barH);
    gB.addColorStop(0, kit.rgba(tokens.warm, 0.85));
    gB.addColorStop(1, kit.rgba(tokens.warm, 1));
    kit.roundRect(ctx, xB, yB, wB, geo.barH, geo.barH * 0.3);
    ctx.fillStyle = gB;
    ctx.fill();

    if (s.stackLabelReveal > 0) {
      var lp = kit.easeOutBack(clamp(s.stackLabelReveal, 0, 1));
      kit.drawLabel(ctx, '5/12 OF A POOL, EVERY HOUR', geo.trackX + geo.trackW / 2, stackedY - geo.barH * 0.55, tokens, {
        family: 'display', weight: '600', size: Math.max(13, innerW * 0.03) * clamp(lp, 0.7, 1.06), color: tokens.ink,
        alpha: s.stackLabelReveal, maxWidth: innerW * 0.9
      });
    }
  }

  /* ---- flip / check: the rate bar rotates into a time marker; the Both tank fills ---- */

  function drawFlipToken(ctx, tokens, x0, innerW, y0, innerH, s, hourToX, axisY) {
    var fa = s.flipAngle;
    var startX = x0 + innerW * 0.5, startY = y0 + innerH * 0.19;
    var startW = innerW * 0.3, startH = innerH * 0.038;
    var endX = hourToX(s.fillHours), endY = axisY;
    var endW = Math.max(6, innerW * 0.028), endH = endW;

    var u = kit.easeInOutCubic(fa);
    var cx = startX + (endX - startX) * u;
    var cy = startY + (endY - startY) * u;
    var w = startW + (endW - startW) * u;
    var h = startH + (endH - startH) * u;
    var rot = u * 0.4;
    var rad = Math.min(w, h) * (0.5 * u + 0.15 * (1 - u));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    kit.roundRect(ctx, -w / 2, -h / 2, w, h, rad);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = tokens.good;
    ctx.fill();
    ctx.restore();

    if (u < 0.85) {
      kit.drawLabel(ctx, '5/12', cx, startY - startH, tokens, {
        family: 'display', weight: '700', size: Math.max(11, innerW * 0.028), color: tokens.ink,
        alpha: 1 - u, maxWidth: innerW * 0.4
      });
    }
    if (u > 0.15 && s.flipAngle > 0) {
      // While the clock is still running this shows the elapsed time ALONE. The fraction
      // only joins it once the fill is complete, because "12/5 = 1.2 HOURS" mid-sweep is a
      // false statement on screen — every frame has to be true on its own.
      var settled = s.elapsedFraction >= 1;
      var timeText = settled
        ? '12/5 = ' + HOURS_TOGETHER_DECIMAL.toFixed(1) + ' HOURS'
        : s.fillHours.toFixed(1) + ' HOURS';
      kit.drawLabel(ctx, timeText, endX, endY - endH - innerH * 0.025, tokens, {
        family: 'display', weight: '600', size: Math.max(12, innerW * 0.03), color: tokens.good,
        alpha: Math.min(1, u * 1.3), maxWidth: innerW * 0.7
      });
    }
  }

  function drawFlipScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;

    var tankW = innerW * (view.layout === 'wide' ? 0.3 : 0.42);
    var tankH = innerH * 0.38;
    var tankX = view.layout === 'wide' ? x0 + innerW * 0.14 : x0 + innerW / 2 - tankW / 2;
    var tankY = y0 + innerH * 0.24;
    kit.drawPipe(ctx, tankX, tankY, tankW, tokens);
    var tank = kit.drawGlassTank(ctx, tankX, tankY, tankW, tankH, s.poolBoth, tokens, tokens.accent, s.t, 2.1);

    if (s.phase === 'flip' && s.poolBoth < 0.995) {
      var mouth = { x: tankX + tankW / 2, y: tankY - Math.max(4, tankW * 0.06) * 0.7 };
      kit.drawStream(ctx, mouth, tank.surfaceY, tokens, tokens.accent, s.t, 2.1);
      kit.drawRipples(ctx, tankX, tankY, tankW, tankH, Math.min(tankW, tankH) * 0.09,
        mouth.x, tank.surfaceY, tankW * 0.11, tokens, tokens.accent, s.t, 2.1);
    }

    kit.drawTrackedLabel(ctx, 'BOTH', tankX + tankW / 2, tankY + tankH + innerH * 0.045, tokens, {
      family: 'mono', weight: '500', size: Math.max(9, innerW * 0.022), color: tokens.inkSoft, tracking: 0.1, maxWidth: tankW * 1.2
    });

    // Time axis 0..12, with the flip token sliding along it.
    var axisY = view.layout === 'wide' ? y0 + innerH * 0.82 : y0 + innerH * 0.86;
    var axisX0 = x0 + innerW * 0.06;
    var axisX1 = x0 + innerW * 0.94;
    var hourToX = kit.drawNumberLine(ctx, tokens, {
      x0: axisX0, x1: axisX1, y: axisY, innerW: innerW, innerH: innerH, min: 0, max: 12, step: 2
    }).toX;

    if (s.flipAngle > 0 || s.phase === 'check') {
      drawFlipToken(ctx, tokens, x0, innerW, y0, innerH, s, hourToX, axisY);
    }

    // The sanity check, held on screen through the last beat.
    if (s.checkReveal > 0) {
      var compareY = view.layout === 'wide' ? y0 + innerH * 0.14 : y0 + innerH * 0.74;
      var compareW = innerW * (view.layout === 'wide' ? 0.4 : 0.7);
      var compareX = view.layout === 'wide' ? (x0 + innerW - compareW) : x0 + innerW / 2 - compareW / 2;
      var barH = innerH * 0.05;
      var reveal = kit.easeOutCubic(s.checkReveal);

      kit.roundRect(ctx, compareX, compareY, compareW, barH, barH * 0.3);
      ctx.fillStyle = tokens.card;
      ctx.fill();
      ctx.strokeStyle = tokens.line;
      ctx.lineWidth = Math.max(1, barH * 0.1);
      ctx.stroke();

      var resultW = compareW * clamp(s.fillHours / HOURS_A, 0, 1) * reveal;
      if (resultW > 0) {
        var grad = ctx.createLinearGradient(compareX, compareY, compareX, compareY + barH);
        grad.addColorStop(0, kit.rgba(tokens.good, 0.85));
        grad.addColorStop(1, kit.rgba(tokens.good, 1));
        kit.roundRect(ctx, compareX, compareY, resultW, barH, barH * 0.3);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      kit.drawTrackedLabel(ctx, '2.4 HOURS TOGETHER VS. 4 FOR PIPE A ALONE', compareX + compareW / 2, compareY - barH * 0.45, tokens, {
        family: 'mono', weight: '500', size: Math.max(8, innerW * 0.02), color: tokens.inkSoft, alpha: s.checkReveal,
        tracking: 0.04, maxWidth: compareW
      });
    }
  }

  function draw(ctx, s, view) {
    var W = view.width, H = view.height;

    ctx.save();
    ctx.clearRect(0, 0, W, H);

    var cam = cameraFor(s.t, view);
    kit.applyCamera(ctx, view, cam);

    kit.drawGround(ctx, view);

    var area = kit.safeArea(view);
    var x0 = area.x0, y0 = area.y0;
    var innerW = area.innerW, innerH = area.innerH;

    switch (s.phase) {
      case 'title':
      case 'question':
        drawTanksScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'kill10':
      case 'kill5':
        drawKillScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'perhour':
        drawPerHourScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'stack':
        drawStackScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'flip':
      case 'check':
        drawFlipScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
    }

    kit.drawKeywordPunch(ctx, view.tokens, view, x0, y0, innerW, innerH, KEYWORDS, s.t);

    ctx.restore(); // camera
    ctx.restore(); // outer
  }

  MathAnim.define({
    id: 'rates-add',
    duration: 36,
    poster: 30,
    state: state,
    draw: draw,
    // The words and when they are wanted. HOW they are spoken — speed, pitch, the
    // silence held before a payoff — is production direction and is deliberately not
    // here: it lives in the video repo, one file per scene, so this stays a lesson
    // asset rather than render configuration in a published folder.
    script: [
      { at: 0.0, text: 'One pipe fills a pool in four hours. Another fills the same pool in six.' },
      { at: 5.0, text: 'Both running together. How long?' },
      { at: 8.0, text: 'Ten hours? Impossible. Adding a second pipe cannot make it slower.' },
      { at: 13.0, text: 'Five hours? Also impossible. The first pipe was done at four.' },
      { at: 18.0, text: "The move is this. Don't add the times. Add what each pipe does in one hour." },
      { at: 23.5, text: 'A quarter of a pool, plus a sixth of a pool, is five twelfths every hour.' },
      { at: 28.0, text: 'Flip that back, and the pool is full in twelve fifths of an hour. Two point four.' },
      { at: 32.0, text: 'Under four hours. It survives the sanity check.' }
    ]
  });
})();
