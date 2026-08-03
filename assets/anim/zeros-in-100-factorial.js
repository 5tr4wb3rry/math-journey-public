/* Math Journey — scene "zeros-in-100-factorial".
 *
 * Companion animation for public/lessons/counting-factors-and-divisors.html. Same
 * example, same numbers, no others: 100! ends in 24 zeros, and you find that by counting
 * fives, never by multiplying anything out.
 *
 * CONTRACT — a separate repo (reel-works) renders this to video by calling
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
 * EVERY FRAME MUST BE TRUE ON ITS OWN. A number that is mid-animation must never sit on
 * either side of an equals sign: an earlier scene shipped a frame reading "12/5 = 1.2
 * HOURS" because a decimal was interpolating while the fraction stayed put. Here the only
 * strings containing "=" are fixed ("2 × 5 = 10", "25 = 5 × 5", "20 + 4 = 24") and are
 * never assembled from a moving value. The running tally is an INTEGER derived from how
 * far the sweep has actually got, drawn on its own with a label and never inside an
 * equation, so it cannot claim to have reached a count it has not reached.
 *
 * Numbers this scene is allowed to show, and no others (they are the lesson's own worked
 * example; the check for this topic asks about 75!, 150! and 1080, which must never
 * appear): 100, 5, 20, 25, 50, 75, 4, 24, 2. The 10x10 field therefore draws marks, not
 * numerals — the only numerals in it are the four that come forward.
 */

