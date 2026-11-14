// Builds data/curriculum/index.json for 9MA0: Year 12/13 views and Pearson textbook chapters,
// each mapped to canonical specification point ids (never replacing them).
//
// Evidence: chapter numbers and titles were read from the public PMT solution-bank listings for
// the four Pearson Edexcel A level Mathematics textbooks (retrieved 2026-11-14). Which
// specification points each chapter covers is an AI subject review, NOT a page-by-page check of
// the books, so every mapping carries status "model_reviewed". "~" marks partial coverage.
import { readFile, writeFile } from 'node:fs/promises';
const ROOT = new URL('../../', import.meta.url);
const spec = JSON.parse(await readFile(new URL('data/import/9MA0/specification.json', ROOT), 'utf8'));
const byKey = new Map(spec.points.map((p) => [`${p.papers[0] === 'P3' ? (p.id.includes('STATS') ? 'S' : 'M') : 'P'}${p.code}`, p.id]));
const cov = (list) => list.map((item) => {
  const [key, note] = item.split('~');
  if (!byKey.has(key)) throw new Error(`unknown point ${key}`);
  return note ? { point_id: byKey.get(key), extent: 'partial', note } : { point_id: byKey.get(key), extent: 'full' };
});
const PMT = 'https://www.physicsandmathstutor.com/maths-revision/solutionbanks/';
const BOOKS = [
  { id: 'pearson-9ma0-pure-year-1', book: 'Pure Mathematics Year 1/AS', year: 12, url: `${PMT}edexcel-pure-maths-year-1/`, chapters: [
    ['Algebraic expressions', ['P2.1', 'P2.2', 'P2.6~Expanding brackets and factorising only']],
    ['Quadratics', ['P2.3', 'P2.11~Modelling with quadratic functions']],
    ['Equations and inequalities', ['P2.4', 'P2.5']],
    ['Graphs and transformations', ['P2.7~Cubic, quartic and reciprocal graphs and points of intersection; the modulus function is Year 2', 'P2.9~Single translations, stretches and reflections; combined transformations are Year 2']],
    ['Straight line graphs', ['P3.1']],
    ['Circles', ['P3.2']],
    ['Algebraic methods', ['P2.6~Algebraic fractions, polynomial division and the factor theorem', 'P1.1~Proof by deduction, exhaustion and counter-example; contradiction is Year 2']],
    ['The binomial expansion', ['P4.1~Positive integer powers only']],
    ['Trigonometric ratios', ['P5.1~Sine rule, cosine rule and area of a triangle, in degrees', 'P5.3~Graphs and exact values in degrees']],
    ['Trigonometric identities and equations', ['P5.5~tan = sin/cos and sin^2 + cos^2 = 1 only', 'P5.7~Equations in degrees using the Year 1 identities']],
    ['Vectors', ['P10.1~Two dimensions only', 'P10.2', 'P10.3', 'P10.4~Two dimensions only', 'P10.5~Two-dimensional problems']],
    ['Differentiation', ['P7.1~Gradient as a limit and first principles for powers of x; second derivative', 'P7.2~Powers of x only', 'P7.3~Tangents, normals, stationary points, increasing and decreasing functions']],
    ['Integration', ['P8.1', 'P8.2~Powers of x only', 'P8.3~Definite integrals and areas for polynomial-type curves']],
    ['Exponentials and logarithms', ['P6.1', 'P6.2', 'P6.3', 'P6.4', 'P6.5', 'P6.6', 'P6.7']],
  ] },
  { id: 'pearson-9ma0-pure-year-2', book: 'Pure Mathematics Year 2', year: 13, url: `${PMT}edexcel-pure-maths-year-2/`, chapters: [
    ['Algebraic methods', ['P1.1~Proof by contradiction', 'P2.6~Operations with algebraic fractions and improper fractions', 'P2.10']],
    ['Functions and graphs', ['P2.7~The modulus function and its graphs', 'P2.8', 'P2.9~Combined transformations', 'P2.11~Problems using modulus and composite functions']],
    ['Sequences and series', ['P4.2', 'P4.3', 'P4.4', 'P4.5', 'P4.6']],
    ['Binomial expansion', ['P4.1~Rational powers, validity and use with partial fractions']],
    ['Radians', ['P5.1~Radian measure, arc length and sector area', 'P5.2', 'P5.3~Exact values and graphs in radians', 'P5.7~Equations in radians']],
    ['Trigonometric functions', ['P5.4', 'P5.5~sec^2 and cosec^2 identities', 'P5.8~Proofs using reciprocal functions']],
    ['Trigonometry and modelling', ['P5.6', 'P5.7~Equations using addition and double angle formulae', 'P5.8~Proofs using addition and double angle formulae', 'P5.9']],
    ['Parametric equations', ['P3.3', 'P3.4']],
    ['Differentiation', ['P7.1~Derivatives of sin and cos from first principles; convex and concave curves', 'P7.2~Exponentials, logarithms and trigonometric functions', 'P7.3~Points of inflection and concavity', 'P7.4', 'P7.5', 'P7.6~Connected rates of change and forming differential equations']],
    ['Numerical methods', ['P9.1', 'P9.2', 'P9.3', 'P9.5']],
    ['Integration', ['P8.2~Exponential, reciprocal and trigonometric integrals', 'P8.3~Areas between curves and harder definite integrals', 'P8.4', 'P8.5', 'P8.6', 'P8.7', 'P8.8', 'P9.4', 'P7.6~Modelling with differential equations']],
    ['Vectors', ['P10.1~Three dimensions', 'P10.4~Three dimensions', 'P10.5~Three-dimensional geometric problems']],
  ] },
  { id: 'pearson-9ma0-stats-mech-year-1', book: 'Statistics and Mechanics Year 1/AS', year: 12, url: `${PMT}edexcel-statistics-mechanics-year-1/`, chapters: [
    ['Data collection', ['S1.1']],
    ['Measures of location and spread', ['S2.3']],
    ['Representations of data', ['S2.1', 'S2.4']],
    ['Correlation', ['S2.2~Scatter diagrams, correlation and interpreting a regression line; change of variable is Year 2']],
    ['Probability', ['S3.1', 'S3.2~Venn and tree diagrams without the conditional probability formula']],
    ['Statistical distributions', ['S4.1']],
    ['Hypothesis testing', ['S5.1~Language of testing through the binomial model', 'S5.2']],
    ['Modelling in mechanics', ['M6.1', 'M7.1']],
    ['Constant acceleration', ['M7.2', 'M7.3~Straight-line motion; vector form is Year 2', 'M8.3']],
    ['Forces and motion', ['M8.1', 'M8.2~Straight-line motion without resolving forces', 'M8.4~Connected particles and pulleys without resolving', 'M8.5~Forces as vectors and resultants']],
    ['Variable acceleration', ['M7.4~Straight-line motion with polynomial functions of time']],
  ] },
  { id: 'pearson-9ma0-stats-mech-year-2', book: 'Statistics and Mechanics Year 2', year: 13, url: `${PMT}edexcel-statistics-mechanics-year-2/`, chapters: [
    ['Regression, correlation and hypothesis testing', ['S2.2~Exponential models, coding and change of variable', 'S5.1~Hypothesis tests for the product moment correlation coefficient']],
    ['Conditional probability', ['S3.2~Set notation and the conditional probability formula', 'S3.3']],
    ['The normal distribution', ['S4.2', 'S4.3', 'S5.3']],
    ['Moments', ['M9.1']],
    ['Forces and friction', ['M8.2~Resolving forces, including on inclined planes', 'M8.6~Friction on a body in motion or about to move']],
    ['Projectiles', ['M7.5']],
    ['Applications of forces', ['M8.4~Static particles and rigid bodies, connected particles on inclined planes', 'M8.5~Dynamics in a plane', 'M8.6~Limiting equilibrium and statics']],
    ['Further kinematics', ['M7.3~Constant acceleration with vectors in two dimensions', 'M7.4~Calculus with vectors and non-polynomial functions']],
  ] },
];
const common = { subject_id: 'EDX_ALEVEL_MATH_9MA0', status: 'model_reviewed', reviewed_at: '2026-11-14', specification_version: '9MA0-issue-4-2020',
  review_note: 'Chapter titles from the public PMT solution-bank listing of the Pearson textbooks. Point coverage assigned by AI subject review, not checked page by page against the books.' };
