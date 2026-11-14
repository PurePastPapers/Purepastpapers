// Synthetic browser fixtures only;
// Never changes shipped content or real student accounts.
const {
  chromium
} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? {
        executablePath: process.env.CHROME_PATH
      } :
      {}
    )
  });
  const p = await b.newPage();
  await p.goto((process.env.AUDIT_URL || 'http://localhost:5173'));
  const result = await p.evaluate(async () => {
    const {
      createSpecIndex
    } = await import('/js/engine/spec-index.js');
    const {
      filterQuestions
    } = await import('/js/engine/filter-engine.js');
    const {
      questionBody,
      questionRef
    } = await import('/js/ui/question-view.js');
    const api = await import('/js/data/api.js');
    const index = createSpecIndex();
    index.add({
      subject_id: 'SYNTH_BIO',
      sections: [{
        id: 's',
        title: 'Synthetic Biology',
        topics: [{
          id: 't',
          title: 'Topic 2',
          points: [{
            id: 'p2',
            code: '2.1',
            title: 'Enzymes'
          }]
        }, {
          id: 't7',
          title: 'Topic 7',
          points: [{
            id: 'p7',
            code: '7.1',
            title: 'Other topic'
          }]
        }]
      }]
    });
    const q = (id, point, extra = {}) => ({
      question_id: id,
      subject_id: 'SYNTH_BIO',
      question_number: '5',
      parent_question_id: 'q5',
      part_label: id,
      marks: 3,
      primary_spec_points: [point],
      crossover_spec_points: [],
      source_type: 'real_past_paper',
      content: {
        question_html: '<p>Using the result from part (a), calculate the rate.</p>',
        mark_scheme_html: '<p>Rate = 2.</p>'
      },
      ...extra
    });
    const bank = [q('a', 'p7'), q('b(ii)', 'p2', {
      depends_on_question_ids: ['a'],
      context: {
        shared_stem_html: '<p>Synthetic reviewed supplied result: product formed = 6 units in 3 seconds.</p>',
        full_question_html: '<p>Part (a): find product formed. Part (c): discuss another topic.</p>'
      }
    }), q('c', 'p7')];
    const before = JSON.stringify(api.getProgress().question_attempts);
    const found = filterQuestions(bank, {
      focus: ['p2'],
      learnedOnly: false,
      selectionMode: 'strict'
    }, {
      specIndex: index
    }).matches;
    const host = document.createElement('div');
    host.innerHTML = String(questionBody(found[0]));
    document.body.append(host);
    const details = host.querySelector('details');
    details.open = true;
    const output = {
      count: found.length,
      id: found[0].question_id,
      marks: found[0].marks,
      shared: host.querySelector('.question-stem').textContent,
      context: details.open,
      unchanged: before === JSON.stringify(api.getProgress().question_attempts),
      ref: questionRef(found[0])
    };
    host.remove();
    return output
  });
  assert.equal(result.count, 1);
  assert.equal(result.id, 'b(ii)');
  assert.equal(result.marks, 3);
  assert(result.shared.includes('6 units in 3 seconds') && result.context && result.unchanged);
  console.log('Synthetic Biology dependency/context:', result);
  await b.close()
})()
