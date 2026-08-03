/* Math Journey — scene "choose-vs-arrange".
 *
 * Companion animation for public/lessons/choosing-vs-arranging-combinations.html. Same
 * example, same numbers, no others: how many 3-digit numbers have strictly increasing
 * digits? Pick any 3 different digits from 1..9 and exactly one of their six orderings
 * climbs, so the answer is 9 x 8 x 7 divided by 6 = 84.
 *
 * CONTRACT — a separate repo (reel-works) renders this to video by calling
 * scene.render(ctx, t, view) for arbitrary scene times, in arbitrary order, timed to
 * synthesised narration instead of wall-clock playback. That only works if state(t) and
 * draw() are PURE functions of their arguments:
 *   - same t always produces the identical state object (deep-equal) and identical pixels
 *   - no Math.random, Date, Date.now, performance.now, setTimeout/setInterval,
 *     requestAnimationFrame, CSS transitions, or any module-level variable that gets
 *     mutated between calls
 *   - draw() reads only from the state object and view; it clears its own frame first
 *
 * EVERY FRAME MUST BE TRUE ON ITS OWN. The equations drawn here are fixed strings that
 * are true whenever they are visible ("1 < 4 < 8", "9 × 8 × 7 = 504", "504 ÷ 6 = 84"),
 * never assembled from a value that is mid-animation. The six orderings are GENERATED
 * (permutations of the chosen digits in lexicographic order), not typed out, so the
 * claim "exactly one of these climbs" is computed rather than asserted — a verification
 * script re-checks it against the drawn rows.
 *
 * Numbers this scene may show, and no others (the lesson's own worked example; the
 * check quiz for this topic uses 7 people, committees of 3 and 15 handshakes, so 15
 * must never appear): the digits 1-9, 3, 148, 155, 9, 8, 7, 504, 6, 84, plus the six
 * orderings of {1,4,8} which are the demonstration itself.
 */