const mappings = [];
const yearCov = { 12: new Map(), 13: new Map() };
for (const b of BOOKS) {
  const chapters = b.chapters.map(([title, list], i) => ({ id: `${b.id}-ch${i + 1}`, position: i + 1, title: `${i + 1}. ${title}`, teaching_years: [b.year], coverage: cov(list) }));
  for (const ch of chapters) for (const c of ch.coverage) {
    const m = yearCov[b.year]; const prev = m.get(c.point_id);
    if (c.extent === 'full' || !prev) m.set(c.point_id, c.extent === 'full' ? c : prev ?? c);
  }
  mappings.push({ ...common, id: b.id, type: 'textbook', publisher: 'Pearson', book: `Edexcel A level Mathematics ${b.book}`, edition: '2017 specification edition', source_url: b.url, chapters });
}
// A point is "full" for a year only when no part of it sits in the other year's books.
const years = [12, 13].map((y) => ({ id: `9ma0-year-${y}`, title: `Year ${y}`, year: y, coverage: [...yearCov[y].values()].map((c) => {
  const other = yearCov[y === 12 ? 13 : 12].has(c.point_id);
  if (!other) return { point_id: c.point_id, extent: 'full' };
  return { point_id: c.point_id, extent: 'partial', note: c.note ?? (y === 12 ? 'Started in Year 12 and extended in Year 13' : 'Builds on Year 12 content') };
}) }));
mappings.unshift({ ...common, id: '9ma0-teaching-years', type: 'year', source_url: BOOKS[0].url, years });
const mapped = new Set([...yearCov[12].keys(), ...yearCov[13].keys()]);
const missing = spec.points.filter((p) => !mapped.has(p.id)).map((p) => `${p.section} ${p.code}`);
if (missing.length) throw new Error(`unmapped points: ${missing.join(', ')}`);
await writeFile(new URL('data/curriculum/index.json', ROOT), JSON.stringify({ mappings }, null, 1) + '\n');
console.log(`${mappings.length} mappings; ${BOOKS.reduce((n, b) => n + b.chapters.length, 0)} chapters; all ${spec.points.length} points mapped; Y12 ${yearCov[12].size} points, Y13 ${yearCov[13].size} points`);
