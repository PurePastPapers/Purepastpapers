# 9MA0 import: status and how to resume

Entry point for the Edexcel A-Level Mathematics (9MA0) question-bank import. Read this first,
then [curriculum and tagging](curriculum-and-question-tagging.md) and the
[import contract](question-import-and-filtering-plan.md).

## Status on 14 November 2026: blocked on network access

No real 9MA0 question has been imported. The 49 Maths questions on the site are still demo content.

The cloud session's network policy refused every source host (proxy `403` on CONNECT):
`qualifications.pearson.com`, `www.physicsandmathstutor.com`, `pmt.physicsandmathstutor.com`,
`www.mathsgenie.co.uk`, `tryplumi.app`, `mega.nz`, `g.api.mega.co.nz`. Three requests to allow
them (new environment twice, edit of the Default environment once) were rejected by the
environments service. Only GitHub and package registries were reachable.

Consequences, all unresolved:

| Item | State |
| --- | --- |
| Papers, mark schemes, examiner reports | 0 of 99 expected documents fetched |
| Official specification verification | Not done; `data/specs/EDX_ALEVEL_MATH_9MA0.json` remains unverified working data |
| Textbook and Year 12/13 mappings | Not done; `data/curriculum/index.json` is still empty |
| Plumi | Site unreachable. A public GitHub repository search for "plumi" and "tryplumi" found no repository belonging to the product, so no open dataset or licence was identified |

Unlicensed third-party GitHub mirrors of Edexcel papers exist but were deliberately not used:
no licence, no verifiable provenance.

## What exists

- `data/import/9MA0/inventory.json`: 33 expected paper records (9 exam series 2018 to 2026, the
  2017 sample assessment materials and a specimen placeholder, each with Papers 1 to 3) and 99
  expected documents. Built by `node tools/import/build-inventory.mjs`. Every series has
  `series_verified: false`: the list comes from the existing catalogue plus general knowledge
  and has not been checked against Pearson. June 2026 may be teacher-restricted.
- `tools/import/fetch-sources.mjs`: `discover <index-url>...` collects candidate PDF links from
  listing pages and files them against inventory records; `fetch` downloads to the gitignored
  `.import-cache/`, checks the PDF header, and records sha256, size and status. Reruns skip
  fetched documents. The filename classifier is tested on sample names only, never on live pages.

## To resume

1. Allow the hosts above in the cloud environment's network settings (Allowed domains), or run
   from a machine with normal internet access. MEGA file downloads also need its storage hosts
   (`*.userstorage.mega.co.nz`), which an exact-host allowlist cannot express.
2. `node tools/import/fetch-sources.mjs discover <Pearson/PMT listing URLs>` then `fetch`.
3. Verify the series list and set `series_verified`. Verify the specification tree against
   Specification Issue 4.
4. Build extraction, part segmentation, scheme alignment, tagging and the content pack on the
   fetched PDFs. None of this is written yet: it was not worth writing blind against documents
   that could not be opened.

## Rights

Pearson owns the papers. Public download access is not a redistribution licence. Hosting
extracts on purepastpapers.com is the site owner's decision and risk; the contract in the
import plan still requires rights status to be recorded per source.
