// A curriculum mapping is an alternate organisation of canonical spec leaves,
// not a replacement for the specification tree or learned records.
// Only reviewed, sourced mappings are exposed to students.

const present = (value) => typeof value === 'string' && value.trim().length > 0;

/** Validate a versioned mapping and return its selectable, verified views.
 * Coverage entries refer to leaf IDs and distinguish full from partial coverage.
 * A partial entry is useful for browsing, but must never mark the whole leaf learned.
 */
export function createCurriculumMap(document, specIndex) {
  if (!document || !present(document.subject_id) || !specIndex.hasSubject(document.subject_id)) {
    throw new TypeError('A loaded subject specification is required for curriculum mappings.');
  }
  const subjectId = document.subject_id;
  const leaves = new Set(specIndex.subjectLeaves(subjectId));
  const ids = new Set();

  function validateEntry(entry, kind) {
    if (!present(entry.id) || ids.has(entry.id) || !present(entry.title)) throw new TypeError(`Invalid or duplicate ${kind} id or title.`);
    ids.add(entry.id);
    if (!Array.isArray(entry.coverage) || !entry.coverage.length) throw new TypeError(`${entry.id} must contain coverage.`);
    const seen = new Set();
    for (const item of entry.coverage) {
      if (!leaves.has(item.point_id) || seen.has(item.point_id) || !['full', 'partial'].includes(item.extent)) {
        throw new TypeError(`Invalid coverage in ${entry.id}.`);
      }
      if (item.extent === 'partial' && !present(item.note)) throw new TypeError(`Partial coverage in ${entry.id} needs an explanation.`);
      seen.add(item.point_id);
    }
  }

  const years = [];
  const books = [];
  for (const mapping of document.mappings || []) {
    // Provisional records may be kept for review, but cannot appear as verified choices.
    if (mapping.status !== 'verified') continue;
    if (!present(mapping.source_url) || !/^https:\/\//.test(mapping.source_url) || !present(mapping.reviewed_at) || !present(mapping.specification_version)) {
      throw new TypeError('Verified mappings require a source, review date and specification version.');
    }
    if (mapping.type === 'year') {
      if (!Array.isArray(mapping.years)) throw new TypeError('Year mapping needs years.');
      for (const year of mapping.years) {
        if (![12, 13].includes(year.year)) throw new TypeError('Invalid content year.');
        validateEntry(year, 'year');
        years.push({ ...year, source_url: mapping.source_url, specification_version: mapping.specification_version });
      }
    } else if (mapping.type === 'textbook') {
      if (![mapping.id, mapping.publisher, mapping.book, mapping.edition].every(present) || ids.has(mapping.id) || !Array.isArray(mapping.chapters)) {
        throw new TypeError('Textbook mapping needs a unique id, publisher, book, edition and chapters.');
      }
      ids.add(mapping.id);
      for (const chapter of mapping.chapters) validateEntry(chapter, 'chapter');
      books.push({ ...mapping, chapters: [...mapping.chapters] });
    } else throw new TypeError('Unknown verified curriculum mapping type.');
  }

  /** Selection is read-only. Callers explicitly decide whether to update learned status. */
  function coverage(entries) {
    const full = new Set();
    const partial = new Map();
    for (const entry of entries) for (const item of entry.coverage) {
      if (item.extent === 'full') full.add(item.point_id);
      else {
        if (!partial.has(item.point_id)) partial.set(item.point_id, []);
        partial.get(item.point_id).push(item.note);
      }
    }
    for (const id of full) partial.delete(id);
    return { full, partial, visible: new Set([...full, ...partial.keys()]) };
  }

  return { subjectId, years, books, coverage };
}
