# Site size and image catalogues

The site is published with GitHub Pages, which only publishes reliably up to **1 GB**.
From the GCSE science deploy on 17 November 2026 the upload was 1.33 to 1.40 GB, and every
deploy log warned "Uploaded artifact size ... exceeds the allowed size of 1 GB. Deployment
might fail." Questions then showed blank on the live site (reported for A-level and GCSE
Maths), although every pack and catalogue in the repository was intact and rendered locally.

`tools/assets/compact.py` brings the site back under the limit:

- black-and-white crops are re-encoded as lossless WebP with 8 grey levels (16 where a crop
  has shaded areas); text and diagrams look the same as the source render;
- colour crops, photographs and micrographs are left byte-for-byte;
- empty "introduction" crops (`context.stem_image_url` with no ink) are removed, with their
  catalogue entries; they showed as an empty box above 353 parts;
- each asset's `sha256` and the `image_assets` counts in `data/imports/*/coverage.json` are
  updated, so the bank tests keep checking every crop.

Result: catalogues 1.84 GB down to 1.06 GB of JSON, about 0.83 GB as uploaded to Pages.

**After any import or `tools/parts/refine.py` run that rewrites catalogues, run
`python3 tools/assets/compact.py`.** `tests/site-size.test.mjs` fails if the catalogues
grow back towards the limit, and the Pages deploy log shows the size warning. Once more
subjects are added, the image catalogues will need hosting of their own.
