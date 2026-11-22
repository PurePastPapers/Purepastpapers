// One demo per page load. Internal navigation back to the landing page keeps the same choice.
export const DEMO_SUBJECTS = [
  { id: 'EDX_GCSE_MATH_1MA1', name: 'Maths', swatch: 'blue', tier: 'Foundation', questions: ['EDX_1MA1_2025_JUNE_1F_Q02_U01', 'EDX_1MA1_2025_JUNE_1F_Q03_U01'] },
  { id: 'EDX_GCSE_BIOL_1BI0', name: 'Biology', swatch: 'green', tier: 'Higher', questions: ['EDX_1BI0_2025_JUNE_1H_Q02_U01'] },
  { id: 'EDX_GCSE_PHYS_1PH0', name: 'Physics', swatch: 'lilac', tier: 'Foundation', questions: ['EDX_1PH0_2025_JUNE_2F_Q02_U01'] },
  { id: 'EDX_GCSE_CHEM_1CH0', name: 'Chemistry', swatch: 'peach', tier: 'Foundation', questions: ['EDX_1CH0_2025_JUNE_2F_Q05_U06'] },
  { id: 'OCR_GCSE_CS_J277', name: 'Computer Science', swatch: 'teal', tier: null, questions: ['OCR_J277_2024_JUNE_01_Q01_c'] },
];

let visitorDemo;

export function demoForVisit() {
  if (visitorDemo) return visitorDemo;
  const key = 'ppp:guest-demo-subject';
  let index = Math.floor(Math.random() * DEMO_SUBJECTS.length);
  try {
    const previous = localStorage.getItem(key);
    const previousIndex = DEMO_SUBJECTS.findIndex(({ id }) => id === previous);
    if (previousIndex >= 0) index = (previousIndex + 1) % DEMO_SUBJECTS.length;
    localStorage.setItem(key, DEMO_SUBJECTS[index].id);
  } catch {
    // Private browsers can disable storage. The random choice still works for this load.
  }
  visitorDemo = DEMO_SUBJECTS[index];
  return visitorDemo;
}