(function () {
  'use strict';

  var MathAnim = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./anim.js')
    : (typeof window !== 'undefined' ? window.MathAnim : undefined);
  if (!MathAnim) throw new Error('zeros-in-100-factorial.js: MathAnim host not found — load anim.js first');

  var kit = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./kit.js')
    : (MathAnim && MathAnim.kit);
  if (!kit) throw new Error('zeros-in-100-factorial.js: MathAnim.kit not found — load kit.js after anim.js and before this file');

  /* ---------------------------------------------------------------- constants */

  var N = 100;                 // the factorial we are counting the zeros of
  var FIVE = 5;                // the bottleneck prime
  var MULTIPLES_OF_FIVE = 20;  // how many multiples of 5 there are in 1..100 — 100 / 5
  var EXTRAS = [25, 50, 75, 100]; // the ones carrying a SECOND five (each is a multiple of 25)
  var EXTRA_COUNT = EXTRAS.length; // 4
  var TOTAL_FIVES = MULTIPLES_OF_FIVE + EXTRA_COUNT; // 20 + 4 = 24, and that is the answer

  // The instant each extra five is credited to the tally. Each sits after that extra's
  // own split has finished drawing, so the counter never ticks before the picture has
  // shown why. Fixed constants, never derived from a clock.
  var CREDIT_AT = [19.0, 23.6, 25.2, 26.8];

  // The window in which each extra is the one on stage. 25 gets the long one: it is where
  // the idea is taught, and the other three are then the same move repeated.
  var EXTRA_WINDOW = [
    { start: 17.4, end: 22.0 },
    { start: 22.0, end: 23.6 },
    { start: 23.6, end: 25.2 },
    { start: 25.2, end: 27.5 }
  ];

  var PHASE = {
    askEnd: 7.0,
    pivotEnd: 11.0,
    sweepEnd: 17.0,
    extrasEnd: 27.5
  };

  var SWEEP_FROM = 12.2, SWEEP_TO = 16.2; // the field lights up across this window

  /* ------------------------------------------------------------ local easing
   * Thin wrappers over the kit's curves so the phase logic below reads as arithmetic.
   * Pure: same inputs, same outputs, no memory. */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function ease(t0, t1, t) { return clamp((t - t0) / (t1 - t0), 0, 1); }
  function smooth(u) { return u * u * (3 - 2 * u); }

  function phaseFor(t) {
    if (t < PHASE.askEnd) return 'ask';
    if (t < PHASE.pivotEnd) return 'pivot';
    if (t < PHASE.sweepEnd) return 'sweep';
    if (t < PHASE.extrasEnd) return 'extras';
    return 'final';
  }

  // How many of the four extra fives have been credited by time t. An integer, counted by
  // comparing t against fixed instants — so the tally can only ever be a number the
  // animation has already justified on screen.
  function extrasCreditedAt(t) {
    var n = 0;
    for (var i = 0; i < CREDIT_AT.length; i++) if (t >= CREDIT_AT[i]) n++;
    return n;
  }

  // Which extra is on stage at time t, and how far through its reveal/split it is.
  // Returns null outside every window.
  function extraOnStage(t) {
    for (var i = 0; i < EXTRA_WINDOW.length; i++) {
      var w = EXTRA_WINDOW[i];
      if (t >= w.start && t < w.end) {
        var span = w.end - w.start;
        var appear = smooth(ease(w.start, w.start + Math.min(0.5, span * 0.3), t));
        var split = smooth(ease(w.start + span * 0.25, w.start + span * 0.6, t));
        return { index: i, value: EXTRAS[i], appear: appear, split: split };
      }
    }
    return null;
  }

  /* -------------------------------------------------------------------- state
   * Pure: a plain object of numbers, booleans and short strings, nothing else. No
   * drawing, no DOM, no canvas — draw() is the only place pixels happen. */

  function state(t) {
    var phase = phaseFor(t);

    // Beat 1 — the question.
    var askReveal = smooth(ease(0.3, 1.8, t));
    var productReveal = smooth(ease(1.7, 3.3, t));
    var tailReveal = smooth(ease(3.6, 5.2, t));

    // Beat 2 — a 2 and a 5 click together into a 10, then the scarcity of fives.
    var pairApproach = (t >= 7.0) ? smooth(ease(7.2, 8.6, t)) : 0;
    var pairClicked = (t >= 8.6) ? smooth(ease(8.6, 9.1, t)) : 0;
    var scarcity = (t >= 9.2) ? smooth(ease(9.2, 10.6, t)) : 0;

    // Beat 3 — the field of 100 lights up, every fifth mark, and the tally follows it.
    var gridReveal = 0;
    if (phase === 'sweep') gridReveal = smooth(ease(11.0, 12.2, t));
    else if (phase === 'extras' || phase === 'final') gridReveal = 1;

    // The sweep is an INTEGER position in 1..100, so the tally below is a genuine count
    // of marks already lit rather than a rounded fraction of one.
    var sweepIndex = 0;
    if (phase === 'sweep') sweepIndex = Math.floor(N * ease(SWEEP_FROM, SWEEP_TO, t));
    else if (phase === 'extras' || phase === 'final') sweepIndex = N;

    var multiplesLit = Math.floor(sweepIndex / FIVE); // exact count of multiples of 5 <= sweepIndex

    // Beats 4 and 5 — the four numbers that carry a second five.
    var extra = extraOnStage(t);
    var extrasCredited = (phase === 'extras' || phase === 'final') ? extrasCreditedAt(t) : 0;

    // The one number on screen that moves. During the sweep it is the count of multiples
    // lit so far; from the extras on it is that 20 plus however many second fives have
    // been credited. Always an integer, always already earned by the picture.
    var tally = 0;
    if (phase === 'sweep') tally = multiplesLit;
    else if (phase === 'extras' || phase === 'final') tally = MULTIPLES_OF_FIVE + extrasCredited;
    var tallyLabel = (phase === 'sweep') ? 'MULTIPLES OF 5' : 'FIVES COUNTED';
    var tallyVisible = (phase === 'sweep' || phase === 'extras' || phase === 'final');

    // Beat 6 — the sum and the answer.
    var sumReveal = (phase === 'final') ? smooth(ease(27.8, 29.0, t)) : 0;
    var answerReveal = (phase === 'final') ? smooth(ease(29.6, 30.8, t)) : 0;
    var closingReveal = (phase === 'final') ? smooth(ease(31.6, 33.0, t)) : 0;

    return {
      t: t,
      phase: phase,

      n: N,
      five: FIVE,
      multiplesOfFive: MULTIPLES_OF_FIVE,
      extraCount: EXTRA_COUNT,
      totalFives: TOTAL_FIVES,

      askReveal: askReveal,
      productReveal: productReveal,
      tailReveal: tailReveal,

      pairApproach: pairApproach,
      pairClicked: pairClicked,
      scarcity: scarcity,

      gridReveal: gridReveal,
      sweepIndex: sweepIndex,
      multiplesLit: multiplesLit,

      extraIndex: extra ? extra.index : -1,
      extraValue: extra ? extra.value : 0,
      extraAppear: extra ? extra.appear : 0,
      extraSplit: extra ? extra.split : 0,
      extrasCredited: extrasCredited,

      tally: tally,
      tallyLabel: tallyLabel,
      tallyVisible: tallyVisible,

      sumReveal: sumReveal,
      answerReveal: answerReveal,
      closingReveal: closingReveal,

      // True exactly when the tally has reached the answer. Nothing draws "24" as a
      // result before this is true.
      answerReached: (MULTIPLES_OF_FIVE + extrasCredited) === TOTAL_FIVES && (phase === 'extras' || phase === 'final')
    };
  }

  /* --------------------------------------------------------------------- draw
   * Pure: reads only ctx, s, view. Clears its own frame first. Every size is derived
   * from view.width/view.height so the same scene composes at 1080x1920 (tall, which is
   * what matters) and 1920x1080 (wide). Colour comes from view.tokens only — there is no
   * literal hex anywhere below. Generic vocabulary (easing, background, camera, text,
   * chips, keyword punch-ins) is kit's; what is here is this scene's own field-of-100,
   * its splitting numbers and its tally. */

  /* ---- camera: one global transform, a pure function of t ---- */

  function cameraFor(t, view) {
    var unit = Math.min(view.width, view.height);

    // Push in through the answer, settle back out at the very end.
    var rise = smooth(ease(29.0, 30.6, t));
    var fall = smooth(ease(32.8, 34.0, t));
    var push = rise * (1 - fall);

    // A knock at the 2x5 click, and one at each extra five being credited.
    var knock = kit.pulseAt(t, 9.1, 0.35);
    for (var i = 0; i < CREDIT_AT.length; i++) knock += kit.pulseAt(t, CREDIT_AT[i], 0.3);

    return {
      scale: 1 + push * 0.04 - knock * 0.012,
      dx: 0,
      dy: knock * unit * 0.005
    };
  }

  /* ---- content box: everything below the keyword punch-in band ---- */

  function contentBox(x0, y0, innerW, innerH) {
    var top = y0 + innerH * 0.24;
    return { x: x0, y: top, w: innerW, h: y0 + innerH - top, cx: x0 + innerW / 2 };
  }

  /* ---- a rounded chip carrying one short string ---- */

  function drawChip(ctx, cx, cy, w, h, text, tokens, fillToken, textToken, alpha, view) {
    if (alpha <= 0.002) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    kit.roundRect(ctx, cx - w / 2, cy - h / 2, w, h, Math.min(w, h) * 0.28);
    ctx.fillStyle = fillToken;
    ctx.fill();
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = Math.max(1, Math.min(view.width, view.height) * 0.0018);
    ctx.stroke();
    kit.drawLabel(ctx, text, cx, cy + h * 0.34, tokens, {
      family: 'display', weight: '700', size: h * 0.62, minSize: 12,
      color: textToken, maxWidth: w * 0.84
    });
    ctx.restore();
  }

  /* ---- keyword punch-ins: at most four words at a time, numbers biggest ---- */

  var KEYWORDS = [
    { big: '', small: 'HOW MANY ZEROS?', start: 1.9, end: 6.6 },
    { big: '', small: 'COUNT THE FIVES', start: 8.9, end: 10.8 },
    { big: '20', small: 'MULTIPLES OF FIVE', start: 15.0, end: 16.9 },
    { big: '', small: 'TWENTY-FIVE HAS TWO', start: 18.4, end: 21.6 },
    { big: '4', small: 'EXTRA FIVES', start: 23.0, end: 27.2 },
    // The final beat's own big "24" is the payoff and is drawn by drawFinalScene —
    // repeating it up here would state the answer twice on the same frame.
    { big: '', small: 'COUNT, DO NOT MULTIPLY', start: 30.8, end: 33.9 }
  ];

  /* ---- beat 1: the question ---- */

  function drawAskScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var box = contentBox(x0, y0, innerW, innerH);
    var unit = Math.min(view.width, view.height);

    var pop = 0.82 + 0.18 * kit.easeOutBack(s.askReveal);
    kit.drawLabel(ctx, s.n + '!', box.cx, box.y + box.h * 0.42, tokens, {
      family: 'display', weight: '700', size: unit * 0.30 * pop, minSize: 24,
      color: tokens.ink, alpha: s.askReveal, maxWidth: box.w * 0.9
    });

    kit.drawTrackedLabel(ctx, '1 × 2 × 3 × 4 × 5 ⋯ × 100', box.cx, box.y + box.h * 0.60, tokens, {
      family: 'mono', weight: '500', size: Math.max(10, unit * 0.036),
      color: tokens.inkSoft, alpha: s.productReveal, tracking: 0.06, maxWidth: box.w * 0.94
    });

    // The tail of zeros the question is about — drawn as a question, never as a count.
    ctx.save();
    ctx.globalAlpha = s.tailReveal;
    kit.drawTrackedLabel(ctx, 'ENDS IN', box.cx, box.y + box.h * 0.76, tokens, {
      family: 'mono', weight: '600', size: Math.max(9, unit * 0.026),
      color: tokens.inkFaint, tracking: 0.2, maxWidth: box.w * 0.9
    });
    kit.drawLabel(ctx, '0 0 0 0 ?', box.cx, box.y + box.h * 0.88, tokens, {
      family: 'display', weight: '700', size: unit * 0.085, minSize: 16,
      color: tokens.accent, maxWidth: box.w * 0.88
    });
    ctx.restore();
  }

  /* ---- beat 2: a 2 and a 5 click into a 10; fives are the scarce half ---- */

  function drawPivotScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var box = contentBox(x0, y0, innerW, innerH);
    var unit = Math.min(view.width, view.height);

    var chipH = box.h * 0.16;
    var chipW = chipH * 1.15;
    var rowY = box.y + box.h * 0.26;
    var spread = box.w * 0.24 * (1 - s.pairApproach) + chipW * 0.62;

    // Before the click: a 2 and a 5 closing on each other. After: a single 10.
    var pairAlpha = 1 - s.pairClicked;
    drawChip(ctx, box.cx - spread, rowY, chipW, chipH, '2', tokens, tokens.card, tokens.inkSoft, pairAlpha, view);
    drawChip(ctx, box.cx + spread, rowY, chipW, chipH, String(FIVE), tokens, tokens.accentSoft, tokens.accent, pairAlpha, view);

    if (s.pairClicked > 0.002) {
      var grow = 0.85 + 0.15 * kit.easeOutBack(s.pairClicked);
      drawChip(ctx, box.cx, rowY, chipW * 1.5 * grow, chipH * grow, '10', tokens, tokens.accentSoft, tokens.accent, s.pairClicked, view);
      // A fixed, always-true statement — never assembled from a moving number.
      kit.drawTrackedLabel(ctx, '2 × 5 = 10', box.cx, rowY + chipH * 1.25, tokens, {
        family: 'mono', weight: '600', size: Math.max(10, unit * 0.03),
        color: tokens.inkSoft, alpha: s.pairClicked, tracking: 0.14, maxWidth: box.w * 0.8
      });
    }

    // Twos are dense, fives are sparse: the reason the fives are what gets counted.
    if (s.scarcity > 0.002) {
      ctx.save();
      ctx.globalAlpha = s.scarcity;
      var stripW = box.w * 0.82;
      var stripX = box.cx - stripW / 2;
      var markH = box.h * 0.045;
      var rows = [
        { y: box.y + box.h * 0.60, label: 'TWOS — EVERYWHERE', count: 34, color: tokens.inkFaint },
        { y: box.y + box.h * 0.82, label: 'FIVES — SCARCE', count: 7, color: tokens.accent }
      ];
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var step = stripW / row.count;
        var markW = Math.max(1.5, step * 0.34);
        ctx.fillStyle = row.color;
        for (var i = 0; i < row.count; i++) {
          var mx = stripX + step * (i + 0.5) - markW / 2;
          kit.roundRect(ctx, mx, row.y - markH / 2, markW, markH, markW * 0.4);
          ctx.fill();
        }
        kit.drawTrackedLabel(ctx, row.label, box.cx, row.y + markH * 1.9, tokens, {
          family: 'mono', weight: '600', size: Math.max(9, unit * 0.024),
          color: tokens.inkSoft, tracking: 0.16, maxWidth: box.w * 0.9
        });
      }
      ctx.restore();
    }
  }

  /* ---- the field of 100: geometry, then the marks ---- */

  function fieldGeometry(box, shrink) {
    var side = Math.min(box.w * 0.86, box.h * 0.62) * shrink;
    var cell = side / 10;
    return {
      x: box.cx - side / 2,
      y: box.y + box.h * (shrink < 1 ? 0.02 : 0.10),
      side: side,
      cell: cell
    };
  }

  // Draws the 10x10 field. Marks only, never numerals — the only numbers this scene is
  // allowed to write are the lesson's own. `lit` is how far the sweep has got (0..100),
  // `ringExtras` outlines the four that carry a second five.
  function drawField(ctx, s, view, geo, alpha, ringExtras) {
    if (alpha <= 0.002) return;
    var tokens = view.tokens;
    var cell = geo.cell;
    var pad = cell * 0.18;
    var r = cell * 0.22;

    ctx.save();
    ctx.globalAlpha = alpha;
    for (var n = 1; n <= N; n++) {
      var col = (n - 1) % 10;
      var row = Math.floor((n - 1) / 10);
      var cx = geo.x + col * cell;
      var cy = geo.y + row * cell;
      var isFive = (n % FIVE === 0);
      var reached = n <= s.sweepIndex;

      kit.roundRect(ctx, cx + pad, cy + pad, cell - pad * 2, cell - pad * 2, r);
      if (isFive && reached) {
        ctx.fillStyle = tokens.accent;
        ctx.fill();
      } else if (reached) {
        ctx.fillStyle = tokens.line;
        ctx.fill();
      } else {
        ctx.fillStyle = tokens.card;
        ctx.fill();
        ctx.strokeStyle = tokens.line;
        ctx.lineWidth = Math.max(0.6, cell * 0.03);
        ctx.stroke();
      }

      if (ringExtras && (n % 25 === 0)) {
        ctx.strokeStyle = tokens.warm;
        ctx.lineWidth = Math.max(1.2, cell * 0.10);
        kit.roundRect(ctx, cx + pad * 0.4, cy + pad * 0.4, cell - pad * 0.8, cell - pad * 0.8, r * 1.3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---- the tally: one integer, on its own, never inside an equation ---- */

  function drawTally(ctx, s, view, box, cy) {
    var tokens = view.tokens;
    var unit = Math.min(view.width, view.height);

    // A brief swell at each instant the count changes, so a tick is felt as well as read.
    var swell = kit.pulseAt(s.t, 19.0, 0.28) + kit.pulseAt(s.t, 23.6, 0.28) +
      kit.pulseAt(s.t, 25.2, 0.28) + kit.pulseAt(s.t, 26.8, 0.28);

    kit.drawTrackedLabel(ctx, s.tallyLabel, box.cx, cy - unit * 0.045, tokens, {
      family: 'mono', weight: '600', size: Math.max(9, unit * 0.024),
      color: tokens.inkFaint, tracking: 0.18, maxWidth: box.w * 0.8
    });
    kit.drawLabel(ctx, String(s.tally), box.cx, cy + unit * 0.045, tokens, {
      family: 'display', weight: '700', size: unit * 0.13 * (1 + swell * 0.08), minSize: 18,
      color: tokens.ink, maxWidth: box.w * 0.6
    });
  }

  /* ---- beat 3: the sweep ---- */

  function drawSweepScene(ctx, s, view, x0, y0, innerW, innerH) {
    var box = contentBox(x0, y0, innerW, innerH);
    var geo = fieldGeometry(box, 1);
    drawField(ctx, s, view, geo, s.gridReveal, false);
    if (s.tallyVisible) drawTally(ctx, s, view, box, geo.y + geo.side + box.h * 0.16);
  }

  /* ---- beats 4 and 5: the four numbers that carry a second five ---- */

  function drawExtrasScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var box = contentBox(x0, y0, innerW, innerH);
    var unit = Math.min(view.width, view.height);

    var geo = fieldGeometry(box, 0.62);
    drawField(ctx, s, view, geo, 0.5, true);

    var stageY = geo.y + geo.side + box.h * 0.14;

    if (s.extraIndex >= 0) {
      var chipH = box.h * 0.12;
      var chipW = chipH * 1.9;
      var appear = s.extraAppear;

      // The number and the two fives it splits into occupy SEPARATE ROWS. Sharing a
      // row put the number between its own two fives mid-split, which reads as
      // "5 × 25 × 5" — a product this scene never claims and that is not even true.
      var numberY = stageY;
      var pairY = stageY + chipH * 1.30;

      // The number, dropping away as the fives it contains take over below it.
      drawChip(ctx, box.cx, numberY, chipW, chipH, String(s.extraValue), tokens,
        tokens.warmSoft, tokens.warm, appear * (1 - s.extraSplit), view);

      if (s.extraSplit > 0.002) {
        var fiveW = chipH * 1.05;
        var apart = chipW * 0.55;
        drawChip(ctx, box.cx - apart, pairY, fiveW, chipH, String(FIVE), tokens,
          tokens.accentSoft, tokens.accent, s.extraSplit, view);
        drawChip(ctx, box.cx + apart, pairY, fiveW, chipH, String(FIVE), tokens,
          tokens.accentSoft, tokens.accent, s.extraSplit, view);
        kit.drawLabel(ctx, '×', box.cx, pairY + chipH * 0.18, tokens, {
          family: 'display', weight: '600', size: chipH * 0.5, minSize: 10,
          color: tokens.inkSoft, alpha: s.extraSplit, maxWidth: chipW * 0.3
        });
      }

      // 25 is where the idea is taught, and its equation is fixed and always true. The
      // other three repeat the move, and say so in words rather than in a new equation.
      var caption = (s.extraIndex === 0) ? '25 = 5 × 5' : String(s.extraValue) + ' HAS TWO FIVES';
      kit.drawTrackedLabel(ctx, caption, box.cx, pairY + chipH * 1.05, tokens, {
        family: 'mono', weight: '600', size: Math.max(10, unit * 0.03),
        color: tokens.inkSoft, alpha: appear, tracking: 0.12, maxWidth: box.w * 0.9
      });

      if (s.extraIndex === 0) {
        kit.drawTrackedLabel(ctx, 'COUNTED ONCE — OWES ONE MORE', box.cx, pairY + chipH * 1.55, tokens, {
          family: 'mono', weight: '500', size: Math.max(9, unit * 0.024),
          color: tokens.warm, alpha: smooth(ease(19.2, 20.2, s.t)), tracking: 0.12, maxWidth: box.w * 0.94
        });
      }
    }

    drawTally(ctx, s, view, box, box.y + box.h * 0.93);
  }

  /* ---- beat 6: the sum, the answer, and the point ---- */

  function drawFinalScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var box = contentBox(x0, y0, innerW, innerH);
    var unit = Math.min(view.width, view.height);

    var geo = fieldGeometry(box, 0.62);
    drawField(ctx, s, view, geo, 0.22, true);

    // Laid out from the BOTTOM of the safe area upwards, so the closing line always
    // has its own room and the answer can never grow down into it. Measuring from the
    // top is what let "ZEROS" and the closing line print on top of each other.
    var bottom = box.y + box.h;
    var closingY = bottom - box.h * 0.02;
    var zerosY = bottom - box.h * 0.13;
    var answerY = bottom - box.h * 0.19;
    var sumY = bottom - box.h * 0.42;

    // A fixed string: 20 + 4 = 24 is true whenever it is on screen, and by now the tally
    // has actually reached 24 (answerReached), so the picture has earned it.
    if (s.sumReveal > 0.002 && s.answerReached) {
      kit.drawTrackedLabel(ctx, '20 + 4 = 24', box.cx, sumY, tokens, {
        family: 'mono', weight: '600', size: Math.max(11, unit * 0.038),
        color: tokens.inkSoft, alpha: s.sumReveal, tracking: 0.12, maxWidth: box.w * 0.9
      });
    }

    if (s.answerReveal > 0.002) {
      var pop = 0.86 + 0.14 * kit.easeOutBack(s.answerReveal);
      kit.drawLabel(ctx, String(s.totalFives), box.cx, answerY, tokens, {
        family: 'display', weight: '700', size: unit * 0.24 * pop, minSize: 24,
        color: tokens.accent, alpha: s.answerReveal, maxWidth: box.w * 0.9
      });
      kit.drawTrackedLabel(ctx, 'ZEROS', box.cx, zerosY, tokens, {
        family: 'mono', weight: '600', size: Math.max(10, unit * 0.03),
        color: tokens.inkSoft, alpha: s.answerReveal, tracking: 0.24, maxWidth: box.w * 0.7
      });
    }

    if (s.closingReveal > 0.002) {
      kit.drawTrackedLabel(ctx, 'AND YOU NEVER MULTIPLIED', box.cx, closingY, tokens, {
        family: 'mono', weight: '500', size: Math.max(9, unit * 0.026),
        color: tokens.inkFaint, alpha: s.closingReveal, tracking: 0.12, maxWidth: box.w * 0.96
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
      case 'ask':
        drawAskScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'pivot':
        drawPivotScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'sweep':
        drawSweepScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'extras':
        drawExtrasScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'final':
        drawFinalScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
    }

    kit.drawKeywordPunch(ctx, view.tokens, view, x0, y0, innerW, innerH, KEYWORDS, s.t);

    ctx.restore(); // camera
    ctx.restore(); // outer
  }

  MathAnim.define({
    id: 'zeros-in-100-factorial',
    duration: 34,
    poster: 31,
    state: state,
    draw: draw,
    // The words and when they are wanted. HOW they are spoken — speed, pitch, the
    // silence held before a payoff — is production direction and is deliberately not
    // here: it lives in the video repo, one file per scene, so this stays a lesson
    // asset rather than render configuration in a published folder.
    script: [
      { at: 0.0, text: 'How many zeros does one times two times three, all the way up to a hundred, end with?' },
      { at: 7.0, text: 'You never multiply it out. You count fives.' },
      { at: 11.0, text: 'Every multiple of five brings a five. There are twenty of those.' },
      { at: 17.0, text: 'But twenty-five is five times five. It brings two.' },
      { at: 22.0, text: 'So do fifty, seventy-five and a hundred. Four extra fives.' },
      { at: 27.5, text: 'Twenty plus four.' },
      { at: 30.0, text: 'Twenty-four zeros, and you never did the multiplication.' }
    ]
  });
})();
