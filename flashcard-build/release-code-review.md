# Release code review

Reviewed `prepare-release.py` against the catalogue migration and tested generated files with isolated synthetic fixtures. No database was accessed or changed. The generated SQL uses ordinary statements; it does not add `DO`, temporary tables, or DDL.

The publish file locks the catalogue row in a transaction before a separate conditional `SELECT` reads `current_version`. At PostgreSQL's default READ COMMITTED isolation, that second statement gets a fresh snapshot after any lock wait. The lock is retained while the publish function runs, preventing another publisher that follows the same catalogue-row locking protocol from changing the pointer between the baseline comparison and the call. A missing catalogue or changed baseline produces **zero result rows**, not a SQL exception. The existing database function can still raise its own metadata or count validation errors.

The stage file returns the matching version row. A `(catalogue_id, version)` conflict does **not** enforce the manifest UUID: the operator must compare the returned ID before loading any batches. Similarly, neither the check nor publish SQL asserts its result for the operator.

The prior check compared only the material count and stable-key checksum, so a rerun could silently retain different front, back, tags or other material under the same version because loading uses `ON CONFLICT DO NOTHING`. The check file now also emits one mismatch count per batch, comparing the expected front, back, tags, path, note type, variant and suspended status with staged material. This detects missing or conflicting expected material; the total count and checksum detect extra or unexpected keys. These checks return results for inspection and do not raise exceptions.

## Operator checklist

1. Use a newly approved version and recorded baseline. Run the stage file and stop unless it returns exactly one row whose catalogue ID, version and UUID equal the manifest. Treat every SQL error as a stop.
2. Run each batch; compare the staged cumulative count with the expected progression. If present, run the media copy and compare every manifest media ID, MIME type, byte count and checksum with the verified source. A list of IDs alone is not proof of byte identity.
3. Run the check file immediately before publishing. Require the exact manifest count and stable-key checksum, every expected batch row, each batch's expected count and zero mismatched rows. Compare all media results as above. Do not allow another process to modify staged material between these checks and the pointer switch: the catalogue row lock does not lock arbitrary material or media writes, and the function checks count and basic validity rather than full content.
4. Execute each entire publish file on one connection with normal transaction handling. Require exactly one returned `published` JSON result with status `published` and the manifest card count; zero rows means the pointer was not switched. Stop and investigate any other result or error. Do not continue dependent catalogues on an unexamined result.

## Fixture checks

`python /tmp/test_release_current.py` passed isolated fixtures covering source/review gates, retained MARK identity, 201 cards split 100/100/1, expected key checksum, stable UUID on rerun, changed-source rejection, apostrophe escaping, reserved JSON delimiter rejection, excluded History content, media SQL generation, stage UUID result, all material comparison fields, and the order of lock, conditional function call and commit. `python -m py_compile flashcard-build/prepare-release.py` passed. These inspect generated SQL; they are not a PostgreSQL concurrency or integration test.
