// Verified excerpts and physical PDF pages for the guest demos only.
const snippets = {
  EDX_1MA1_2025_JUNE_1F_Q02_U01: {
    paper: 'EDX_1MA1_2025_JUNE_1F', q: '2', part: '', page: 3, file: '1ma1-1f-pef-20250821.pdf',
    text: 'Where incorrect answers were seen these included 0.25, 0.3, 0.34, 3.4, 34, 7.5 and 75.',
  },
  EDX_1MA1_2025_JUNE_1F_Q03_U01: {
    paper: 'EDX_1MA1_2025_JUNE_1F', q: '3', part: '', page: 3, file: '1ma1-1f-pef-20250821.pdf',
    text: 'Common incorrect answers generally involved applying an incorrect conversion factor…',
  },
  EDX_1BI0_2025_JUNE_1H_Q02_U01: {
    paper: 'EDX_1BI0_2025_JUNE_1H', q: '2', part: '(a)', page: 11, file: '1bi0-1h-pef-20250821.pdf',
    text: 'Some candidates only gained one mark for two very similar ideas like covering the mouth and wearing a face mask which were the same marking point.',
  },
  EDX_1PH0_2025_JUNE_2F_Q05_U02: {
    paper: 'EDX_1PH0_2025_JUNE_2F', q: '5', part: '(b)', page: 39, file: '1ph0-2f-pef-20250821.pdf',
    text: 'Candidates added many arrows to diagrams, often introducing a contradiction in direction.',
  },
  EDX_1CH0_2025_JUNE_2F_Q05_U06: {
    paper: 'EDX_1CH0_2025_JUNE_2F', q: '5', part: '(d)(i)', page: 46, file: '1ch0-2f-pef-20250821.pdf',
    text: 'The majority were able to state that this is because argon has a full outer shell…',
  },
  OCR_J277_2024_JUNE_01_Q01_c: {
    paper: 'OCR_J277_2024_JUNE_01', q: '1', part: '(c)', page: 6, file: '727492-examiners-report-computer-systems.pdf',
    text: 'Some candidates did not shift the correct number of places, for example moving 3 places.',
  },
};

export function demoReportFor(question, paper) {
  const entry = snippets[question.question_id];
  const source = paper?.examiner_report_url;
  if (!entry || !source?.startsWith('https://') || entry.paper !== paper.paper_id || entry.paper !== question.paper_id ||
      entry.q !== String(question.question_number) || entry.part !== (question.part_label || '') ||
      !source.endsWith('/' + entry.file)) return null;
  return {
    paper_id: paper.paper_id,
    source_url: source,
    sections: [{
      heading: `Question ${entry.q}${entry.part}`,
      targets: [{ q: entry.q, part: entry.part }],
      pages: [entry.page],
      paras: [{ k: 'p', t: entry.text }],
    }],
  };
}
