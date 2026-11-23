import { isEnabled } from '../config/phases.js';
import { isSafeUrl } from '../core/dom.js';
import { collapseLinked } from './linked-parts.js';
import { officialResourceUrl } from './question-resources.js';

const browserModes = ['individual', 'picker'];
const modeOrder = ['timed_test', ...browserModes];

function attemptable(question, paper) {
  if (question.is_sample || paper?.is_sample || paper?.resources_only
    || question.context?.required_stimulus_unavailable) return false;
  if (question.source_type === 'real_past_paper' && paper?.paper_type !== 'real_past_paper') return false;
  const { content = {}, context = {}, provenance } = question;
  const resources = context.official_resources || [];
  if (resources.some(resource => !officialResourceUrl(resource?.url))) return false;
  if (context.article && !context.article.page_image_urls?.some(isSafeUrl)
    && !officialResourceUrl(context.article.url)) return false;

  const prompt = content.question_html || isSafeUrl(content.question_image_url)
    || resources.some(resource => resource.kind === 'question_pdf');
  const officialScheme = officialResourceUrl(provenance?.scheme_source_url);
  const scheme = officialScheme || (!context.official_scheme_required
    && (content.mark_scheme_html || isSafeUrl(content.mark_scheme_image_url)));
  return Boolean(prompt && scheme && Number.isInteger(question.marks) && question.marks > 0);
}

/** Supported scoring units before the student's filters. */
export function testPool(pool, papersById) {
  return pool.filter(question => attemptable(question, papersById.get(question.paper_id)));
}

/** Linked entries are only attemptable if all their scored parts are available. */
export function testEntries(matches, pool, questionsById) {
  const available = new Set(pool.map(question => question.question_id));
  return collapseLinked(matches, questionsById).filter(question => {
    const parts = question.parts || [question];
    return parts.every(part => available.has(part.question_id)
      && (part.depends_on_question_ids || []).every(id => available.has(id)));
  });
}

export function practiceAvailability(subject, officialEntries) {
  const configured = subject.practice_modes || [];
  const hasBuilder = subject.has_written_exam !== false && isEnabled('customPractice')
    && officialEntries.some(question => question.source_type === 'real_past_paper');
  const modes = browserModes.filter(mode => configured.includes(mode));
  if (hasBuilder && !modes.length) modes.push('individual');
  if (hasBuilder) modes.push('timed_test');
  const defaultMode = modeOrder.find(mode => configured.includes(mode) && modes.includes(mode)) || modes[0];
  return { modes, defaultMode };
}

export function resolvePracticeMode({ modes, defaultMode }, requested) {
  if (modes.includes(requested)) return requested;
  if (browserModes.includes(requested)) return browserModes.find(mode => modes.includes(mode)) || defaultMode;
  return defaultMode;
}
