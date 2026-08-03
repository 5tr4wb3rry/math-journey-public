/* Math Journey — shared quiz engine.
 *
 * Every session quiz in public/ is: boilerplate + a PROBLEMS array + a CONFIG object,
 * then MathQuiz.start(CONFIG, PROBLEMS). Never rewrite this file per session; fix
 * behavior here and every quiz inherits it.
 *
 * CONFIG
 *   unit          number  — used in the heading and the report filename
 *   stage         string  — 'assessment' | 'check' | 'unit-assessment'. Drives the
 *                           start-screen framing: an assessment is meant to beat him
 *                           somewhere, a check is meant to go his way, and they must not
 *                           be framed alike.
 *   slug          string  — optional override for the report filename and autosave key.
 *                           Use it on a check so the file names the topic, e.g.
 *                           'check_counting-factors'. Defaults to unit + stage.
 *   title         string  — page heading
 *   subtitle      string  — optional line under the heading
 *   confidence    bool    — show the "how sure are you?" tags per problem
 *   stuckChips    array   — optional override of the playbook moves offered on "I'm stuck"
 *   topics        array   — optional override for the ownership taps. Normally omitted:
 *                           the topic list is derived from the problems themselves.
 *
 * Screens: start (climb framing + playbook) -> climb (one problem at a time, playbook
 * card kept visible throughout) -> review. Both the framing and the visible playbook
 * card are non-negotiables from .claude/rules/sessions.md; do not remove them.
 *
 * PROBLEM
 *   question      string  — the prompt, plain text
 *   math          string  — optional monospace line (an expression, a table, a diagram)
 *   answers       array   — accepted answers; numbers, fraction strings, or plain strings
 *   hints         array   — up to three, ordered nudge -> stronger -> strongest
 *   topic         string  — REQUIRED. The syllabus topic this problem tests, spelled
 *                           exactly as it appears in syllabus.html. Verdicts are computed
 *                           per topic, so a misspelling silently splits one topic in two.
 *   level         string  — difficulty label, e.g. 'core', 'stretch', 'reach'
 *
 * Answers are auto-scored. Numeric and fraction forms are interchangeable: if the
 * accepted answer is 3/4 then 3/4, 0.75, 6/8 and 1 -1/4 -style mixed numbers all match.
 * Anything that is not a number is compared as case- and space-insensitive text.
 *
 * TOPIC VERDICTS drive everything downstream: each partial or unsolved topic gets its own
 * lesson, and nothing else does. Give every topic at least two problems at different
 * levels — with only one, "partial" can never occur and the verdict collapses to pass/fail.
 *   solved      every problem for that topic correct, and none tagged "I guessed"
 *   partial     some correct, OR all correct but at least one guessed
 *   not solved  none correct
 * A correct guess is deliberately not "solved": it demonstrated nothing.
 */

