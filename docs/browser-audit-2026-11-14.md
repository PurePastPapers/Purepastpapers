# Question browser and control audit — 14 November 2026

This follow-up starts at `59daa1e`. That commit already supplied the solid reset
button, selected-point review and question previews. This pass verifies those
features and repairs remaining state and layout problems without replacing the
approved notebook design. No content IDs, learner storage keys or progress schemas
were migrated.

## Repairs

- Preserve topic disclosures, topic-search text and the tree's scroll offset when
  another filter redraws controls. Keep the selected-point review open during edits.
  Restore keyboard focus to the specific difficulty/mark chip, not its first sibling.
- Keep multiple open questions, schemes, typed answers and draft scores. Capture
  numeric scores on input, including before blur. Reset restores newest-first search
  defaults while retaining sets, drafts and expanded questions; learner records live
  separately and are not reset.
- Disable duplicate saves while an inline mark is pending. Show the saved score for
  1.2 seconds before recomputing an Unmarked/Lost marks result list. A delayed callback
  cannot redraw a page after the user navigates away. This is deliberate self-marking;
  opening content does not record an attempt.
- Add an exact custom mark range (for example 2–5), separate from preset bands. Selecting a band clears the custom range; invalid/reversed ranges match nothing.
- Label Sort by visibly. Show the complete short preview rather than clipping it
  after two lines. Preserve grouped fractions, superscripts and subscripts in text
  previews (for example `(1)/(2 + cos x)`). Image-only questions still need reviewed
  preview text in future imports; the UI does not invent that text.
- Increase question-browser and test-builder touch controls to 44px on small/coarse
  screens. Stop the selected-set bar sticking over questions on single-column layouts.
- Fix overflowing test-start buttons and account appearance controls at 320px. Use
  compact navigation through tablet landscape widths and retain decorative tape
  inside the viewport. No global overflow clipping was introduced.

## Checks actually run

Chromium, isolated temporary profiles, against the local static server:

- 77 route/state/viewport measurements at widths 320, 390, 768, 1024 and 1440,
  plus 844×390 landscape and a 720px effective reflow viewport. Final run: no
  page-wide horizontal overflow, no off-screen visible measured controls, no page errors.
- Guest home, signup, login and subjects; populated dashboard, My Subjects,
  Maths subject, question browser, expanded trees, open question/scheme/set,
  test builder, paper catalogue, Data Hub, account and subject-settings dialog.
- Timed answer → finish dialog → enter marks → saved results at all five widths.
- Easy + Medium: 13 actual shipped Maths demo results; each ID checked against the
  bank to exclude Hard/Extra hard. Reset returns the default result set.
- A separate intercepted **synthetic dated-paper fixture** retains real demo IDs
  but supplies 2023/2024 metadata. Spec selection AND Easy/Medium AND 4–6 marks AND
  2024 AND Unmarked returns four expected demo IDs. The exact 2–5 range returns two expected records while retaining other selections. Sorting preserves selections;
  an individual selected point can be removed. These dates were never published.
- Reset preserves the exact learner progress document, selected set item, open
  question/scheme and unsaved answer/zero-score draft, including reload.
- Save explicit zero → inline confirmation remains visible → disappearance from
  Unmarked → inclusion in Lost marks; edit, reload and undo checked.
- Synthetic Biology part Q5(b)(ii): only its three marks and its own tags match;
  reviewed dependency information stays visible, full context expands without
  creating attempts or adding siblings to results. This is not imported exam content.
- Reset text contrast after transitions: minimum 7.68:1 across all 11 available
  subject swatches in light and dark themes; opaque surface and minimum 44px height. Keyboard focus has a 3px visible outline; hover changes the solid surface in both themes.
- `npm test`: 50 passing tests. `npm run validate`: 38 subjects, 926 paper records,
  249 demo questions, zero errors/warnings. `git diff --check` passes.

Browser regressions are in `tools/browser-regression.cjs`,
`tools/browser-fixtures.cjs` and `tools/browser-parts.cjs`. Run a local server first.
They require an optional development Playwright installation; the published site
still has no runtime dependencies. Set `PLAYWRIGHT_MODULE` to an installed module
path and optionally `CHROME_PATH` to a Chrome executable, then run each with Node.
`AUDIT_URL` defaults to `http://localhost:5173`. Each creates an isolated profile.

## Reference evidence

The supplied PPP screenshots show the former transparent, isolated Reset filters
button, clipped previews and topic/count collisions. Supplied Plumi screenshots
show multi-topic selection, removable chips, distinct filters and sorting, inline
schemes, explicit saved marks/undo and expandable preceding Biology context. These
are functional references; they do not verify Plumi's backend, question rights or
curriculum mapping. Flashcards, subscriptions, AI marking and gamification are not
part of this repair pass. PPP retains its typography, paper surfaces and colour system.

The public Plumi landing/question-bank information was accessible. Its study app
returned a sign-in screen, so signed-in interactions were not directly inspected.
See the central [curriculum contract](curriculum-and-question-tagging.md) for source
verification and textbook inventory status.

## Remaining issues and limits

- No verified textbook chapter/year mappings or real question extracts were added.
  The accessible textbook listing is not contents-page evidence. Official spec IDs
  and complete authored ordering still need source-by-source reconciliation.
- Existing parent suppression treats a parent with available assessable descendants
  as an aggregate. Import review must reject incomplete decompositions or explicitly
  retain an answerable grouped unit; don't assume one child covers every parent mark.
- Not an exhaustive site-wide accessibility certification: physical Safari/iPad,
  Firefox, actual browser-chrome zoom to 200%, every subject's long tree and every
  Data Hub tab/error/menu permutation still need manual inspection. The 720px check
  is a reflow proxy, not a claim that native browser zoom was exercised.
- Full external paper PDFs, examiner-report availability and image-only question
  previews were not verified by this audit. Missing reports remain clearly labelled.
- Screenshots delivered with this task are **local Chromium** captures, not evidence
  of deployment. Verify GitHub Pages and the public assets separately after pushing.
