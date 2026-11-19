// Optional-module routes for subjects such as Edexcel Further Mathematics, where a
// student sits mandatory core content plus one of a fixed set of option routes.
//
// The registry entry carries `module_routes` (modules, the official routes per
// qualification code and the rules text). A student's choice is stored under
// preferences.moduleRoutes[subjectId]:
//
//   { levels: ['9FM0', '8FM0'],          qualifications studied (AS, A-Level or both)
//     routes: { '9FM0': '3A+3B', '8FM0': '2B' },   one official route per level
//     extra:  { '9FM0': ['FS2'] },        extra modules for practice only (not the grade route)
//     showAll: false }                    deliberate "All options" view
//
// Choosing a route never changes learned ticks: unselected modules are hidden, not cleared.
// Everything here is pure so it can be tested without a browser.

const asSet = (values) => new Set(values || []);

/** Does this subject have optional-module routes? */
export const hasModuleRoutes = (subject) => Boolean(subject?.module_routes?.modules?.length);

export const moduleList = (subject) => subject?.module_routes?.modules || [];
export const moduleById = (subject, id) => moduleList(subject).find((module) => module.id === id) || null;
export const mandatoryModules = (subject) => moduleList(subject).filter((module) => module.mandatory).map((module) => module.id);
export const optionalModules = (subject) => moduleList(subject).filter((module) => !module.mandatory).map((module) => module.id);

/** Qualification codes in the order the registry lists them (A-Level first, then AS). */
export const levelCodes = (subject) => (subject?.qualifications || []).map((item) => item.code);
export const levelLabel = (subject, code) => (subject?.qualifications || []).find((item) => item.code === code)?.label || code;

/** The official routes for one qualification code. */
export const routesFor = (subject, level) => subject?.module_routes?.routes?.[level] || [];
export const routeByCode = (subject, level, code) => routesFor(subject, level).find((route) => route.code === code) || null;

/** The official route whose modules are exactly this pair (order ignored), or null. */
export function routeForModules(subject, level, moduleIds) {
  const wanted = [...asSet(moduleIds)].sort().join('|');
  return routesFor(subject, level).find((route) => [...route.modules].sort().join('|') === wanted) || null;
}

/** Is this set of optional modules one of the permitted routes for the level? */
export const isValidRoute = (subject, level, moduleIds) => Boolean(routeForModules(subject, level, moduleIds));

/**
 * Cleans a stored choice: unknown levels, routes that are not official and extras
 * that duplicate the route or are not optional modules are dropped.
 */
export function normaliseChoice(subject, raw) {
  const codes = levelCodes(subject);
  const optional = new Set(optionalModules(subject));
  const levels = codes.filter((code) => (raw?.levels || []).includes(code));
  const routes = {};
  const extra = {};
  for (const level of levels) {
    const route = routeByCode(subject, level, raw?.routes?.[level]);
    if (route) routes[level] = route.code;
    const inRoute = new Set(route?.modules || []);
    const extras = [...new Set(raw?.extra?.[level] || [])].filter((id) => optional.has(id) && !inRoute.has(id));
    if (extras.length) extra[level] = extras;
  }
  return { levels, routes, extra, showAll: Boolean(raw?.showAll) };
}

/** A route is saved for every chosen level. */
export const isConfigured = (subject, choice) => {
  const clean = normaliseChoice(subject, choice);
  return clean.levels.length > 0 && clean.levels.every((level) => clean.routes[level]);
};

/**
 * What a student can currently see.
 * Without a saved route the scope is the mandatory core only (for the chosen levels,
 * or every level when none is chosen) and `configured` is false, so the UI can prompt.
 * `showAll` deliberately reveals every optional module for the chosen levels.
 * @returns {null | { configured, showAll, levels: string[], modules: Map<string, Set<string>>, sections: Set<string>, routeModules: Map<string, Set<string>> }}
 */
