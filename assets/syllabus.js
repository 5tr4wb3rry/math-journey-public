/*
  THE TOPIC MAP — the single source of truth for every topic, its status, its unit and its
  lesson. index.html renders all three tabs from this file, and scripts/build-plan.js
  regenerates state/learning-plan.md from it. Edit here; never edit those.

  `name` is the canonical spelling of the topic. A quiz problem's `topic` field must match one
  of these strings exactly, or its verdict never reaches the lesson queue.

  PUBLISHED — this file is world-readable. Statuses and lesson blurbs only. No answers, no
  quiz numbers, nothing naming the learner. Private reasoning lives in state/plan-notes.md.

  Fields per topic:
    name     canonical topic text (quizzes must match it exactly)
    short    optional shorter label for the Units table
    area     one of AREAS[].id
    status   'not started' | 'in progress' | 'covered' | 'mastered'
    unit     a UNITS[].id, or null when no unit is working on it yet
    heSays   set to 'not yet' when his own verdict disagrees with the record — shown, never hidden
    lesson   null, or { slug, blurb, retaught } — retaught means it was rewritten a different way
    check    null, or 'not taken' | 'passed' | 'partial' | 'retired' — the state of that
             lesson's check; 'retired' means it was closed without being taken
*/
(function () {
  var AREAS = [
    { id: 'alg',   name: 'Algebra' },
    { id: 'count', name: 'Counting & probability' },
    { id: 'nt',    name: 'Number theory' },
    { id: 'fn',    name: 'Functions & graphs' },
    { id: 'geo',   name: 'Geometry' },
    { id: 'calc',  name: 'Toward calculus' },
    { id: 'meta',  name: 'Problem-solving craft' }
  ];

  var UNITS = [
    {
      id: 'unit1',
      name: 'Unit 1 · Naming the Unknown',
      open: true,
      assessment: 'unit1/unit-assessment.html',
      lede: 'Ten topics. The theme is giving a name to what you do not know and then working ' +
            'with the name instead of the number: identities, rates, counting and cycles all ' +
            'turn out to be the same habit.',
      takes: 'Identities, rates, counting and cycles — the habit of naming what you do not know.'
    },
    {
      id: 'unit2',
      name: 'Unit 2 · Structure Hunting',
      open: false,
      takes: 'Factoring, difference of squares, cube identities, exponent laws, substitution as ' +
             'a weapon — with multi-step chains as the organising constraint.'
    },
    {
      id: 'unit3',
      name: 'Unit 3 · Counting & Casework',
      open: false,
      takes: 'Promoted from later in the year because counting is the thinnest strand: organised ' +
             'casework, counting the complement, inclusion–exclusion beyond two sets.'
    },
    {
      id: 'later',
      name: 'Later',
      open: false,
      takes: 'Two Unknowns → Relationships → Growth & Squares.'
    }
  ];

  var TOPICS = [
    /* ---- Algebra ---- */
    { name: 'Variables, expressions, evaluating and translating', area: 'alg', status: 'covered', unit: null },
    { name: 'Linear equations, one unknown (all forms)', area: 'alg', status: 'covered', unit: 'unit1' },
    { name: 'Sign discipline with negatives and powers', area: 'alg', status: 'covered', unit: null },
    { name: 'Squaring identities: (a±b)², sum & product → a²+b²', area: 'alg', status: 'covered', unit: 'unit1' },
    { name: 'Symmetric expressions in three variables', area: 'alg', status: 'covered', unit: 'unit1' },
    {
      name: 'The x + 1/x family, iterated (x²+1/x², x³+1/x³, x⁴+1/x⁴)',
      short: 'The x + 1/x family, iterated',
      area: 'alg', status: 'covered', unit: 'unit1',
      lesson: {
        slug: 'the-x-plus-1-over-x-family-iterated',
        retaught: true,
        blurb: 'Rewritten: one move, treated as a machine whose output you can feed straight ' +
               'back in — plus a five-second check that catches a wrong answer without redoing the work.'
      },
      check: 'retired'
    },
    { name: 'Difference of squares; factoring as un-multiplying', area: 'alg', status: 'not started', unit: null },
    { name: 'Cubes: sum and difference; the cube identities', area: 'alg', status: 'not started', unit: null },
    { name: 'Exponent laws, including zero and negative exponents', area: 'alg', status: 'not started', unit: null },
    { name: 'Substitution as a simplifying weapon', area: 'alg', status: 'not started', unit: null },
    { name: 'Systems of two equations: substitution, elimination', area: 'alg', status: 'not started', unit: null },
    { name: 'Word problems: age, money, consecutive numbers', area: 'alg', status: 'covered', unit: null },
    {
      name: 'Rate, work, and mixture problems',
      area: 'alg', status: 'covered', unit: 'unit1',
      lesson: {
        slug: 'rate-work-and-mixture-problems',
        blurb: 'Rates add, times don’t — and the flip back to a time is the step that gets dropped.'
      },
      check: 'passed'
    },
    { name: 'Inequalities and absolute value', area: 'alg', status: 'not started', unit: null },
    { name: 'Quadratics: factoring, completing the square, the discriminant', area: 'alg', status: 'not started', unit: null },
    { name: 'Radicals and irrational numbers', area: 'alg', status: 'not started', unit: null },

    /* ---- Counting & probability ---- */
    { name: 'Multiplication principle; simple product counting', area: 'count', status: 'covered', unit: 'unit1' },
    { name: 'Inclusion–exclusion, two sets', area: 'count', status: 'covered', unit: 'unit1' },
    { name: 'Organized casework decided before counting', area: 'count', status: 'in progress', unit: null },
    {
      name: 'Choosing vs. arranging; combinations',
      area: 'count', status: 'mastered', unit: 'unit1',
      lesson: {
        slug: 'choosing-vs-arranging-combinations',
        retaught: true,
        blurb: 'Rewritten: one test that works even when the problem never says which it is — ' +
               'swap two of the things you picked and see whether anything changed.'
      },
      check: 'passed'
    },
    { name: 'Permutations, including with repetition', area: 'count', status: 'not started', unit: null },
    { name: 'Counting the complement', area: 'count', status: 'not started', unit: null },
    { name: 'Inclusion–exclusion, three or more sets', area: 'count', status: 'not started', unit: null },
    { name: 'Basic probability; equally likely outcomes', area: 'count', status: 'not started', unit: null },
    { name: 'Expected value', area: 'count', status: 'not started', unit: null },
    { name: 'Counterintuitive classics (birthday, Monty Hall)', area: 'count', status: 'not started', unit: null },

    /* ---- Number theory ---- */
    { name: 'Units-digit and last-digit cycles', area: 'nt', status: 'covered', unit: null, heSays: 'not yet' },
    { name: 'Remainder cycles; modular arithmetic informally', area: 'nt', status: 'covered', unit: 'unit1' },
    { name: 'Divisibility rules', area: 'nt', status: 'covered', unit: null },
    { name: 'Prime factorization as a tool', area: 'nt', status: 'not started', unit: null },
    {
      name: 'Counting factors and divisors',
      area: 'nt', status: 'covered', unit: 'unit1', heSays: 'getting there',
      lesson: {
        slug: 'counting-factors-and-divisors',
        blurb: 'Trailing zeros of a factorial, and how many divisors a number has — without listing them.'
      },
      check: 'passed'
    },
    { name: 'GCD and LCM, and what they mean', area: 'nt', status: 'not started', unit: null },
    { name: 'Modular arithmetic formally; congruences', area: 'nt', status: 'not started', unit: null },

    /* ---- Functions & graphs ---- */
    { name: 'Coordinates; plotting points', area: 'fn', status: 'covered', unit: null },
    { name: 'Function machines; f(x) notation', area: 'fn', status: 'not started', unit: null },
    { name: 'Lines: slope, intercepts, slope as a rate', area: 'fn', status: 'not started', unit: null },
    { name: 'Graphs of quadratics; the parabola and its vertex', area: 'fn', status: 'not started', unit: null },
    { name: 'Reading graphs as stories; a zoo of shapes', area: 'fn', status: 'not started', unit: null },
    { name: 'Transformations of graphs', area: 'fn', status: 'not started', unit: null },
    { name: 'Exponential growth and decay', area: 'fn', status: 'not started', unit: null },
    { name: 'Logarithms as the inverse question', area: 'fn', status: 'not started', unit: null },

    /* ---- Geometry ---- */
    { name: 'Area and perimeter as algebra in disguise', area: 'geo', status: 'not started', unit: null },
    { name: 'Angles, parallel lines, triangle facts', area: 'geo', status: 'not started', unit: null },
    { name: 'The Pythagorean theorem and its proofs', area: 'geo', status: 'not started', unit: null },
    { name: 'Similarity and scaling', area: 'geo', status: 'not started', unit: null },
    { name: 'Circles: arcs, sectors, inscribed angles', area: 'geo', status: 'not started', unit: null },
    { name: 'Coordinate geometry', area: 'geo', status: 'not started', unit: null },
    { name: 'Writing a proof', area: 'geo', status: 'not started', unit: null },
    { name: 'Trigonometry: ratios, the unit circle', area: 'geo', status: 'not started', unit: null },

    /* ---- Toward calculus ---- */
    { name: 'Sequences and series; arithmetic and geometric', area: 'calc', status: 'not started', unit: null },
    { name: 'Optimization: best-possible problems without calculus', area: 'calc', status: 'not started', unit: null },
    { name: 'Limits, informally then formally', area: 'calc', status: 'not started', unit: null },
    { name: 'Rate of change; the derivative', area: 'calc', status: 'not started', unit: null },
    { name: 'Differentiation rules; curve sketching', area: 'calc', status: 'not started', unit: null },
    { name: 'Accumulation; the integral', area: 'calc', status: 'not started', unit: null },
    { name: 'The fundamental theorem', area: 'calc', status: 'not started', unit: null },
    { name: 'Differential equations and modeling', area: 'calc', status: 'not started', unit: null },

    /* ---- Problem-solving craft ---- */
    { name: 'The Opening Playbook: six first moves on an alien problem', area: 'meta', status: 'in progress', unit: null },
    { name: 'Reaching for structure before examples', area: 'meta', status: 'covered', unit: null },
    { name: 'Carrying a method through to the actual question asked', area: 'meta', status: 'in progress', unit: null },
    { name: 'Checking an answer for plausibility before submitting', area: 'meta', status: 'not started', unit: null },
    { name: 'Knowing how sure you are (calibrated confidence)', area: 'meta', status: 'not started', unit: null },
    { name: 'Reapplying a weapon in a multi-step chain', area: 'meta', status: 'in progress', unit: null },
    { name: 'Explaining a solution so someone else understands it', area: 'meta', status: 'not started', unit: null },
    { name: 'Tolerating being stuck; treating it as information', area: 'meta', status: 'in progress', unit: null }
  ];

  // The Units table's Stage column and the plan's "where it stands" both need one phrase per
  // topic. Derived here so the page and the generated plan can never disagree.
  function stageOf(t) {
    if (!t.lesson) return { label: 'no lesson needed', tone: 'cov' };
    if (t.check === 'passed') return { label: 'check passed', tone: 'cov' };
    // Closed by decision rather than by a check. Recorded as its own state so the page
    // never claims a quiz was taken that was not.
    if (t.check === 'retired') return { label: 'closed without a check', tone: 'cov' };
    if (t.check === 'partial') return { label: 'check came back partial', tone: 'prog' };
    if (t.lesson.retaught) return { label: 'retaught · check waiting', tone: 'prog' };
    return { label: 'check not taken', tone: 'prog' };
  }

  var SYLLABUS = {
    areas: AREAS,
    units: UNITS,
    topics: TOPICS,
    stageOf: stageOf,
    areaName: function (id) {
      var a = AREAS.filter(function (x) { return x.id === id; })[0];
      return a ? a.name : id;
    },
    unitNamed: function (id) {
      return UNITS.filter(function (u) { return u.id === id; })[0] || null;
    },
    inArea: function (id) {
      return TOPICS.filter(function (t) { return t.area === id; });
    },
    inUnit: function (id) {
      return TOPICS.filter(function (t) { return t.unit === id; });
    },
    withLessons: function () {
      return TOPICS.filter(function (t) { return t.lesson; });
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SYLLABUS;
  if (typeof window !== 'undefined') window.SYLLABUS = SYLLABUS;
})();
