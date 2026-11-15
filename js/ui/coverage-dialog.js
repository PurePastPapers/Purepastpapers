// Staged covered-topic selection: neither namespace changes before Save.
import {html} from '../core/dom.js';
import * as api from '../data/api.js';
import {getCurriculum, specIndex} from '../data/content-repository.js';
import {filterSpecForCurriculum, mountCurriculumSelector} from './curriculum-selector.js';
import {mountSpecTree} from './spec-tree.js';
import {topicOrganisationControl} from './topic-organisation.js';
import {openModal} from './ui.js';

export async function coverageDialog({bundle}) {
  const {subject, spec, textbooks} = bundle;
  const officialIds = specIndex.subjectLeaves(subject.subject_id);
  const textbookIds = textbooks?.ids || [];
  const learned = api.learnedSet();
  const original = {
    official: new Set(officialIds.filter(id => learned.has(id))),
    textbook: new Set(textbookIds.filter(id => learned.has(id))),
  };
  const draft = {official: new Set(original.official), textbook: new Set(original.textbook)};
  let organisation = textbooks ? api.getProgress().preferences[`coveredView:${subject.subject_id}`] || 'textbook' : 'official';
  if (!['textbook','official'].includes(organisation)) organisation = textbooks ? 'textbook' : 'official';
  const curriculum = await getCurriculum(subject.subject_id);
  let tree = null, treeOrganisation = organisation;
  let view = {visible:null, full:null, state:{year:'', year13Only:false}};
  const capture = () => { if (tree) draft[treeOrganisation] = tree.getSelected(); };
  const delta = key => ({
    added: [...draft[key]].filter(id => !original[key].has(id)),
    removed: [...original[key]].filter(id => !draft[key].has(id)),
  });

  return openModal({
    title:`Covered topics · ${subject.subject}`,
    wide:true,
    body:html`<div class="stack">
      <p class="muted">${subject.level} · ${subject.board} ${subject.spec_code}. Choose the chapters and points you have covered. Changes are applied only when you save.</p>
      ${topicOrganisationControl(organisation,{available:Boolean(textbooks),name:'coverage-organisation'})}
      ${textbooks ? html`<p class="field__hint">Textbook chapters use each book’s own numbering.${subject.textbook_example ? ` ${subject.textbook_example}` : ''} Textbook and official-spec ticks are saved separately.</p>` : ''}
      <div data-coverage-curriculum></div>
      <div data-coverage-tree></div>
    </div>`,
    actions:[
      {label:'Cancel',cancel:true},
      {label:'Save and continue adding subjects',variant:'primary',collect:()=>{
        capture();
        return {organisation,official:delta('official'),textbook:delta('textbook')};
      }},
    ],
    onOpen:dialog=>{
      dialog.classList.add('modal--coverage');
      const root=dialog.querySelector('[data-coverage-tree]');
      const drawTree=()=>{
        capture();
        const bookMode=Boolean(textbooks && organisation==='textbook');
        let visibleSpec;
        if (bookMode) {
          const year=view.state.year;
          const onlyYear=year==='12' ? 12 : year==='13' && view.state.year13Only ? 13 : null;
          visibleSpec={...textbooks.tree,sections:textbooks.tree.sections.filter(section=>
            !onlyYear || textbooks.books.get(section.id.replace('TB_BOOK_','')).year===onlyYear)};
        } else visibleSpec=filterSpecForCurriculum(spec,view.visible);
        treeOrganisation=organisation;
        const treeRoot=document.createElement('div');
        root.replaceChildren(treeRoot);
        tree=mountSpecTree(treeRoot,{
          spec:visibleSpec,
          selected:draft[organisation],
          filterLayout:true,
          enabled:!bookMode && view.visible ? new Set([...view.visible].filter(id=>view.full.has(id))) : null,
          disabledHint:'This year view covers only part of this official point. Use All content to mark the complete official point.',
          noun:'covered',
          onChange:selected=>{draft[organisation]=new Set(selected)},
        });
      };
      drawTree();
      mountCurriculumSelector(dialog.querySelector('[data-coverage-curriculum]'),{
        curriculum:textbooks ? {...curriculum,books:[]} : curriculum,
        specIndex,
        cumulativeYear13:Boolean(textbooks),
        onChange:next=>{view=next;drawTree()},
      });
      dialog.addEventListener('change',event=>{
        const input=event.target.closest('[data-topic-organisation]');
        if (!input) return;
        capture();
        organisation=input.value;
        drawTree();
      });
    },
  });
}