(function () {
  'use strict';

  var MathAnim = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./anim.js')
    : (typeof window !== 'undefined' ? window.MathAnim : undefined);
  if (!MathAnim) throw new Error('choose-vs-arrange.js: MathAnim host not found — load anim.js first');

  var kit = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./kit.js')
    : (MathAnim && MathAnim.kit);
  if (!kit) throw new Error('choose-vs-arrange.js: MathAnim.kit not found — load kit.js after anim.js and before this file');

  /* ---------------------------------------------------------------- constants */

  var SLOTS = 3;                       // a 3-digit number
  var DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];  // the digits available (no 0: it can't lead)
  var CHOICES = [9, 8, 7];             // choices for the first, second and third pick
  var ORDERED_TOTAL = 504;             // 9 x 8 x 7
  var ORDERINGS_PER_SET = 6;           // 3! — how many ways to arrange 3 chosen digits
  var ANSWER = 84;                     // 504 / 6
  var YES_NUMBER = 148;                // climbs: 1 < 4 < 8
  var NO_NUMBER = 155;                 // stalls: 5 is not less than 5
  var EXAMPLE_SET = [1, 4, 8];         // the set whose six orderings get laid out

  // Every ordering of EXAMPLE_SET, generated in lexicographic order rather than typed
  // out, so "exactly one of these increases" is a computed fact about what is drawn.
  function permutationsOf(items) {
    if (items.length <= 1) return [items.slice()];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var rest = items.slice(0, i).concat(items.slice(i + 1));
      var sub = permutationsOf(rest);
      for (var j = 0; j < sub.length; j++) out.push([items[i]].concat(sub[j]));
    }
    return out;
  }

  function isIncreasing(digits) {
    for (var i = 1; i < digits.length; i++) if (!(digits[i] > digits[i - 1])) return false;
    return true;
  }

  var ORDERINGS = permutationsOf(EXAMPLE_SET.slice().sort(function (a, b) { return a - b; }));

  var PHASE = {
    askEnd: 6.0,
    testEnd: 11.0,
    slotsEnd: 15.5,
    countEnd: 22.0,
    orderingsEnd: 26.0,
    divideEnd: 29.5
  };

  // When each of the three picks lands, and when each losing ordering falls away.
  var PICK_AT = [16.6, 18.0, 19.4];
  var FALL_FROM = 23.6;      // the first wrong ordering starts falling here
  var FALL_STEP = 0.42;      // and the rest follow at this spacing

  /* ------------------------------------------------------------ local easing */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function ease(t0, t1, t) { return clamp((t - t0) / (t1 - t0), 0, 1); }
  function smooth(u) { return u * u * (3 - 2 * u); }

  function phaseFor(t) {
    if (t < PHASE.askEnd) return 'ask';
    if (t < PHASE.testEnd) return 'test';
    if (t < PHASE.slotsEnd) return 'slots';
    if (t < PHASE.countEnd) return 'count';
    if (t < PHASE.orderingsEnd) return 'orderings';
    if (t < PHASE.divideEnd) return 'divide';
    return 'final';
  }

  /* -------------------------------------------------------------------- state */

  function state(t) {
    var phase = phaseFor(t);

    var askReveal = smooth(ease(0.3, 1.7, t));
    var arrowReveal = smooth(ease(1.8, 3.4, t));

    // Beat 2: 148 accepted, 155 rejected, and why.
    var yesReveal = (t >= 6.0) ? smooth(ease(6.2, 7.2, t)) : 0;
    var noReveal = (t >= 7.6) ? smooth(ease(7.8, 8.8, t)) : 0;
    var noStrike = (t >= 8.9) ? smooth(ease(8.9, 10.0, t)) : 0;

    // Beat 3: three empty slots, filled from the digit row.
    var slotsReveal = 0;
    if (phase === 'slots') slotsReveal = smooth(ease(11.0, 12.0, t));
    else if (phase !== 'ask' && phase !== 'test') slotsReveal = 1;

    var filled = 0;
    if (phase === 'slots') {
      filled = Math.floor(clamp((t - 12.4) / 0.9, 0, SLOTS));
    } else if (phase === 'count' || phase === 'orderings' || phase === 'divide' || phase === 'final') {
      filled = SLOTS;
    }

    // Beat 4: the ordered count. Each pick's number appears at a fixed instant, and
    // the product is only ever drawn once all three are showing.
    var picksShown = 0;
    if (phase === 'count') {
      for (var i = 0; i < PICK_AT.length; i++) if (t >= PICK_AT[i]) picksShown++;
    } else if (phase === 'orderings' || phase === 'divide' || phase === 'final') {
      picksShown = CHOICES.length;
    }
    var productReveal = (picksShown === CHOICES.length && (phase === 'count' || phase === 'orderings'))
      ? smooth(ease(20.0, 21.0, t)) : (phase === 'divide' || phase === 'final' ? 1 : 0);

    // Beat 5: the six orderings. Each losing row falls at its own fixed instant; the
    // one that climbs stays. Which one that is comes from isIncreasing(), not a
    // hardcoded index.
    var orderingsReveal = (phase === 'orderings') ? smooth(ease(22.1, 23.1, t)) : (phase === 'divide' || phase === 'final' ? 1 : 0);
    var rows = [];
    var loserIndex = 0;
    for (var r = 0; r < ORDERINGS.length; r++) {
      var climbs = isIncreasing(ORDERINGS[r]);
      var fall = 0;
      if (!climbs) {
        var at = FALL_FROM + loserIndex * FALL_STEP;
        loserIndex++;
        if (phase === 'orderings') fall = smooth(ease(at, at + 0.55, t));
        else if (phase === 'divide' || phase === 'final') fall = 1;
      }
      rows.push({ digits: ORDERINGS[r].slice(), climbs: climbs, fall: fall });
    }
    var climbingCount = 0;
    for (var c = 0; c < rows.length; c++) if (rows[c].climbs) climbingCount++;

    // Beat 6: the division, then the answer.
    var divideReveal = (phase === 'divide') ? smooth(ease(26.2, 27.4, t)) : (phase === 'final' ? 1 : 0);
    var answerReveal = (phase === 'final') ? smooth(ease(29.7, 30.9, t)) : 0;
    var closingReveal = (phase === 'final') ? smooth(ease(31.6, 32.8, t)) : 0;

    return {
      t: t,
      phase: phase,

      slots: SLOTS,
      digits: DIGITS.slice(),
      choices: CHOICES.slice(),
      orderedTotal: ORDERED_TOTAL,
      orderingsPerSet: ORDERINGS_PER_SET,
      answer: ANSWER,
      yesNumber: YES_NUMBER,
      noNumber: NO_NUMBER,
      exampleSet: EXAMPLE_SET.slice(),

      askReveal: askReveal,
      arrowReveal: arrowReveal,

      yesReveal: yesReveal,
      noReveal: noReveal,
      noStrike: noStrike,

      slotsReveal: slotsReveal,
      filled: filled,

      picksShown: picksShown,
      productReveal: productReveal,

      orderingsReveal: orderingsReveal,
      rows: rows,
      climbingCount: climbingCount,

      divideReveal: divideReveal,
      answerReveal: answerReveal,
      closingReveal: closingReveal
    };
  }

  /* --------------------------------------------------------------------- draw */

  function cameraFor(t, view) {
    var unit = Math.min(view.width, view.height);
    var rise = smooth(ease(29.9, 31.2, t));
    var fall = smooth(ease(33.0, 34.0, t));
    var push = rise * (1 - fall);

    // A knock as 155 is struck out, and one as each losing ordering drops away.
    var knock = kit.pulseAt(t, 10.0, 0.32);
    for (var i = 0; i < 5; i++) knock += kit.pulseAt(t, FALL_FROM + i * FALL_STEP + 0.3, 0.22) * 0.6;

    return { scale: 1 + push * 0.04 - knock * 0.010, dx: 0, dy: knock * unit * 0.004 };
  }

  function contentBox(x0, y0, innerW, innerH) {
    var top = y0 + innerH * 0.24;
    return { x: x0, y: top, w: innerW, h: y0 + innerH - top, cx: x0 + innerW / 2 };
  }

  // One digit on a card. `tone` picks the palette role: 'plain', 'good' (part of a
  // climb), 'bad' (the repeat that stalls it) or 'ghost' (available, not yet chosen).
  function drawDigit(ctx, cx, cy, size, text, tokens, tone, alpha, view) {
    if (alpha <= 0.002) return;
    var fill = tokens.card, ink = tokens.ink, edge = tokens.line;
    if (tone === 'good') { fill = tokens.accentSoft; ink = tokens.accent; edge = tokens.accent; }
    else if (tone === 'bad') { fill = tokens.warmSoft; ink = tokens.warm; edge = tokens.warm; }
    else if (tone === 'ghost') { fill = tokens.card; ink = tokens.inkFaint; edge = tokens.line; }

    ctx.save();
    ctx.globalAlpha = alpha;
    kit.roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.24);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1, Math.min(view.width, view.height) * 0.0016);
    ctx.stroke();
    kit.drawLabel(ctx, text, cx, cy + size * 0.26, tokens, {
      family: 'display', weight: '700', size: size * 0.62, minSize: 10,
      color: ink, maxWidth: size * 0.82
    });
    ctx.restore();
  }

  // An empty slot: the same footprint as a digit card, drawn as a dashed outline.
  function drawSlot(ctx, cx, cy, size, tokens, alpha, view) {
    if (alpha <= 0.002) return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = Math.max(1.5, Math.min(view.width, view.height) * 0.003);
    kit.roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.24);
    ctx.stroke();
    ctx.restore();
  }

  // A row of digits, centred on cx. Returns the card size used.
  function drawNumberRow(ctx, digits, cx, cy, size, gap, tokens, tones, alpha, view) {
    var total = digits.length * size + (digits.length - 1) * gap;
    var startX = cx - total / 2 + size / 2;
    for (var i = 0; i < digits.length; i++) {
      drawDigit(ctx, startX + i * (size + gap), cy, size, String(digits[i]), tokens,
        tones ? tones[i] : 'plain', alpha, view);
    }
    return { startX: startX, step: size + gap, total: total };
  }

  var KEYWORDS = [
    { big: '', small: 'DIGITS THAT CLIMB', start: 1.6, end: 5.6 },
    { big: '', small: 'ONE YES, ONE NO', start: 7.2, end: 10.7 },
    { big: '', small: 'PICK THREE DIGITS', start: 11.8, end: 15.2 },
    { big: '504', small: 'ORDERED PICKS', start: 20.2, end: 21.9 },
    { big: '', small: 'ONLY ONE CLIMBS', start: 23.2, end: 25.7 },
    { big: '', small: 'SIX BECOME ONE', start: 27.0, end: 29.3 },
    { big: '', small: 'COUNT SETS, NOT ORDERS', start: 31.0, end: 33.9 }
  ];

  /* ---- beat 1: the question ---- */

  function drawAskScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var box = contentBox(x0, y0, innerW, innerH);
    var unit = Math.min(view.width, view.height);
    var size = Math.min(box.w * 0.22, box.h * 0.16);
    var gap = size * 0.28;
    var rowY = box.y + box.h * 0.42;

    for (var i = 0; i < SLOTS; i++) {
      var total = SLOTS * size + (SLOTS - 1) * gap;
      var cx = box.cx - total / 2 + size / 2 + i * (size + gap);
      drawSlot(ctx, cx, rowY, size, tokens, s.askReveal, view);
      kit.drawLabel(ctx, '?', cx, rowY + size * 0.24, tokens, {
        family: 'display', weight: '600', size: size * 0.5, minSize: 10,
        color: tokens.inkFaint, alpha: s.askReveal * 0.8, maxWidth: size * 0.7
      });
    }

    // A rising line through the three slots: the whole condition, as a picture.
    if (s.arrowReveal > 0.002) {
      var totalW = SLOTS * size + (SLOTS - 1) * gap;
      var lx0 = box.cx - totalW / 2;
      var lx1 = box.cx + totalW / 2;
      var ly0 = rowY - size * 0.85;
      var ly1 = rowY - size * 1.55;
      ctx.save();
      ctx.globalAlpha = s.arrowReveal;
      ctx.strokeStyle = tokens.accent;
      ctx.lineWidth = Math.max(2, unit * 0.006);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lx0, ly0);
      ctx.lineTo(lx0 + (lx1 - lx0) * s.arrowReveal, ly0 + (ly1 - ly0) * s.arrowReveal);
      ctx.stroke();
      ctx.restore();
    }

    kit.drawTrackedLabel(ctx, 'THREE DIGITS, EACH BIGGER THAN THE LAST', box.cx, box.y + box.h * 0.66, tokens, {
      family: 'mono', weight: '500', size: Math.max(9, unit * 0.026),
      color: tokens.inkSoft, alpha: s.arrowReveal, tracking: 0.1, maxWidth: box.w * 0.96
    });
  }

  /* ---- beat 2: one that climbs, one that stalls ---- */

  function drawTestScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var box = contentBox(x0, y0, innerW, innerH);
    var unit = Math.min(view.width, view.height);
    var size = Math.min(box.w * 0.20, box.h * 0.13);
    var gap = size * 0.26;

    // 148: every step up. The relation under it is a fixed, always-true string.
    var yesY = box.y + box.h * 0.20;
    drawNumberRow(ctx, [1, 4, 8], box.cx, yesY, size, gap, tokens, ['good', 'good', 'good'], s.yesReveal, view);
    kit.drawTrackedLabel(ctx, '1 < 4 < 8', box.cx, yesY + size * 0.95, tokens, {
      family: 'mono', weight: '600', size: Math.max(10, unit * 0.032),
      color: tokens.accent, alpha: s.yesReveal, tracking: 0.16, maxWidth: box.w * 0.8
    });

    // 155: the repeat is where it stops climbing.
    var noY = box.y + box.h * 0.58;
    drawNumberRow(ctx, [1, 5, 5], box.cx, noY, size, gap, tokens, ['plain', 'plain', 'bad'], s.noReveal, view);
    kit.drawTrackedLabel(ctx, '5 IS NOT BIGGER THAN 5', box.cx, noY + size * 0.95, tokens, {
      family: 'mono', weight: '600', size: Math.max(9, unit * 0.026),
      color: tokens.warm, alpha: s.noReveal, tracking: 0.1, maxWidth: box.w * 0.92
    });

    if (s.noStrike > 0.002) {
      kit.drawStrikeChip(ctx, box.cx, noY, box.w * 0.62, size * 1.25, tokens, String(NO_NUMBER), s.noStrike, 0);
    }
  }

  /* ---- beats 3 and 4: fill three slots, and count the ordered ways ---- */

  function drawSlotsScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var box = contentBox(x0, y0, innerW, innerH);
    var unit = Math.min(view.width, view.height);

    // The digits available, as a quiet row across the top.
    var poolSize = Math.min(box.w / 12, box.h * 0.07);
    var poolGap = poolSize * 0.3;
    var poolY = box.y + box.h * 0.10;
    var used = s.exampleSet;
    for (var i = 0; i < s.digits.length; i++) {
      var d = s.digits[i];
      var taken = (s.filled > 0) && used.indexOf(d) >= 0 && used.indexOf(d) < s.filled;
      var total = s.digits.length * poolSize + (s.digits.length - 1) * poolGap;
      var cx = box.cx - total / 2 + poolSize / 2 + i * (poolSize + poolGap);
      drawDigit(ctx, cx, poolY, poolSize, String(d), tokens, taken ? 'good' : 'ghost',
        s.slotsReveal * (taken ? 0.35 : 1), view);
    }

    // The three slots, filling one at a time.
    var size = Math.min(box.w * 0.20, box.h * 0.13);
    var gap = size * 0.3;
    var rowY = box.y + box.h * 0.40;
    var totalW = SLOTS * size + (SLOTS - 1) * gap;
    for (var k = 0; k < SLOTS; k++) {
      var scx = box.cx - totalW / 2 + size / 2 + k * (size + gap);
      if (k < s.filled) {
        drawDigit(ctx, scx, rowY, size, String(used[k]), tokens, 'good', s.slotsReveal, view);
      } else {
        drawSlot(ctx, scx, rowY, size, tokens, s.slotsReveal, view);
      }
      // How many digits were available for this slot, once that pick has landed.
      if (s.picksShown > k) {
        kit.drawLabel(ctx, String(s.choices[k]), scx, rowY - size * 0.78, tokens, {
          family: 'display', weight: '700', size: size * 0.5, minSize: 12,
          color: tokens.ink, maxWidth: size
        });
        kit.drawTrackedLabel(ctx, 'WAYS', scx, rowY - size * 0.58, tokens, {
          family: 'mono', weight: '500', size: Math.max(7, unit * 0.017),
          color: tokens.inkFaint, tracking: 0.14, maxWidth: size * 1.4
        });
      }
    }

    // The product, drawn only once all three counts are on screen, so no frame ever
    // shows a partial product presented as a total.
    if (s.productReveal > 0.002 && s.picksShown === s.choices.length) {
      kit.drawTrackedLabel(ctx, '9 × 8 × 7 = 504', box.cx, box.y + box.h * 0.70, tokens, {
        family: 'mono', weight: '600', size: Math.max(11, unit * 0.040),
        color: tokens.ink, alpha: s.productReveal, tracking: 0.1, maxWidth: box.w * 0.94
      });
      kit.drawTrackedLabel(ctx, 'BUT THAT COUNTS EVERY ORDER', box.cx, box.y + box.h * 0.78, tokens, {
        family: 'mono', weight: '500', size: Math.max(9, unit * 0.024),
        color: tokens.warm, alpha: s.productReveal, tracking: 0.12, maxWidth: box.w * 0.94
      });
    }
  }

  /* ---- beat 5: the six orderings, five of which fall away ---- */

  function drawOrderingsScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var box = contentBox(x0, y0, innerW, innerH);
    var unit = Math.min(view.width, view.height);

    var rowCount = s.rows.length;
    var rowH = box.h * 0.115;
    var size = Math.min(rowH * 0.82, box.w * 0.15);
    var gap = size * 0.26;
    var firstY = box.y + box.h * 0.10 + rowH / 2;

    for (var i = 0; i < rowCount; i++) {
      var row = s.rows[i];
      var y = firstY + i * rowH;
      var alpha = s.orderingsReveal;
      ctx.save();
      if (row.fall > 0) {
        // Losing orderings drop and fade rather than vanishing — the eye needs to see
        // them leave to believe six became one.
        ctx.globalAlpha = 1 - row.fall;
        ctx.translate(0, row.fall * box.h * 0.16);
      }
      var tones = row.climbs ? ['good', 'good', 'good'] : ['plain', 'plain', 'plain'];
      // The row sits slightly left of centre so the tag on the winning row has its own
      // column and can never crowd the last digit.
      var rowCx = box.cx - box.w * 0.10;
      drawNumberRow(ctx, row.digits, rowCx, y, size, gap, tokens, tones, alpha, view);
      if (row.climbs && s.orderingsReveal > 0.5) {
        kit.drawTrackedLabel(ctx, 'CLIMBS', box.cx + box.w * 0.32, y + size * 0.14, tokens, {
          family: 'mono', weight: '600', size: Math.max(8, unit * 0.020),
          color: tokens.accent, tracking: 0.14, maxWidth: box.w * 0.30
        });
      }
      ctx.restore();
    }

    kit.drawTrackedLabel(ctx, 'SIX ORDERINGS, ONE SET', box.cx, box.y + box.h * 0.97, tokens, {
      family: 'mono', weight: '500', size: Math.max(9, unit * 0.024),
      color: tokens.inkSoft, alpha: s.orderingsReveal, tracking: 0.12, maxWidth: box.w * 0.94
    });
  }

  /* ---- beats 6 and 7: divide by six, and the answer ---- */

  function drawDivideScene(ctx, s, view, x0, y0, innerW, innerH) {
    var tokens = view.tokens;
    var box = contentBox(x0, y0, innerW, innerH);
    var unit = Math.min(view.width, view.height);
    var bottom = box.y + box.h;

    // The one ordering that survived, kept on screen as the reason for the six.
    var size = Math.min(box.w * 0.16, box.h * 0.11);
    drawNumberRow(ctx, EXAMPLE_SET, box.cx, box.y + box.h * 0.12, size, size * 0.26, tokens,
      ['good', 'good', 'good'], s.divideReveal, view);

    if (s.divideReveal > 0.002) {
      kit.drawTrackedLabel(ctx, '504 ÷ 6 = 84', box.cx, box.y + box.h * 0.34, tokens, {
        family: 'mono', weight: '600', size: Math.max(12, unit * 0.044),
        color: tokens.ink, alpha: s.divideReveal, tracking: 0.1, maxWidth: box.w * 0.94
      });
      kit.drawTrackedLabel(ctx, 'EVERY SET COUNTED SIX TIMES', box.cx, box.y + box.h * 0.43, tokens, {
        family: 'mono', weight: '500', size: Math.max(9, unit * 0.024),
        color: tokens.inkSoft, alpha: s.divideReveal, tracking: 0.12, maxWidth: box.w * 0.94
      });
    }

    // Laid out from the bottom up, so the answer and the closing line can never
    // print on top of each other however large the answer is set.
    if (s.answerReveal > 0.002) {
      var pop = 0.86 + 0.14 * kit.easeOutBack(s.answerReveal);
      kit.drawLabel(ctx, String(s.answer), box.cx, bottom - box.h * 0.19, tokens, {
        family: 'display', weight: '700', size: unit * 0.24 * pop, minSize: 24,
        color: tokens.accent, alpha: s.answerReveal, maxWidth: box.w * 0.9
      });
      kit.drawTrackedLabel(ctx, 'NUMBERS THAT CLIMB', box.cx, bottom - box.h * 0.13, tokens, {
        family: 'mono', weight: '600', size: Math.max(10, unit * 0.028),
        color: tokens.inkSoft, alpha: s.answerReveal, tracking: 0.18, maxWidth: box.w * 0.9
      });
    }

    if (s.closingReveal > 0.002) {
      kit.drawTrackedLabel(ctx, 'CHOOSING IS ARRANGING, DIVIDED', box.cx, bottom - box.h * 0.02, tokens, {
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
      case 'test':
        drawTestScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'slots':
      case 'count':
        drawSlotsScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'orderings':
        drawOrderingsScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
      case 'divide':
      case 'final':
        drawDivideScene(ctx, s, view, x0, y0, innerW, innerH);
        break;
    }

    kit.drawKeywordPunch(ctx, view.tokens, view, x0, y0, innerW, innerH, KEYWORDS, s.t);

    ctx.restore(); // camera
    ctx.restore(); // outer
  }

  MathAnim.define({
    id: 'choose-vs-arrange',
    duration: 34,
    poster: 31,
    state: state,
    draw: draw,
    // The words and when they are wanted. HOW they are spoken lives in the video repo.
    script: [
      { at: 0.0, text: 'How many three-digit numbers have digits that strictly increase?' },
      { at: 6.0, text: 'One four eight counts. One five five does not.' },
      { at: 11.0, text: 'Pick any three different digits from one to nine.' },
      { at: 15.5, text: 'Nine times eight times seven. Five hundred and four ways to arrange them.' },
      { at: 22.0, text: 'But only one of those orders climbs.' },
      { at: 26.0, text: 'Six orderings collapse into one.' },
      { at: 29.5, text: 'Five hundred and four, divided by six. Eighty-four.' }
    ]
  });
})();
