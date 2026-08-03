/* Math Journey — animation host.
 *
 * Every canvas animation in public/ is a "scene": a plain object registered with
 * MathAnim.define({ id, duration, poster, state, draw, script }). Scenes are pure —
 * state(t) turns a time in seconds into a plain-data snapshot, draw(ctx, state, view)
 * paints that snapshot. Neither function may read the clock, randomness, or anything
 * mutated between calls; the same t must always produce the same pixels. That purity is
 * what lets a separate video renderer (math-journey-video) ask for frames out of order,
 * timed to synthesised narration instead of to wall-clock playback.
 *
 * This file is the ONLY place that is allowed to run a requestAnimationFrame loop or
 * touch a clock. Scene files never do either. MathAnim.mount() finds every
 *   <figure class="anim" data-scene="scene-id" data-aspect="16/9"><canvas></canvas></figure>
 * on the page, sizes its canvas, and drives it with one shared rAF loop, a play/pause
 * button, a scrub bar, and a caption line built from scene.script.
 *
 * This file is loaded two ways:
 *   - As a plain <script src="anim.js"> in the browser (sets window.MathAnim).
 *   - Via require() in Node, with no DOM at all — the math-journey-video renderer reads
 *     scene.id / scene.duration / scene.script this way before any browser is involved,
 *     and also serves this same file into headless Chrome. Every DOM reference below is
 *     guarded so requiring this file in plain Node never throws.
 *
 * No build step, no dependencies: this is hand-written ES5, one file, one job.
 */

