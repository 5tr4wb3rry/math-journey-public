/* Math Journey — scene "x-ladder".
 *
 * Companion animation for public/lessons/the-x-plus-1-over-x-family-iterated.html. Same
 * example, same numbers, no others: x + 1/x = 4, so x² + 1/x² = 4² − 2 = 14, and doing
 * the identical move again gives x⁴ + 1/x⁴ = 14² − 2 = 194. You never find x.
 *
 * WHY THIS SCENE EXISTS IN THIS FORM. The topic's check came back partial on 2026-07-31,
 * and the single problem missed was the SECOND application of the move — as it was on the
 * checkpoint before it. So the repeat is the subject here, not a corollary: the ladder has
 * two identical rungs, and the second one is given exactly as much room as the first.
 *
 * CONTRACT — a separate repo (reel-works) renders this to video by calling
 * scene.render(ctx, t, view) for arbitrary scene times, in arbitrary order, timed to
 * synthesised narration instead of wall-clock playback. That only works if state(t) and
 * draw() are PURE functions of their arguments:
 *   - same t always produces the identical state object (deep-equal) and identical pixels
 *   - no Math.random, Date, Date.now, performance.now, setTimeout/setInterval,
 *     requestAnimationFrame, CSS transitions, or any module-level variable mutated
 *     between calls
 *   - draw() reads only from the state object and view; it clears its own frame first
 *
 * EVERY FRAME MUST BE TRUE ON ITS OWN, and this scene is the one most at risk of failing
 * that, because it draws equations for a living. The rule it follows: a rung's VALUE is
 * either absent or final — never interpolating — and no value is drawn on a rung before
 * the arithmetic that produces it has finished on screen. Every equation string is fixed
 * and true whenever visible ("4² = 16", "16 − 2 = 14", "14² = 196", "196 − 2 = 194");
 * none is assembled from a number that is mid-animation.
 *
 * Superscripts are plain characters (x², x⁴) — there is no typesetting engine here and
 * none is available.
 *
 * Numbers this scene may show, and no others: 4, 2, 16, 14, 196, 194. The check quiz for
 * this topic used x + 1/x = 6 and x + 1/x = 8, so 6 and 8 must never appear.
 */

