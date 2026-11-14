# 9MA0 tagging instructions (shared by every tagging worker)

You tag assessable parts of Edexcel A-Level Mathematics (9MA0) questions against the official
specification. You do not rewrite questions. Work only on the papers assigned to you and write
only your own output files.

## Inputs

- `data/import/9MA0/specification.json`: the 89 canonical points. Use the `id` values exactly.
  Pure points (`papers: ["P1","P2"]`) and applied points (`papers: ["P3"]`) reuse printed codes
  such as 2.1, so always use ids, never bare codes.
- `.import-cache/9MA0/work/tagging/<paper_id>.in.json`: for each question, its extracted text
  (maths is linearised badly by PDF extraction: superscripts and fractions are scrambled), the
  list of assessable units (`label`, `marks`) and the start of the mark scheme text.
- If the text is too scrambled to be sure what is asked, look at the question image
  `assets/questions/9MA0/<paper_id>/<image>` (convert a copy to PNG in your scratch directory with
  Python PIL if your reader needs it). Do not guess.

## Output: `data/import/9MA0/tags/<paper_id>.json`

```json
{"paper_id": "...", "tagger": "model", "questions": [
  {"number": 7, "key": "q07", "units": [
    {"label": "(b)", "primary": ["EDX_MATH_PURE_INT_8.5"], "prerequisites": ["EDX_MATH_PURE_TRIG_5.6"],
     "difficulty": "medium", "difficulty_basis": "two-step substitution, method not signposted",
     "depends_on": ["(a)"], "standalone": false,
     "preview": "Use the substitution u = 1 + sin x to find the exact value of a definite integral.",
     "confidence": "high", "note": ""}
  ]}
]}
```

Keep `number`, `key` and unit `label` values exactly as in the input, in the same order, one
output unit per input unit.

### primary (1 to 3 ids)
The specification points this unit actually assesses: what the marks are awarded for. Use the
smallest set. Do not copy tags from sibling parts. A "show that" using the factor theorem is 2.6,
not everything else in the question.

### prerequisites (0 to 4 ids)
Other specification points a student must already know to do this unit, where that knowledge is
a real step in the working (for example solving a quadratic inside a calculus question, or logs
inside a geometric series question). Leave out universal basics such as arithmetic or expanding a
single bracket. Never repeat an id that is already in `primary`. Earlier parts being printed
nearby is not a prerequisite.

### difficulty and difficulty_basis
Judge the unit on its own, for an A-Level candidate. Marks are not difficulty.
- `easy`: standard one-idea routine, fully signposted.
- `medium`: several steps or a choice of method, familiar setting.
- `hard`: unfamiliar setting, unstructured multi-step reasoning, proof or modelling judgement,
  or combining topics without guidance.
- `extra_hard`: the most demanding items only (roughly the hardest one or two units of a paper,
  typically long unstructured problems near the end).
`difficulty_basis` is one short phrase giving the reason.

### depends_on and standalone
`depends_on`: labels of earlier units in the SAME question whose answer or working this unit
needs ("hence", "using your answer to (a)", a value found earlier). If the earlier part is a
"show that" whose result is printed, the unit still depends on it for display, so list it.
`standalone`: true only if the unit can be answered from the question stem alone.

### preview (max 160 characters)
A plain-text description of the task for a results list, e.g. "Find dy/dx for a parametric
curve and the equation of the tangent at a given point." Describe; do not give answers. Plain
characters only (x^2, sqrt, pi are fine).

### confidence and note
`confidence`: `high`, `medium` or `low`. Use `low` and explain in `note` whenever you are unsure
of the tag, the dependency or what the question asks. Low-confidence units go to a review queue,
which is better than a wrong tag.

## Rules of thumb for 9MA0

- Paper 3 Statistics uses applied topics 1 to 5; Mechanics uses applied topics 6 to 9
  (ids contain `STATS` or `MECH`). Mechanics questions often need pure prerequisites
  (vectors 10.x, differentiation 7.x, integration 8.x, trigonometry 5.x).
- Large data set knowledge questions: Statistics 2.x (and 1.1 for sampling).
- Normal approximation to binomial: Statistics 4.2 or 4.3 as the specification places it; read
  the point text rather than guessing.
- Proof questions: Pure 1.1 plus the content area being proved.
- Modelling comments ("suggest a limitation of the model"): the relevant modelling point in that
  topic (for example Pure 2.11 or 6.7, Mechanics 6.1/7.x/8.x as written in the specification).

## Validate before finishing

Run `node tools/import/validate-tags.mjs <paper_id>` for each paper and fix every error. Then
reply with: papers done, number of units tagged, and the list of low-confidence units.
