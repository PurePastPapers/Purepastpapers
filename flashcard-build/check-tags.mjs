import { readFileSync } from 'node:fs';
import { createSpecIndex } from '../js/engine/spec-index.js';
import { createTagMapper, cardPoints } from '../js/flashcards/spec-map.js';
const [subject, file] = process.argv.slice(2);
if (!subject || !file) throw new Error('Usage: node flashcard-build/check-tags.mjs SUBJECT JSON');
const index=createSpecIndex();
index.add(JSON.parse(readFileSync(`data/specs/${subject}.json`,'utf8')));
const mapper=createTagMapper(subject,index);
const cards=JSON.parse(readFileSync(file,'utf8'));
const bad=[];const leaves=new Set();let skills=0;
for(const c of cards){
 const points=cardPoints(c.tags,mapper);
 const specTags = c.tags.filter(t => t.startsWith('PPP::Spec::'));
 if(c.deck==='mark_scheme'){if(specTags.length || points.length || c.spec_id != null) bad.push(c.front);else skills++;}
 else if(c.deck==='atomic' && specTags.length===1 && points.length===1 && points[0]===c.spec_id) leaves.add(c.spec_id);
 else bad.push({front:c.front,points,expected:c.spec_id});
}
console.log(JSON.stringify({cards:cards.length,examSkills:skills,pointsCovered:leaves.size,leaves:index.subjectLeaves(subject).length,bad},null,2));
if(bad.length)process.exit(1);