(function () {
  'use strict';

  var MathAnim = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./anim.js')
    : (typeof window !== 'undefined' ? window.MathAnim : undefined);
  if (!MathAnim) throw new Error('x-ladder.js: MathAnim host not found — load anim.js first');

  var kit = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./kit.js')
    : (MathAnim && MathAnim.kit);
  if (!kit) throw new Error('x-ladder.js: MathAnim.kit not found — load kit.js after anim.js and before this file');

  /* ---------------------------------------------------------------- constants */

  var START = 4;              // x + 1/x
  var START_SQUARED = 16;     // 4²
  var RUNG1 = 14;             // 16 − 2
  var RUNG1_SQUARED = 196;    // 14²
  var RUNG2 = 194;            // 196 − 2
  var MIDDLE = 2;             // the middle term, which is 2 whatever x is

  var RUNGS = [
    { expr: 'x + 1/x', value: START },
    { expr: 'x² + 1/x²', value: RUNG1 },
    { expr: 'x⁴ + 1/x⁴', value: RUNG2 }
  ];

  var PHASE = {
    askEnd: 8.0,
    refuseEnd: 11.0,
    rung1End: 17.0,
    rung2End: 23.0,
    holdEnd: 26.0
  };

  // The instants each rung's value is allowed to appear: after its own arithmetic has
  // finished being drawn, never before.
  var RUNG1_LANDS = 15.4;
  var RUNG2_LANDS = 21.6;

  /* ------------------------------------------------------------ local easing */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function ease(t0, t1, t) { return clamp((t - t0) / (t1 - t0), 0, 1); }
  function smooth(u) { return u * u * (3 - 2 * u); }

  function phaseFor(t) {
    if (t < PHASE.askEnd) return 'ask';
    if (t < PHASE.refuseEnd) return 'refuse';
    if (t < PHASE.rung1End) return 'rung1';
    if (t < PHASE.rung2End) return 'rung2';
    if (t < PHASE.holdEnd) return 'hold';
    return 'both';
  }

  /* -------------------------------------------------------------------- state */

  function state(t) {
    var phase = phaseFor(t);

    var ladderReveal = smooth(ease(0.3, 1.8, t));
    var topQuestion = smooth(ease(2.4, 4.0, t));

    // The route that is refused: solving for x.
    var refuseReveal = (t >= 8.0) ? smooth(ease(8.1, 8.9, t)) : 0;
    var refuseStrike = (t >= 9.1) ? smooth(ease(9.1, 10.2, t)) : 0;
    var refuseFall = (t >= 10.3) ? smooth(ease(10.3, 11.0, t)) : 0;

    // Rung one: square it, watch the middle term resolve to 2 and leave.
    var expand1 = (phase === 'rung1') ? smooth(ease(11.2, 12.4, t)) : (t >= 12.4 ? 1 : 0);
    var middle1 = (phase === 'rung1') ? smooth(ease(12.8, 13.8, t)) : (t >= 13.8 ? 1 : 0);
    var detach1 = (phase === 'rung1') ? smooth(ease(13.9, 14.9, t)) : (t >= 14.9 ? 1 : 0);
    var sum1 = (phase === 'rung1') ? smooth(ease(14.6, 15.4, t)) : (t >= 15.4 ? 1 : 0);

    // Rung two: the identical move, given the same room.
    var expand2 = (phase === 'rung2') ? smooth(ease(17.2, 18.4, t)) : (t >= 18.4 ? 1 : 0);
    var middle2 = (phase === 'rung2') ? smooth(ease(18.8, 19.8, t)) : (t >= 19.8 ? 1 : 0);
    var detach2 = (phase === 'rung2') ? smooth(ease(19.9, 20.9, t)) : (t >= 20.9 ? 1 : 0);
    var sum2 = (phase === 'rung2') ? smooth(ease(20.8, 21.6, t)) : (t >= 21.6 ? 1 : 0);

    // A rung's value is absent or final — never a number in motion. That is the whole
    // guard against a frame reading something like "x⁴ + 1/x⁴ = 173".
    var rung1Landed = t >= RUNG1_LANDS;
    var rung2Landed = t >= RUNG2_LANDS;

    var holdReveal = (phase === 'hold') ? smooth(ease(23.2, 24.2, t)) : (t >= 24.2 ? 1 : 0);
    var bothReveal = (phase === 'both') ? smooth(ease(26.2, 27.4, t)) : 0;
    var closingReveal = (phase === 'both') ? smooth(ease(28.6, 29.8, t)) : 0;

    return {
      t: t,
      phase: phase,

      start: START,
      startSquared: START_SQUARED,
      rung1: RUNG1,
      rung1Squared: RUNG1_SQUARED,
      rung2: RUNG2,
      middle: MIDDLE,

      ladderReveal: ladderReveal,
      topQuestion: topQuestion,

      refuseReveal: refuseReveal,
      refuseStrike: refuseStrike,
      refuseFall: refuseFall,

      expand1: expand1, middle1: middle1, detach1: detach1, sum1: sum1,
      expand2: expand2, middle2: middle2, detach2: detach2, sum2: sum2,

      rung1Landed: rung1Landed,
      rung2Landed: rung2Landed,

      holdReveal: holdReveal,
      bothReveal: bothReveal,
      closingReveal: closingReveal,

      // Which rung the eye should be on. Drives the highlight and the camera.
      focusRung: (phase === 'ask' || phase === 'refuse') ? 0 : (phase === 'rung1' ? 1 : 2)
    };
  }

  /* --------------------------------------------------------------------- draw */

  function cameraFor(t, view) {
    var unit = Math.min(view.width, view.height);
    var rise = smooth(ease(21.6, 23.4, t));
    var fall = smooth(ease(30.8, 32.0, t));
    var push = rise * (1 - fall);

    // A knock as each rung lands, and as the refused route is struck out.
    var knock = kit.pulseAt(t, RUNG1_LANDS, 0.3) + kit.pulseAt(t, RUNG2_LANDS, 0.3) +
      kit.pulseAt(t, 10.2, 0.3) * 0.7;

    return { scale: 1 + push * 0.045 - knock * 0.012, dx: 0, dy: knock * unit * 0.005 };
  }

  function contentBox(x0, y0, innerW, innerH) {
    var top = y0 + innerH * 0.22;
    return { x: x0, y: top, w: innerW, h: y0 + innerH - top, cx: x0 + innerW / 2 };
  }

  // One rung of the ladder: the expression on the left, its value on the right, or a
  // question mark where the value is not known yet. `lit` is 0..1.
  function drawRung(ctx, box, y, h, expr, value, lit, tokens, view, isFocus) {
    var unit = Math.min(view.width, view.height);
    var w = box.w * 0.96;
    var x = box.cx - w / 2;

    ctx.save();
    kit.roundRect(ctx, x, y - h / 2, w, h, h * 0.22);
    ctx.fillStyle = lit > 0.5 ? tokens.accentSoft : tokens.card;
    ctx.globalAlpha = 0.45 + 0.55 * lit;
    ctx.fill();
    ctx.strokeStyle = lit > 0.5 ? tokens.accent : tokens.line;
    ctx.lineWidth = Math.max(1.2, unit * (isFocus ? 0.0035 : 0.002));
    ctx.stroke();
    ctx.restore();

    kit.drawLabel(ctx, expr, x + w * 0.30, y + h * 0.16, tokens, {
      family: 'display', weight: '600', size: h * 0.42, minSize: 12,
      color: tokens.ink, alpha: 0.5 + 0.5 * lit, maxWidth: w * 0.52
    });

    // The value: either final or a question mark. Never a number in motion.
    var shown = (value === null || value === undefined) ? '?' : String(value);
    kit.drawLabel(ctx, shown, x + w * 0.79, y + h * 0.18, tokens, {
      family: 'display', weight: '700', size: h * 0.5, minSize: 14,
      color: (value === null || value === undefined) ? tokens.inkFaint : tokens.accent,
      alpha: 0.6 + 0.4 * lit, maxWidth: w * 0.34
    });

    // The equals sign that ties them, drawn as its own glyph so no string is ever
    // built by concatenating an expression with a moving value.
    kit.drawLabel(ctx, '=', x + w * 0.63, y + h * 0.16, tokens, {
      family: 'display', weight: '500', size: h * 0.36, minSize: 10,
      color: tokens.inkSoft, alpha: 0.4 + 0.5 * lit, maxWidth: w * 0.1
    });
  }

  var KEYWORDS = [
    { big: '', small: 'CLIMB, DO NOT SOLVE', start: 4.4, end: 7.7 },
    { big: '', small: 'NEVER FIND x', start: 9.2, end: 10.9 },
    { big: '', small: 'SQUARE IT, MINUS 2', start: 13.0, end: 16.6 },
    { big: '', small: 'AGAIN. SAME MOVE', start: 18.6, end: 22.4 },
    { big: '194', small: '', start: 23.6, end: 25.8 },
    { big: '', small: 'ALWAYS MINUS 2', start: 28.0, end: 31.8 }
  ];

  // The ladder itself, drawn in every phase so the climb is always the frame.
  function drawLadder(ctx, s, view, box) {
    var tokens = view.tokens;
    var h = box.h * 0.155;
    var gap = box.h * 0.055;
    // Bottom rung at the bottom: the picture is a climb, so it reads upwards.
    var ys = [
      box.y + box.h * 0.86,
      box.y + box.h * 0.86 - (h + gap),
      box.y + box.h * 0.86 - 2 * (h + gap)
    ];

    var values = [
      RUNGS[0].value,
      s.rung1Landed ? RUNGS[1].value : null,
      s.rung2Landed ? RUNGS[2].value : null
    ];
    var lits = [
      s.ladderReveal,
      s.rung1Landed ? 1 : 0.18 * s.ladderReveal,
      s.rung2Landed ? 1 : 0.18 * s.ladderReveal
    ];

    // The uprights of the ladder, behind the rungs.
    ctx.save();
    ctx.globalAlpha = 0.5 * s.ladderReveal;
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = Math.max(1.5, Math.min(view.width, view.height) * 0.004);
    var top = ys[2] - h / 2 - gap * 0.4;
    var bot = ys[0] + h / 2 + gap * 0.4;
    var lx = box.cx - box.w * 0.50, rx = box.cx + box.w * 0.50;
    ctx.beginPath();
    ctx.moveTo(lx, bot); ctx.lineTo(lx, top);
    ctx.moveTo(rx, bot); ctx.lineTo(rx, top);
    ctx.stroke();
    ctx.restore();

    for (var i = 0; i < 3; i++) {
      drawRung(ctx, box, ys[i], h, RUNGS[i].expr, values[i], lits[i], tokens, view, s.focusRung === i);
    }
    return { ys: ys, h: h };
  }

  // The working for one rung: the expansion, the middle term resolving to 2 and
  // detaching, then the subtraction. All strings fixed and true when visible.
  function drawWorking(ctx, s, view, box, geo, opts) {
    var tokens = view.tokens;
    var unit = Math.min(view.width, view.height);
    // The working sits in the band ABOVE the ladder's top rung. The top rung's own top
    // edge is at about 0.36 of the box, so everything here has to finish before that —
    // it did not, and the subtraction printed across the rung it was about to fill in.
    var y = box.y + box.h * 0.045;

    // The square, before anything is taken off it.
    if (opts.expand > 0.002) {
      kit.drawTrackedLabel(ctx, opts.squareLine, box.cx, y, tokens, {
        family: 'mono', weight: '600', size: Math.max(11, unit * 0.036),
        color: tokens.ink, alpha: opts.expand, tracking: 0.08, maxWidth: box.w * 0.96
      });
    }

    // The expansion, with the middle term called out: it is 2 whatever x is, which is
    // the reason the whole trick works without ever knowing x.
    if (opts.middle > 0.002) {
      kit.drawTrackedLabel(ctx, opts.expansionLine, box.cx, y + box.h * 0.075, tokens, {
        family: 'mono', weight: '500', size: Math.max(9, unit * 0.026),
        color: tokens.inkSoft, alpha: opts.middle, tracking: 0.06, maxWidth: box.w * 0.96
      });
    }

    // The 2, physically leaving.
    if (opts.detach > 0.002) {
      var chipH = box.h * 0.075;
      var chipW = chipH * 1.5;
      var driftX = box.w * 0.30 * opts.detach;
      var driftY = box.h * 0.05 * opts.detach;
      ctx.save();
      ctx.globalAlpha = 1 - 0.35 * opts.detach;
      kit.roundRect(ctx, box.cx + driftX - chipW / 2, y + box.h * 0.115 + driftY - chipH / 2, chipW, chipH, chipH * 0.3);
      ctx.fillStyle = tokens.warmSoft;
      ctx.fill();
      ctx.strokeStyle = tokens.warm;
      ctx.lineWidth = Math.max(1, unit * 0.002);
      ctx.stroke();
      kit.drawLabel(ctx, '− ' + MIDDLE, box.cx + driftX, y + box.h * 0.115 + driftY + chipH * 0.22, tokens, {
        family: 'display', weight: '700', size: chipH * 0.6, minSize: 10,
        color: tokens.warm, maxWidth: chipW * 0.86
      });
      ctx.restore();
    }

    // The subtraction, drawn only once the 2 has finished leaving.
    if (opts.sum > 0.002) {
      kit.drawTrackedLabel(ctx, opts.sumLine, box.cx, y + box.h * 0.215, tokens, {
        family: 'mono', weight: '600', size: Math.max(11, unit * 0.038),
        color: tokens.accent, alpha: opts.sum, tracking: 0.1, maxWidth: box.w * 0.96
      });
    }
  }

  function draw(ctx, s, view) {
    var W = view.width, H = view.height;
    var tokens = view.tokens;

    ctx.save();
    ctx.clearRect(0, 0, W, H);

    var cam = cameraFor(s.t, view);
    kit.applyCamera(ctx, view, cam);
    kit.drawGround(ctx, view);

    var area = kit.safeArea(view);
    var box = contentBox(area.x0, area.y0, area.innerW, area.innerH);
    var unit = Math.min(W, H);

    var geo = drawLadder(ctx, s, view, box);

    if (s.phase === 'ask') {
      kit.drawTrackedLabel(ctx, 'WHAT IS THE TOP RUNG?', box.cx, box.y + box.h * 0.10, tokens, {
        family: 'mono', weight: '600', size: Math.max(10, unit * 0.030),
        color: tokens.inkSoft, alpha: s.topQuestion, tracking: 0.16, maxWidth: box.w * 0.96
      });
    }

    if (s.phase === 'refuse') {
      // The route that is not taken. Struck out on sight, because the whole point is
      // that x is never found.
      kit.drawStrikeChip(ctx, box.cx, box.y + box.h * 0.12, box.w * 0.72, box.h * 0.10,
        tokens, 'SOLVE FOR x', s.refuseStrike, s.refuseFall);
    }

    if (s.phase === 'rung1') {
      drawWorking(ctx, s, view, box, geo, {
        squareLine: '4² = 16',
        expansionLine: 'x² + 2 + 1/x²  — THE MIDDLE IS ALWAYS 2',
        sumLine: '16 − 2 = 14',
        expand: s.expand1, middle: s.middle1, detach: s.detach1, sum: s.sum1
      });
    }

    if (s.phase === 'rung2') {
      drawWorking(ctx, s, view, box, geo, {
        squareLine: '14² = 196',
        expansionLine: 'x⁴ + 2 + 1/x⁴  — THE SAME MIDDLE 2',
        sumLine: '196 − 2 = 194',
        expand: s.expand2, middle: s.middle2, detach: s.detach2, sum: s.sum2
      });
    }

    if (s.phase === 'hold' && s.holdReveal > 0.002) {
      kit.drawTrackedLabel(ctx, 'AND x WAS NEVER FOUND', box.cx, box.y + box.h * 0.12, tokens, {
        family: 'mono', weight: '600', size: Math.max(10, unit * 0.030),
        color: tokens.inkSoft, alpha: s.holdReveal, tracking: 0.16, maxWidth: box.w * 0.96
      });
    }

    if (s.phase === 'both') {
      if (s.bothReveal > 0.002) {
        kit.drawTrackedLabel(ctx, 'SQUARE. MINUS 2. SQUARE. MINUS 2.', box.cx, box.y + box.h * 0.10, tokens, {
          family: 'mono', weight: '600', size: Math.max(10, unit * 0.028),
          color: tokens.ink, alpha: s.bothReveal, tracking: 0.1, maxWidth: box.w * 0.96
        });
      }
      if (s.closingReveal > 0.002) {
        kit.drawTrackedLabel(ctx, 'THE SECOND TIME IS THE SAME AS THE FIRST', box.cx, box.y + box.h * 0.165, tokens, {
          family: 'mono', weight: '500', size: Math.max(9, unit * 0.024),
          color: tokens.inkFaint, alpha: s.closingReveal, tracking: 0.1, maxWidth: box.w * 0.96
        });
      }
    }

    kit.drawKeywordPunch(ctx, tokens, view, area.x0, area.y0, area.innerW, area.innerH, KEYWORDS, s.t);

    ctx.restore(); // camera
    ctx.restore(); // outer
  }

  MathAnim.define({
    id: 'x-ladder',
    duration: 32,
    poster: 24,
    state: state,
    draw: draw,
    // The words and when they are wanted. HOW they are spoken lives in the video repo.
    script: [
      { at: 0.0, text: 'x plus one over x is four. What is x to the fourth, plus one over x to the fourth?' },
      { at: 8.0, text: 'You never find x. You climb.' },
      { at: 11.0, text: 'Square it. The middle term is always two, so take it off. Sixteen minus two is fourteen.' },
      { at: 17.0, text: 'Do it again. Fourteen squared is one hundred and ninety-six, minus two.' },
      { at: 23.0, text: 'One hundred and ninety-four.' },
      { at: 26.0, text: 'Same move twice. Always minus two.' }
    ]
  });
})();