(function (global) {
  'use strict';

  // The Opening Playbook. Shown on the start screen, kept visible through the whole
  // climb, and used as the tap-chips on "I'm stuck" — the same six moves everywhere, so
  // naming what he tried is the same vocabulary as choosing what to try.
  var PLAYBOOK = [
    ['Try numbers',      'Plug in small, easy values and see what happens.'],
    ['Shrink it',        'Solve a smaller version of the problem first.'],
    ['Draw it / table it', 'Pictures and tables before symbols.'],
    ['Name things',      'Give the unknowns letters; write down what you know.'],
    ['Work backwards',   'Start from what the answer has to satisfy.'],
    ['Say it out loud',  'Restate the problem in your own words.']
  ];

  var DEFAULT_STUCK_CHIPS = PLAYBOOK.map(function (m) { return m[0]; })
    .concat(["Didn't know where to start"]);

  var CONFIDENCE_TAGS = ["I'm sure", 'I think so', 'I guessed'];

  // His own verdict on each topic the session touched. Taps only — sessions.md is
  // explicit that written reflection gets left blank, so this stays one tap per row.
  var OWNERSHIP_TAGS = ['I own this', 'Getting there', 'Not yet'];

  // Said aloud by the parent and shown before the quiz starts, every time. An assessment
  // and a check are pitched differently and must be framed differently — a check he expects
  // to fail teaches him nothing about whether the lesson worked.
  var FRAMING = {
    assessment: {
      heading: 'This is a climb',
      lines: [
        'Nobody summits clean.',
        'Finding where it gets hard is the whole point — that is the result we want.',
        'Hints cost nothing. Using one is a move, not a mistake.',
        'There is no timer. Take as long as you take.'
      ]
    },
    check: {
      heading: 'This one should go your way',
      lines: [
        'This covers what the lesson just went through — you should be able to clear it.',
        'If something still fights back, that is worth knowing: it means the lesson missed, not that you did.',
        'Hints are still here and still cost nothing.',
        'There is no timer. Take as long as you take.'
      ]
    }
  };
  FRAMING['unit-assessment'] = FRAMING.assessment;

  /* ---------------------------------------------------------------- answers */

  // Turn "3/4", "0.75", "1 1/2", "-2", "1,250" into a number. null if it isn't one.
  function toNumber(raw) {
    var s = String(raw).trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ');
    if (!s) return null;

    var mixed = s.match(/^([+-]?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
      var den = Number(mixed[4]);
      if (!den) return null;
      var mag = Number(mixed[2]) + Number(mixed[3]) / den;
      return mixed[1] === '-' ? -mag : mag;
    }

    var frac = s.match(/^([+-]?\d*\.?\d+)\s*\/\s*([+-]?\d*\.?\d+)$/);
    if (frac) {
      var d = parseFloat(frac[2]);
      if (!d) return null;
      return parseFloat(frac[1]) / d;
    }

    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return parseFloat(s);
    return null;
  }

  // Tight enough to reject a truncated decimal typed for a repeating fraction
  // (0.3333333333 is not 1/3), loose enough to absorb float rounding between two
  // spellings of the same value (6/8 vs 3/4).
  function sameNumber(a, b) {
    return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
  }

  function normalizeText(raw) {
    return String(raw).trim().toLowerCase().replace(/\s+/g, '');
  }

  function isCorrect(given, accepted) {
    if (given == null || normalizeText(given) === '') return false;
    var givenNum = toNumber(given);
    for (var i = 0; i < accepted.length; i++) {
      var wantNum = toNumber(accepted[i]);
      if (givenNum !== null && wantNum !== null) {
        if (sameNumber(givenNum, wantNum)) return true;
      } else if (normalizeText(given) === normalizeText(accepted[i])) {
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ utils */

  function el(tag, props, kids) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        // null/undefined/false means "omit this attribute". Without this guard
        // setAttribute writes the string "null" and { disabled: null } disables
        // the button it was meant to leave enabled.
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        // A textarea has no value attribute — its content comes from its child text.
        // Set the property so revisiting a problem shows what was typed there.
        else if (k === 'value') node.value = v;
        else node.setAttribute(k, v);
      });
    }
    (kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
    return node;
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // Distinct topics in the order the problems first hit them.
  function topicsOf(problems) {
    var seen = [];
    problems.forEach(function (p) {
      var t = p.topic;
      if (t && seen.indexOf(t) === -1) seen.push(t);
    });
    return seen;
  }

  /* Per-topic verdicts. The whole downstream model runs off these: every `partial` or
   * `not solved` topic gets its own lesson, and nothing else does. A correct guess counts
   * as `partial` on purpose — it demonstrated nothing.
   *
   * `right`/`total` are reported alongside the verdict so the parent can see a 1-of-3
   * partial is not the same as a 2-of-3 partial without re-reading the problem list. */
  function verdictsFor(problems, state, graded) {
    return topicsOf(problems).map(function (topic) {
      var total = 0, right = 0, guessed = 0;
      problems.forEach(function (p, i) {
        if (p.topic !== topic) return;
        total++;
        if (graded(i)) right++;
        if (state[i].confidence === 'I guessed') guessed++;
      });
      var verdict;
      if (right === 0) verdict = 'not solved';
      else if (right < total) verdict = 'partial';
      else verdict = guessed ? 'partial' : 'solved';
      return { topic: topic, right: right, total: total, guessed: guessed, verdict: verdict };
    });
  }

  /* ----------------------------------------------------------------- engine */

  function start(config, problems) {
    var cfg = config || {};
    var chips = cfg.stuckChips || DEFAULT_STUCK_CHIPS;
    var root = document.getElementById('quiz');

    // Drives the autosave key, the report heading and the download filename together, so
    // all three agree. A check passes `slug` so its report names the topic it covers.
    var stage = cfg.stage || 'assessment';
    var pretty = stage.replace(/-/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
    var slug = cfg.slug || ('unit' + cfg.unit + '_' + stage);
    var label = 'Unit ' + cfg.unit + ' · ' + pretty + (cfg.topicLabel ? ' · ' + cfg.topicLabel : '');
    var storeKey = 'mathjourney:' + slug;

    // A fingerprint of the actual problems, so a saved sitting cannot outlive the quiz
    // it belongs to. The key above is built from the address alone, so rewriting a
    // check's problems used to leave last week's answers sitting under the same key —
    // and a restored save could land straight on the review screen, showing which
    // answers were wrong. That happened: a rewritten check was opened and the previous
    // quiz came back instead. Cheap string hash; this guards against staleness, not
    // tampering.
    var fingerprint = (function () {
      var src = problems.map(function (p) {
        return String(p.question) + '|' + (p.answers || []).join(',');
      }).join('||');
      var h = 5381;
      for (var i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
      return String(h);
    })();

    var state = problems.map(function () {
      return { answer: '', hints: 0, stuck: [], note: '', confidence: '' };
    });
    var topics = cfg.topics || topicsOf(problems);
    var reflection = { hardest: '', note: '', owns: {} };
    var index = 0;
    var screen = 'start';           // 'start' -> 'climb' -> 'review'
    // Set once the quiz has been handed in. A handed-in quiz is a record of what he
    // knew at that moment, so it is never edited afterwards — retaking means starting
    // over, which is what the "Start again" button on the review screen does.
    var submitted = false;
    // True only when the review screen was restored from storage rather than just
    // finished — drives the "this is an old report" notice on the report card.
    var restoredReview = false;

    // Light autosave so an accidental refresh mid-climb doesn't lose the work, and so a
    // finished-but-unsent report is never stranded: a saved 'review' restores straight
    // back to the report instead of dropping him on the start screen.
    try {
      var saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
      // A save from a different set of problems is not a save of this quiz. Matching
      // the problem COUNT is not enough — a rewritten check usually has the same
      // number of problems, which is exactly how the stale sitting got through.
      if (saved && saved.fingerprint !== fingerprint) {
        localStorage.removeItem(storeKey);
        saved = null;
      }
      if (saved && saved.state && saved.state.length === state.length &&
          (saved.screen === 'climb' || saved.screen === 'review')) {
        state = saved.state;
        index = saved.index || 0;
        screen = saved.screen;
        // reflection didn't exist in older saves. Absent entirely: keep the fresh
        // blank default. Present: pull each field with its own fallback so a save
        // from a version that only had part of the shape still restores whole.
        if (saved.reflection) {
          reflection = {
            hardest: saved.reflection.hardest || '',
            note: saved.reflection.note || '',
            owns: saved.reflection.owns || {}
          };
        }
        if (saved.submitted) submitted = true;
        if (screen === 'review') { restoredReview = true; submitted = true; }
      }
    } catch (e) { /* storage unavailable; carry on */ }

    function save() {
      try {
        localStorage.setItem(storeKey, JSON.stringify({
          fingerprint: fingerprint,
          state: state, index: index, screen: screen, reflection: reflection,
          submitted: submitted
        }));
      } catch (e) { /* ignore */ }
    }

    function graded(i) { return isCorrect(state[i].answer, problems[i].answers); }
    function answered(i) { return normalizeText(state[i].answer) !== ''; }
    function score() { return problems.reduce(function (n, _, i) { return n + (graded(i) ? 1 : 0); }, 0); }

    /* ---- progress rail: doubles as navigation, never locks ---- */

    function renderRail() {
      var done = screen === 'review';
      var rail = el('div', { class: 'rail' });
      problems.forEach(function (_, i) {
        var cls = 'rail-dot';
        if (done) cls += graded(i) ? ' right' : ' wrong';
        else if (answered(i)) cls += ' answered';
        if (!done && i === index) cls += ' current';
        rail.appendChild(el('button', {
          class: cls,
          text: String(i + 1),
          'aria-label': 'Problem ' + (i + 1),
          onclick: function () { if (!done) { index = i; save(); render(); } }
        }));
      });
      return rail;
    }

    /* ---- the playbook card: on the start screen and through the whole climb ---- */

    function renderPlaybook(open) {
      var card = el('details', { class: 'card playbook' });
      if (open) card.setAttribute('open', 'open');
      card.appendChild(el('summary', { text: 'The Opening Playbook' }));
      var list = el('ol', { class: 'playbook-list' });
      PLAYBOOK.forEach(function (move) {
        list.appendChild(el('li', {}, [
          el('strong', { text: move[0] }),
          el('span', { text: ' — ' + move[1] })
        ]));
      });
      card.appendChild(list);
      return card;
    }

    /* ---- start screen: the climb framing, said aloud and shown, every session ---- */

    function renderStart() {
      var frag = document.createDocumentFragment();

      var card = el('div', { class: 'card' });
      var framing = FRAMING[cfg.stage] || FRAMING.assessment;
      card.appendChild(el('p', { class: 'eyebrow', text: 'Before you start' }));
      card.appendChild(el('h2', { text: framing.heading }));
      var ul = el('ul', { class: 'framing' });
      framing.lines.forEach(function (line) { ul.appendChild(el('li', { text: line })); });
      card.appendChild(ul);
      card.appendChild(el('p', {
        class: 'hint-note',
        text: problems.length + ' problems, getting harder. You can move back and forward ' +
              'freely and change anything until you finish.'
      }));
      card.appendChild(el('div', { class: 'nav' }, [
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn btn-primary', text: 'Start the climb',
          onclick: function () { screen = 'climb'; save(); render(); }
        })
      ]));
      frag.appendChild(card);
      frag.appendChild(renderPlaybook(true));
      return frag;
    }

    /* ---- one problem ---- */

    function renderProblem() {
      var p = problems[index];
      var s = state[index];
      var card = el('div', { class: 'card' });

      card.appendChild(el('p', {
        class: 'eyebrow',
        text: 'Problem ' + (index + 1) + ' of ' + problems.length +
          (p.topic ? ' · ' + p.topic : '') + (p.level ? ' · ' + p.level : '')
      }));
      card.appendChild(el('p', { class: 'q-text', text: p.question }));
      if (p.math) card.appendChild(el('pre', { class: 'math', text: p.math }));

      var input = el('input', {
        type: 'text',
        value: s.answer,
        placeholder: 'Your answer',
        autocomplete: 'off',
        'aria-label': 'Answer to problem ' + (index + 1),
        oninput: function () { s.answer = this.value; save(); },
        onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); go(1); } }
      });
      card.appendChild(el('div', { class: 'answer-row' }, [input]));
      card.appendChild(el('p', {
        class: 'hint-note',
        text: 'Fractions or decimals both work — 3/4 and 0.75 are the same answer.'
      }));

      /* hints, self-served, one stage at a time */
      var hints = p.hints || [];
      if (hints.length) {
        var box = el('div', { class: 'hints' });
        var labels = ['A nudge', 'More', 'The most I can give you'];
        for (var h = 0; h < s.hints; h++) {
          box.appendChild(el('div', { class: 'hint' }, [
            el('span', { class: 'label', text: labels[h] || 'Hint ' + (h + 1) }),
            el('span', { text: hints[h] })
          ]));
        }
        if (s.hints < hints.length) {
          box.appendChild(el('button', {
            class: 'btn',
            text: s.hints === 0 ? 'Give me a move' : 'Give me another move',
            onclick: function () { s.hints++; save(); render(); }
          }));
        }
        card.appendChild(box);
      }

      /* "I'm stuck" — which playbook moves did you try? Entirely skippable. */
      var stuckOpen = s.stuck.length > 0 || s.note !== '' || s._stuckOpen;
      if (!stuckOpen) {
        card.appendChild(el('button', {
          class: 'btn btn-quiet',
          text: "I'm stuck",
          onclick: function () { s._stuckOpen = true; render(); }
        }));
      } else {
        var panel = el('div', { class: 'panel' });
        panel.appendChild(el('h3', { text: 'What did you already try?' }));
        var chipRow = el('div', { class: 'chips' });
        chips.forEach(function (label) {
          var on = s.stuck.indexOf(label) !== -1;
          chipRow.appendChild(el('button', {
            class: 'chip', 'aria-pressed': String(on), text: label,
            onclick: function () {
              var at = s.stuck.indexOf(label);
              if (at === -1) s.stuck.push(label); else s.stuck.splice(at, 1);
              save(); render();
            }
          }));
        });
        panel.appendChild(chipRow);
        panel.appendChild(el('textarea', {
          rows: '2', placeholder: 'Anything else? (optional)', value: s.note,
          oninput: function () { s.note = this.value; save(); }
        }));
        card.appendChild(panel);
      }

      /* optional confidence tag */
      if (cfg.confidence) {
        var conf = el('div', { class: 'panel' });
        conf.appendChild(el('h3', { text: 'How sure are you?' }));
        var confRow = el('div', { class: 'chips' });
        CONFIDENCE_TAGS.forEach(function (tag) {
          confRow.appendChild(el('button', {
            class: 'chip', 'aria-pressed': String(s.confidence === tag), text: tag,
            onclick: function () { s.confidence = (s.confidence === tag ? '' : tag); save(); render(); }
          }));
        });
        conf.appendChild(confRow);
        card.appendChild(conf);
      }

      /* navigation — nothing is checked or locked until the final submit */
      var nav = el('div', { class: 'nav' }, [
        el('button', {
          class: 'btn', text: '← Back', disabled: index === 0 ? 'disabled' : null,
          onclick: function () { go(-1); }
        }),
        el('div', { class: 'spacer' }),
        index < problems.length - 1
          ? el('button', { class: 'btn btn-primary', text: 'Next →', onclick: function () { go(1); } })
          : el('button', { class: 'btn btn-primary', text: 'Finish and check', onclick: finish })
      ]);
      card.appendChild(nav);

      return card;
    }

    function go(step) {
      var next = index + step;
      if (next < 0) return;
      if (next >= problems.length) { finish(); return; }
      index = next;
      save();
      render();
    }

    function finish() {
      var blank = problems.filter(function (_, i) { return !answered(i); }).length;
      var msg = blank
        ? 'You have ' + blank + ' problem' + (blank === 1 ? '' : 's') + ' with no answer yet. Finish anyway?'
        : 'Ready to check your answers? You can look back but not change them after this.';
      if (!global.confirm(msg)) return;
      screen = 'review';
      submitted = true;
      save();
      render();
      global.scrollTo(0, 0);
    }

    /* ---- review screen: also the parent debrief view ---- */

    function renderReview() {
      var frag = document.createDocumentFragment();
      var n = score();

      var head = el('div', { class: 'card' });
      head.appendChild(el('p', { class: 'eyebrow', text: 'Review' }));
      head.appendChild(el('p', { class: 'score' }, [
        document.createTextNode(n + ' / ' + problems.length + ' '),
        el('small', { text: 'correct' })
      ]));

      // Retaking has to be possible and obvious. Without this, reopening a finished
      // quiz restored the old report with no way forward, which reads as "the browser
      // won't let me take it again". Two taps rather than a confirm dialog: a modal
      // here would be one more thing to read, and the second tap says what it does.
      var againArmed = false;
      var again = el('button', {
        class: 'again',
        text: 'Start again',
        onclick: function () {
          if (!againArmed) {
            againArmed = true;
            again.textContent = 'Tap again to clear this attempt';
            again.classList.add('armed');
            return;
          }
          try { localStorage.removeItem(storeKey); } catch (e) { /* ignore */ }
          state = problems.map(function () {
            return { answer: '', hints: 0, stuck: [], note: '', confidence: '' };
          });
          reflection = { hardest: '', note: '', owns: {} };
          index = 0;
          screen = 'start';
          submitted = false;
          restoredReview = false;
          render();
        }
      });
      head.appendChild(el('p', { class: 'again-wrap' }, [
        again,
        el('span', {
          class: 'again-note',
          text: 'Answers stay as they were handed in. Starting again wipes this attempt and begins from the first problem.'
        })
      ]));
      frag.appendChild(head);

      var list = el('div', { class: 'card review' });
      problems.forEach(function (p, i) {
        var right = graded(i);
        var s = state[i];
        var bits = [];
        if (s.hints) bits.push(s.hints + ' hint' + (s.hints === 1 ? '' : 's'));
        if (s.stuck.length) bits.push('tried: ' + s.stuck.join(', '));
        if (s.note) bits.push('note: ' + s.note);
        if (cfg.confidence && s.confidence) bits.push(s.confidence);

        list.appendChild(el('div', { class: 'review-item' }, [
          el('span', { class: 'n', text: String(i + 1) }),
          el('span', {}, [
            el('span', { text: p.question }),
            el('br'),
            el('span', { class: 'given', text: 'You said: ' + (answered(i) ? s.answer : '(blank)') })
          ]),
          el('span', { class: 'verdict ' + (right ? 'right' : 'wrong'), text: right ? 'right' : 'wrong' }),
          bits.length ? el('span', { class: 'meta', text: bits.join(' · ') }) : null
        ]));
      });
      frag.appendChild(list);

      /* one tap choice plus one optional line. Nothing is required to finish. */
      var reflect = el('div', { class: 'card' });
      reflect.appendChild(el('h2', { text: 'Which problem was the hardest?' }));
      var row = el('div', { class: 'chips' });
      problems.forEach(function (_, i) {
        var label = 'Problem ' + (i + 1);
        row.appendChild(el('button', {
          class: 'chip', 'aria-pressed': String(reflection.hardest === label), text: String(i + 1),
          'aria-label': label,
          onclick: function () {
            reflection.hardest = (reflection.hardest === label ? '' : label);
            save();
            render();
          }
        }));
      });
      row.appendChild(el('button', {
        class: 'chip', 'aria-pressed': String(reflection.hardest === 'None of them'),
        text: 'None of them',
        onclick: function () {
          reflection.hardest = (reflection.hardest === 'None of them' ? '' : 'None of them');
          save();
          render();
        }
      }));
      reflect.appendChild(row);
      reflect.appendChild(el('textarea', {
        rows: '2', placeholder: 'Want to say why? (optional)', value: reflection.note,
        oninput: function () { reflection.note = this.value; save(); refreshReport(); }
      }));
      frag.appendChild(reflect);

      /* His verdict on the session's topics. Nothing is required; a blank row simply
         means he did not say, which is not the same as "not yet". */
      if (topics.length) {
        var own = el('div', { class: 'card' });
        own.appendChild(el('h2', { text: 'Do you feel you own these?' }));
        own.appendChild(el('p', {
          class: 'lede',
          text: 'Your call, not the score\'s. Nothing gets marked mastered unless you say so.'
        }));
        topics.forEach(function (topic) {
          var row = el('div', { class: 'own-row' });
          row.appendChild(el('span', { class: 'own-topic', text: topic }));
          var tagRow = el('div', { class: 'chips' });
          OWNERSHIP_TAGS.forEach(function (tag) {
            tagRow.appendChild(el('button', {
              class: 'chip', 'aria-pressed': String(reflection.owns[topic] === tag), text: tag,
              onclick: function () {
                reflection.owns[topic] = (reflection.owns[topic] === tag ? '' : tag);
                save();
                render();
              }
            }));
          });
          row.appendChild(tagRow);
          own.appendChild(row);
        });
        frag.appendChild(own);
      }

      frag.appendChild(renderReport());
      return frag;
    }

    /* ---- report: copy and download, no libraries ---- */

    function reportText() {
      var lines = [];
      lines.push('MATH JOURNEY — ' + label);
      if (cfg.title) lines.push(cfg.title);
      lines.push('Date: ' + today());
      lines.push('Score: ' + score() + ' / ' + problems.length);
      lines.push('');

      problems.forEach(function (p, i) {
        var s = state[i];
        lines.push('--- Problem ' + (i + 1) + (p.topic ? ' (' + p.topic + (p.level ? ', ' + p.level : '') + ')' : '') + ' ---');
        lines.push(p.question);
        lines.push('Result:       ' + (graded(i) ? 'correct' : 'incorrect'));
        lines.push('Answer given: ' + (answered(i) ? s.answer : '(blank)'));
        lines.push('Hints used:   ' + s.hints);
        lines.push('Stuck tags:   ' + (s.stuck.length ? s.stuck.join(', ') : '—'));
        if (s.note) lines.push('Note:         ' + s.note);
        if (cfg.confidence) lines.push('Confidence:   ' + (s.confidence || '—'));
        lines.push('');
      });

      // The block the whole downstream model runs off. Every topic below marked
      // "partial" or "not solved" gets its own lesson; "solved" topics get none.
      lines.push('--- Topic results (this is the lesson queue) ---');
      verdictsFor(problems, state, graded).forEach(function (v) {
        lines.push('  ' + v.verdict.toUpperCase().padEnd(11) +
          v.right + '/' + v.total + '  ' + v.topic +
          (v.guessed ? '  [' + v.guessed + ' guessed]' : ''));
      });
      lines.push('');

      lines.push('--- Reflection ---');
      lines.push('Hardest problem: ' + (reflection.hardest || '—'));
      lines.push('In his words:    ' + (reflection.note || '—'));
      lines.push('');

      if (topics.length) {
        lines.push('--- Does he feel he owns it? (his call; a "Not yet" blocks mastered) ---');
        topics.forEach(function (topic) {
          lines.push('  ' + topic + ': ' + (reflection.owns[topic] || '(did not say)'));
        });
        lines.push('');
      }
      return lines.join('\n');
    }

    /* A mail body has to fit in a URL — browsers and mail clients start dropping
     * mailto: links somewhere around 2000 characters. The full report fits for a check
     * but not for a unit assessment, so build a short version when it has to. */
    function mailBody() {
      var full = reportText();
      if (encodeURIComponent(full).length < 1800) return full;

      var lines = [];
      lines.push('MATH JOURNEY — ' + label);
      lines.push('Date: ' + today());
      lines.push('Score: ' + score() + ' / ' + problems.length);
      lines.push('');
      lines.push('--- Topic results (this is the lesson queue) ---');
      verdictsFor(problems, state, graded).forEach(function (v) {
        lines.push('  ' + v.verdict.toUpperCase().padEnd(11) +
          v.right + '/' + v.total + '  ' + v.topic +
          (v.guessed ? '  [' + v.guessed + ' guessed]' : ''));
      });
      lines.push('');
      lines.push('--- Per problem ---');
      problems.forEach(function (p, i) {
        var s = state[i];
        lines.push('  ' + (i + 1) + '. ' + (graded(i) ? 'right' : 'WRONG') +
          '  said "' + (answered(i) ? s.answer : '(blank)') + '"' +
          (s.hints ? ', ' + s.hints + ' hint' + (s.hints === 1 ? '' : 's') : '') +
          (cfg.confidence && s.confidence ? ', ' + s.confidence : ''));
      });
      lines.push('');
      lines.push('Hardest problem: ' + (reflection.hardest || '—'));
      if (reflection.note) lines.push('In his words:    ' + reflection.note);
      lines.push('');
      lines.push('(Shortened to fit in an email. The downloaded .txt has the full detail:');
      lines.push('stuck-tags, notes, and his ownership verdict per topic.)');
      return lines.join('\n');
    }

    function refreshReport() {
      var box = document.getElementById('report');
      if (box) box.value = reportText();
    }

    function renderReport() {
      var card = el('div', { class: 'card' });
      card.appendChild(el('h2', { text: 'Send this back' }));
      if (restoredReview) {
        card.appendChild(el('p', {
          class: 'hint-note',
          text: 'This is the finished report from earlier, restored from this browser.'
        }));
      }
      card.appendChild(el('p', {
        class: 'lede',
        text: 'Email it, download it, or copy it. It has every answer, every hint used, and what he said about it.'
      }));

      var status = el('span', { class: 'copied' });
      var area = el('textarea', { id: 'report', rows: '18', readonly: 'readonly' });
      area.value = reportText();

      var filename = 'report_' + slug + '_' + today() + '.txt';

      /* A downloaded file survives everything; email depends on a mail app actually
       * being set up on the device, which cannot be checked from here. So Download is
       * the primary action and comes first, with Send to parent secondary beside it. */
      var downloadBtn = el('button', {
        class: 'btn btn-primary', text: 'Download report',
        onclick: function () {
          var blob = new Blob([area.value], { type: 'text/plain;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = el('a', { href: url, download: filename });
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          status.textContent = 'Saved as ' + filename;
        }
      });

      /* Opens the device's mail app with the report already written. The To field is
       * left EMPTY on purpose: this page is world-readable, and an address published
       * here would be scraped. The mail app fills the recipient from contacts.
       *
       * Clicking this link only ever *requests* that the OS open a mail app — nothing
       * here confirms one actually did, so the status line must not claim it opened. */
      var mailBtn = el('a', {
        class: 'btn',
        href: 'mailto:?subject=' + encodeURIComponent('Math Journey — ' + label + ' — ' + today()) +
              '&body=' + encodeURIComponent(mailBody()),
        text: 'Send to parent',
        onclick: function () { status.textContent = "If your email app doesn't open, use Download instead."; }
      });

      var copyBtn = el('button', {
        class: 'btn', text: 'Copy report',
        onclick: function () {
          var text = area.value;
          var done = function () { status.textContent = 'Copied.'; };
          var fallback = function () {
            area.removeAttribute('readonly');
            area.focus();
            area.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            area.setAttribute('readonly', 'readonly');
            status.textContent = ok ? 'Copied.' : 'Select the text above and copy it.';
          };
          if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
            global.navigator.clipboard.writeText(text).then(done, fallback);
          } else {
            fallback();
          }
        }
      });

      card.appendChild(el('div', { class: 'report-actions' }, [downloadBtn, mailBtn, copyBtn, status]));
      card.appendChild(area);
      return card;
    }

    /* ---- mount ---- */

    function render() {
      root.textContent = '';
      if (screen === 'start') { root.appendChild(renderStart()); return; }
      root.appendChild(renderRail());
      if (screen === 'review') {
        root.appendChild(renderReview());
      } else {
        root.appendChild(renderProblem());
        // Non-negotiable: the playbook card stays visible for the whole climb.
        root.appendChild(renderPlaybook(false));
      }
    }

    if (!root) throw new Error('quiz.js: no element with id="quiz" on the page');

    // Authoring guards. These are silent-failure traps: an untagged problem vanishes from
    // the lesson queue, and a single-problem topic can never come back "partial", so it
    // reads as pass/fail with no middle. Both are invisible in the finished report.
    problems.forEach(function (p, i) {
      if (!p.topic) console.warn('quiz.js: problem ' + (i + 1) + ' has no topic — it will not appear in the lesson queue.');
    });
    topicsOf(problems).forEach(function (t) {
      var n = problems.filter(function (p) { return p.topic === t; }).length;
      if (n < 2) console.warn('quiz.js: topic "' + t + '" has only ' + n + ' problem — "partial" cannot occur for it.');
    });

    render();
  }

  global.MathQuiz = {
    start: start, isCorrect: isCorrect, toNumber: toNumber,
    // exposed so the verdict rule can be tested directly, without driving the UI
    verdictsFor: verdictsFor, topicsOf: topicsOf
  };
})(window);
