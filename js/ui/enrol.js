// Adding a subject and editing its settings. Shared by My subjects and the subject page, so
// both open the same window, save the same preferences (`preferences.tiers[subject_id]` for a
// tiered GCSE) and tick learned topics for the tier the student chose. Subjects with module
// routes (Further Maths) also save `preferences.moduleRoutes[subject_id]` and tick only the
// chosen route's points.

import * as api from '../data/api.js';
import { getBundle, specIndex } from '../data/content-repository.js';
import { isTiered, tierLeaves } from '../engine/tiers.js';
import { coverageDialog } from './coverage-dialog.js';
import { saveModuleChoice } from './module-scope.js';
import { scopeBundle, tierLearningCounts } from './student.js';
import { saveSubjectSettings } from './subject-colours.js';
import { subjectDialog } from './subject-dialog.js';

/**
 * Opens the "Add <subject>" window and, when confirmed, enrols the student and saves colour,
 * tier and target grade. "I've covered everything" ticks only the chosen tier's points.
 * @returns {Promise<boolean>} whether the subject was added
 */
export async function addSubject(subject, { initialTier = null } = {}) {
  const bundle = subject.has_written_exam ? await getBundle(subject.subject_id) : null;
  const learned = api.learnedSet();
  const textbookMode = Boolean(bundle?.textbooks && api.getProgress().preferences[`coveredView:${subject.subject_id}`] !== 'official');
  const scoped = bundle ? scopeBundle(bundle) : null;
  const allLeaves = scoped ? scoped.scopeLeaves || specIndex.subjectLeaves(subject.subject_id) : [];
  const learningIds = textbookMode ? bundle.textbooks.ids : allLeaves;
  const choice = await subjectDialog({
    subject,
    mode: 'add',
    leaves: learningIds.length,
    learningUnit: textbookMode ? 'textbook sections' : 'spec points',
    coveredCount: learningIds.filter((id) => learned.has(id)).length,
    initialTier,
    papers: bundle?.papers || null,
    tierCounts: bundle && !textbookMode ? tierLearningCounts(subject, learned) : null,
    spec: bundle?.spec || null,
  });
  if (!choice) return false;
  await api.setEnrolled(subject.subject_id, true);
  // Save the route first, so "covered everything" and the topic list use the chosen modules.
  if (choice.modules) await saveModuleChoice(subject.subject_id, choice.modules);
  const routed = choice.modules && bundle ? scopeBundle(bundle) : null;
  await saveSubjectSettings(subject.subject_id, { swatch: choice.swatch, target: choice.target, tier: choice.tier });
  const tier = isTiered(subject) ? choice.tier || null : null;
  if (choice.learned === 'all') {
    if (textbookMode) {
      await api.setTextbookLearned(learningIds, true);
      await api.setPreference(`coveredView:${subject.subject_id}`, 'textbook');
    } else await api.setLearned(routed?.scopeLeaves || tierLeaves(specIndex, subject.subject_id, tier), true);
  }
  if (choice.learned === 'tick' && bundle) {
    const selected = await coverageDialog({ bundle: routed || bundle, tier });
    if (selected) {
      if (selected.official.added.length) await api.setLearned(selected.official.added, true);
      if (selected.official.removed.length) await api.setLearned(selected.official.removed, false);
      if (selected.textbook.added.length) await api.setTextbookLearned(selected.textbook.added, true);
      if (selected.textbook.removed.length) await api.setTextbookLearned(selected.textbook.removed, false);
      await api.setPreference(`coveredView:${subject.subject_id}`, selected.organisation);
    }
  }
  return true;
}

/**
 * Opens the "Edit <subject>" window and saves the result. Changing the tier never touches
 * learned ticks, attempts or history: the other tier's ticks are only hidden.
 * @returns {Promise<boolean>} whether anything was saved
 */
export async function editSubject(subject) {
  let papers = null;
  let tierCounts = null;
  let spec = null;
  if (subject.module_routes && subject.has_written_exam) spec = (await getBundle(subject.subject_id).catch(() => null))?.spec || null;
  if (isTiered(subject) && subject.has_written_exam) {
    const bundle = await getBundle(subject.subject_id).catch(() => null);
    papers = bundle?.papers || null;
    if (bundle && !bundle.textbooks) tierCounts = tierLearningCounts(subject);
  }
  const choice = await subjectDialog({ subject, mode: 'edit', papers, tierCounts, spec });
  if (!choice) return false;
  await saveSubjectSettings(subject.subject_id, { swatch: choice.swatch, target: choice.target, tier: choice.tier });
  // Changing route never touches learned ticks: other modules' ticks are only hidden.
  if (choice.modules) await saveModuleChoice(subject.subject_id, choice.modules);
  return true;
}
