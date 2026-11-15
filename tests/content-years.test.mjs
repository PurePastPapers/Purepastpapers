import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {filterQuestions} from '../js/engine/filter-engine.js';
const specIndex=createSpecIndex();specIndex.add({subject_id:'S',sections:[{id:'s',title:'Skills',topics:[{id:'t',title:'Differentiation',points:[{id:'diff',code:'7.2',title:'A broad skill spanning AS and additional A-level'}]}]}]});
const bank=[{question_id:'as',is_as:true,qualification_code:'8MA0',introduced_year:12},{question_id:'al-as-skill',qualification_code:'9MA0',introduced_year:12},{question_id:'additional',introduced_year:13},{question_id:'unreviewed-year'}].map(q=>({...q,primary_spec_points:['diff'],crossover_spec_points:[],include_in_custom_pool:true}));
const match=criteria=>filterQuestions(bank,{learnedOnly:false,...criteria},{specIndex}).matches.map(q=>q.question_id);
test('AS and A-level questions assessing AS skills both appear in Year12',()=>assert.deepEqual(match({contentYear:12}),['as','al-as-skill']));
test('Year13 cumulative default retains AS and additional content',()=>assert.deepEqual(match({}),bank.map(q=>q.question_id)));
test('additional Year13 only uses reviewed unit scope, not shared broad spec-point tags',()=>assert.deepEqual(match({contentYear:13,curriculumPoints:['diff']}),['additional']));
test('year filtering never marks earlier skills learned and respects other selections',()=>{const learned=new Set();assert.deepEqual(filterQuestions(bank,{contentYear:12,focus:[],selectionMode:'strict',learnedOnly:false},{specIndex,learned}).matches,[]);assert.equal(learned.size,0)});

test('qualification selection intersects year scope and keeps AS distinct',()=>assert.deepEqual(match({contentYear:12,qualificationCodes:['9MA0']}),['al-as-skill']));