(function () {
  'use strict';

  var hasDom = (typeof document !== 'undefined' && typeof window !== 'undefined');

  /* ------------------------------------------------------------------ tokens */

  // The ONLY palette. Values are read live off :root's CSS custom properties (see
  // public/assets/quiz.css) so a scene never disagrees with the page it's embedded in.
  // Font stacks are fixed here because canvas text can't inherit font-family from CSS.
  var TOKEN_VARS = {
    paper: '--paper',
    paperDeep: '--paper-deep',
    card: '--card',
    ink: '--ink',
    inkSoft: '--ink-soft',
    inkFaint: '--ink-faint',
    line: '--line',
    accent: '--accent',
    accentSoft: '--accent-soft',
    warm: '--warm',
    warmSoft: '--warm-soft',
    good: '--good',
    bad: '--bad'
  };

  var FONTS = {
    display: '"Space Grotesk", system-ui, sans-serif',
    body: '"IBM Plex Sans", system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace'
  };

  // Used ONLY when there is no document (required from Node, e.g. by the video
  // renderer's server/render.html page model or by a purity/unit-test script). Every
  // value here must be kept identical to the :root block in public/assets/quiz.css —
  // there is no second palette anywhere else in this file or in any scene file.
  var defaultTokens = {
    paper: '#f7f3ea',
    paperDeep: '#efe8da',
    card: '#fffdf8',
    ink: '#241f18',
    inkSoft: '#5d5445',
    inkFaint: '#8d8271',
    line: '#ded4c0',
    accent: '#1f5f5b',
    accentSoft: '#e2efed',
    warm: '#b4531f',
    warmSoft: '#fbe9dd',
    good: '#2f6b3a',
    bad: '#a33328',
    display: FONTS.display,
    body: FONTS.body,
    mono: FONTS.mono
  };

  // Reads the live palette off getComputedStyle(document.documentElement) (or `el` if
  // given). Falls back to defaultTokens if there is no document to read from.
  function tokensFrom(el) {
    if (!hasDom || typeof window.getComputedStyle !== 'function') return defaultTokens;
    var node = el || document.documentElement;
    var cs = window.getComputedStyle(node);
    var out = { display: FONTS.display, body: FONTS.body, mono: FONTS.mono };
    Object.keys(TOKEN_VARS).forEach(function (key) {
      var raw = cs.getPropertyValue(TOKEN_VARS[key]);
      out[key] = raw ? raw.trim() : defaultTokens[key];
    });
    return out;
  }

  /* ------------------------------------------------------------------- utils */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ------------------------------------------------------------------ define */

  var scenes = {};

  // Validates a scene, wires up scene.render(ctx, t, view) = draw(ctx, state(clamp(t)),
  // view), freezes it, and stores it in MathAnim.scenes[scene.id]. No DOM used here —
  // safe to call from plain Node, which is how the video renderer introspects a scene's
  // id/duration/script before any browser is involved.
  function define(scene) {
    if (!scene || typeof scene !== 'object') {
      throw new Error('MathAnim.define: scene must be an object');
    }
    if (typeof scene.id !== 'string' || !scene.id) {
      throw new Error('MathAnim.define: scene.id must be a non-empty string');
    }
    if (typeof scene.duration !== 'number' || !(scene.duration > 0) || !isFinite(scene.duration)) {
      throw new Error('MathAnim.define("' + scene.id + '"): duration must be a positive finite number');
    }
    if (typeof scene.state !== 'function') {
      throw new Error('MathAnim.define("' + scene.id + '"): state(t) function is required');
    }
    if (typeof scene.draw !== 'function') {
      throw new Error('MathAnim.define("' + scene.id + '"): draw(ctx, state, view) function is required');
    }
    var poster = typeof scene.poster === 'number' ? scene.poster : scene.duration;
    var script = Array.isArray(scene.script) ? scene.script.slice() : [];
    script.forEach(function (cue, i) {
      if (!cue || typeof cue.at !== 'number' || typeof cue.text !== 'string' || !cue.text.trim()) {
        throw new Error('MathAnim.define("' + scene.id + '"): script[' + i + '] must be { at: number, text: non-empty string }');
      }
    });

    var stateFn = scene.state;
    var drawFn = scene.draw;
    var durationVal = scene.duration;

    var def = {
      id: scene.id,
      duration: durationVal,
      poster: poster,
      state: stateFn,
      draw: drawFn,
      script: script,
      render: function (ctx, t, view) {
        var s = stateFn(clamp(t, 0, durationVal));
        return drawFn(ctx, s, view);
      }
    };

    if (typeof Object.freeze === 'function') {
      Object.freeze(def.script);
      Object.freeze(def);
    }
    scenes[def.id] = def;
    return def;
  }

  /* ------------------------------------------------------------------- mount */

  // One shared array of mounted players and one shared rAF loop drive every figure on
  // the page. This is the only rAF call in the whole animation system — scene files
  // never schedule their own frames.
  var players = [];
  var loopStarted = false;

  function parseAspect(raw) {
    var parts = String(raw || '16/9').split('/');
    var w = parseFloat(parts[0]);
    var h = parseFloat(parts[1]);
    if (!w || !h || !isFinite(w) || !isFinite(h)) { w = 16; h = 9; }
    return { w: w, h: h, layout: w >= h ? 'wide' : 'tall' };
  }

  function currentCue(script, t) {
    var text = '';
    for (var i = 0; i < script.length; i++) {
      if (script[i].at <= t) text = script[i].text; else break;
    }
    return text;
  }

  function fmtTime(sec) {
    var s = Math.max(0, sec);
    var m = Math.floor(s / 60);
    var r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function buildPlayer(figure) {
    var sceneId = figure.getAttribute('data-scene');
    var scene = scenes[sceneId];
    if (!scene) {
      console.warn('MathAnim.mount: no scene registered with id "' + sceneId + '"');
      return null;
    }

    var aspect = parseAspect(figure.getAttribute('data-aspect'));

    var canvas = figure.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      figure.insertBefore(canvas, figure.firstChild);
    }
    canvas.className = 'anim-canvas';
    var ctx = canvas.getContext('2d');

    var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var controls = figure.querySelector('.anim-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'anim-controls';

      var playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'anim-play';

      var scrub = document.createElement('input');
      scrub.type = 'range';
      scrub.className = 'anim-scrub';
      scrub.min = '0';
      // 'any' — NOT a small fixed step. A range input's value sanitization algorithm
      // snaps any programmatically-assigned value to the nearest step from `min`, so a
      // fixed step here would silently corrupt exact seek targets (e.g. jumping to a
      // script cue at t=28 could snap to 28.008), even though nothing looks wrong until
      // you check the resulting scene time.
      scrub.step = 'any';
      scrub.max = String(scene.duration);

      var time = document.createElement('span');
      time.className = 'anim-time';

      controls.appendChild(playBtn);
      controls.appendChild(scrub);
      controls.appendChild(time);
      figure.appendChild(controls);

      var caption = document.createElement('p');
      caption.className = 'anim-caption';
      figure.appendChild(caption);
    }

    var playBtnEl = controls.querySelector('.anim-play');
    var scrubEl = controls.querySelector('.anim-scrub');
    var timeEl = controls.querySelector('.anim-time');
    var captionEl = figure.querySelector('.anim-caption');

    var player = {
      scene: scene,
      figure: figure,
      canvas: canvas,
      ctx: ctx,
      aspect: aspect,
      t: reducedMotion ? clamp(scene.poster, 0, scene.duration) : 0,
      playing: !reducedMotion,
      lastTime: null,
      dirty: true,
      view: null,
      playBtnEl: playBtnEl,
      scrubEl: scrubEl,
      timeEl: timeEl,
      captionEl: captionEl
    };

    playBtnEl.addEventListener('click', function () {
      if (!player.playing && player.t >= player.scene.duration) player.t = 0;
      player.playing = !player.playing;
      player.dirty = true;
    });

    scrubEl.addEventListener('input', function () {
      player.playing = false;
      player.t = clamp(parseFloat(this.value), 0, player.scene.duration);
      player.dirty = true;
    });

    resizePlayer(player);
    if (hasDom && window.ResizeObserver) {
      var ro = new ResizeObserver(function () { resizePlayer(player); });
      ro.observe(figure);
    } else {
      window.addEventListener('resize', function () { resizePlayer(player); });
    }

    return player;
  }

  function resizePlayer(player) {
    var figure = player.figure;
    var rect = figure.getBoundingClientRect();
    var cssWidth = rect.width || figure.clientWidth || 320;
    var cssHeight = cssWidth * (player.aspect.h / player.aspect.w);
    var dpr = window.devicePixelRatio || 1;

    player.canvas.style.width = cssWidth + 'px';
    player.canvas.style.height = cssHeight + 'px';
    player.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    player.canvas.height = Math.max(1, Math.round(cssHeight * dpr));

    player.view = {
      width: cssWidth,
      height: cssHeight,
      dpr: dpr,
      layout: player.aspect.layout,
      tokens: tokensFrom()
    };
    player.dirty = true;
  }

  function renderPlayer(player) {
    var v = player.view;
    if (!v) return;
    player.ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    player.scene.render(player.ctx, player.t, v);

    if (player.playBtnEl) player.playBtnEl.textContent = player.playing ? 'Pause' : 'Play';
    if (player.scrubEl) player.scrubEl.value = String(player.t);
    if (player.timeEl) player.timeEl.textContent = fmtTime(player.t) + ' / ' + fmtTime(player.scene.duration);
    if (player.captionEl) player.captionEl.textContent = currentCue(player.scene.script, player.t);
  }

  function tick(now) {
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.playing) {
        var last = p.lastTime === null ? now : p.lastTime;
        var dt = (now - last) / 1000;
        p.t += dt;
        if (p.t >= p.scene.duration) {
          p.t = p.scene.duration;
          p.playing = false;
        }
        p.dirty = true;
      }
      p.lastTime = now;
      if (p.dirty) {
        renderPlayer(p);
        p.dirty = false;
      }
    }
    window.requestAnimationFrame(tick);
  }

  // Finds every <figure class="anim" data-scene="..."> on the page, sizes and mounts
  // each one, and starts the single shared clock if it isn't already running. Safe to
  // call more than once — already-mounted figures are skipped.
  function mount() {
    if (!hasDom) return;
    var figures = document.querySelectorAll('figure.anim[data-scene]');
    for (var i = 0; i < figures.length; i++) {
      var figure = figures[i];
      if (figure.__mathAnimMounted) continue;
      var player = buildPlayer(figure);
      if (!player) continue;
      figure.__mathAnimMounted = true;
      players.push(player);
      renderPlayer(player);
    }
    if (!loopStarted && players.length) {
      loopStarted = true;
      window.requestAnimationFrame(tick);
    }
  }

  var MathAnim = {
    scenes: scenes,
    defaultTokens: defaultTokens,
    define: define,
    tokensFrom: tokensFrom,
    mount: mount
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = MathAnim;
  }
  if (typeof window !== 'undefined') {
    window.MathAnim = MathAnim;
  }
})();
