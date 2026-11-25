// Run from the repo root: node flashcard-build/geography/check-tags.mjs flashcard-build/geography/out/<deck>-set.json
import { readFileSync } from 'node:fs';
const repo = process.cwd() + '/';
const { createSpecIndex } = await import(repo + 'js/engine/spec-index.js');
const { createTagMapper, cardPoints } = await import(repo + 'js/flashcards/spec-map.js');
const SUBJECT = 'AQA_ALEVEL_GEOG_7037';
const index = createSpecIndex();
index.add(JSON.parse(readFileSync(repo + `data/specs/${SUBJECT}.json`, 'utf8')));
const map = createTagMapper(SUBJECT, index);
const cards = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let ok = 0, bad = [], skills = 0; const pts = new Set();
for (const c of cards) { const p = cardPoints(c.tags, map);
  if (c.deck === 'mark_scheme') { if (p.length) bad.push(c.front); else skills++; continue; }
  if (p.length === 1 && p[0] === c.spec_id) { ok++; pts.add(p[0]); } else bad.push([c.front, p]); }
console.log({ mapped: ok, examSkills: skills, pointsCovered: pts.size, leaves: index.subjectLeaves(SUBJECT).length, bad: bad.length });
if (bad.length) { console.log(bad.slice(0, 20)); process.exit(1); }