export function scopeOf(subject, rawChoice) {
  if (!hasModuleRoutes(subject)) return null;
  const choice = normaliseChoice(subject, rawChoice);
  const configured = isConfigured(subject, choice);
  const levels = choice.levels.length ? choice.levels : levelCodes(subject);
  const modules = new Map();
  const routeModules = new Map();
  for (const level of levels) {
    const route = routeByCode(subject, level, choice.routes[level]);
    const official = new Set([...mandatoryModules(subject), ...(route?.modules || [])]);
    routeModules.set(level, official);
    modules.set(level, choice.showAll
      ? new Set(moduleList(subject).map((module) => module.id))
      : new Set([...official, ...(choice.extra[level] || [])]));
  }
  const sections = new Set();
  for (const [level, ids] of modules) for (const id of ids) {
    const section = moduleById(subject, id)?.sections?.[level];
    if (section) sections.add(section);
  }
  return { configured, showAll: choice.showAll, levels, modules, sections, routeModules, choice };
}

const pointLevels = (point) => point.qualifications || point.official_reference?.qualifications || null;
const pointVisible = (point, levels) => {
  const own = pointLevels(point);
  return !own || own.some((code) => levels.includes(code));
};

/** The spec tree restricted to the scope's sections and to points its levels assess. */
export function scopeSpec(spec, scope) {
  if (!spec || !scope) return spec;
  const sections = (spec.sections || [])
    .filter((section) => scope.sections.has(section.id))
    .map((section) => ({
      ...section,
      topics: section.topics
        .map((topic) => ({ ...topic, points: topic.points.filter((point) => pointVisible(point, scope.levels)) }))
        .filter((topic) => topic.points.length),
    }))
    .filter((section) => section.topics.length);
  return { ...spec, sections };
}

/** Leaf ids (spec points) inside the scope, in tree order. */
export const scopeLeaves = (spec, scope) =>
  (scopeSpec(spec, scope)?.sections || []).flatMap((section) => section.topics.flatMap((topic) => (topic.points.length ? topic.points.map((point) => point.id) : [topic.id])));

const levelOf = (item, paper) => item?.qualification_code || paper?.qualification_code || item?.spec_code || paper?.spec_code || null;

/** Is a paper (all of its modules) inside the scope? */
export function paperInScope(paper, scope) {
  if (!scope) return true;
  const level = levelOf(paper);
  const allowed = scope.modules.get(level);
  if (!allowed) return false;
  const ids = paper.module_ids || [];
  return ids.length > 0 && ids.every((id) => allowed.has(id));
}

/**
 * Is a question inside the scope? A question names its module, otherwise it takes its
 * paper's single module. Without module information it is kept only when every
 * assessed point is visible in the scoped tree.
 */
export function questionInScope(question, paper, scope, visibleLeaves = null) {
  if (!scope) return true;
  const level = levelOf(question, paper);
  const allowed = scope.modules.get(level);
  if (!allowed) return false;
  const module = question.module_id || (paper?.module_ids?.length === 1 ? paper.module_ids[0] : null);
  if (module) return allowed.has(module);
  const points = question.primary_spec_points || [];
  return Boolean(visibleLeaves) && points.length > 0 && points.every((id) => visibleLeaves.has(id));
}

/** A short human summary, e.g. "A-Level: Core Pure + FP1 + FS1 · AS: Core Pure + 2B". */
export function describeScope(subject, scope) {
  if (!scope) return '';
  return scope.levels.map((level) => {
    const route = routeByCode(subject, level, scope.choice.routes[level]);
    const extras = scope.choice.extra[level] || [];
    const parts = [route ? `${route.label} (${route.modules.join(' + ')})` : 'route not chosen'];
    if (extras.length) parts.push(`extra ${extras.join(', ')}`);
    return `${levelLabel(subject, level)}: ${parts.join(', ')}`;
  }).join(' · ');
}

/**
 * Pearson's best-combination rule for students who sit more than two optional papers:
 * among the permitted pairs the student actually sat, use the pair with the highest
 * combined mark (the grade is awarded on the total out of 300, so the highest total
 * gives the best grade). `optionMarks` maps module id → mark.
 * @returns {null | { route, modules: string[], total: number }}
 */
export function bestOptionPair(subject, level, optionMarks) {
  let best = null;
  for (const route of routesFor(subject, level)) {
    if (!route.modules.every((id) => Number.isFinite(optionMarks?.[id]))) continue;
    const total = route.modules.reduce((sum, id) => sum + optionMarks[id], 0);
    if (!best || total > best.total) best = { route: route.code, modules: [...route.modules], total };
  }
  return best;
}
