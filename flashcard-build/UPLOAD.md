# Upload remains blocked

Do not upload this checkpoint. No subject is complete or approved.

The `draft/` JSON files intentionally include unchecked material. They are review outputs, not upload inputs. `checkpoint-sources.tsv` distinguishes independent support from source leads. A leaf represented by a card is not proof of thorough coverage.

Before requesting approval:

1. Finish substantive content coverage and independent checks; remove unsupported cards from upload sources and record every cut.
2. Run each subject's `build.py` without `--draft`. Supply its independent `sources.tsv` and a substantive `review-complete.json` with `content_complete: true`, reviewer identity and the exact current source digest. Do not create this record until the content review actually passes.
3. Run the site's tag checker on the resulting build and complete the lead's random 10% source audit. Recheck a subject if the error rate exceeds 2%.
4. Redraw stratified samples and obtain explicit subject approval. Nothing about approval to push a Git branch authorises a database publish.

After approval, prepare small batches of plain SQL following section 8 of BRIEF.md and the current repository migration. Do not use DDL, DO blocks or temporary tables. Insert a new immutable version; do not edit a published version. Count rows and compare sorted stable-key checksums before publishing.

For existing Psychology/Sociology MARK, retain the existing catalogue IDs and each original `anki-card:` stable key and catalogue card ID. Do not regenerate their identities with the new-content SHA scheme. The 16-card checked working subset is NOT a replacement for the existing 92 cards. Finish review and resolve all quarantined originals first.

No production credentials, SQL mutations, catalogue retirement or deployment are included in this checkpoint.
