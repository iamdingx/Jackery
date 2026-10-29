# Single Functional Inspection Revision

Latest user correction overrides the original two-stage inspection design: remove post-work testing, record one inspection per function, use visible radio choices rather than dropdowns.

## Implementation decisions

- One canonical inspection remains in `checks.initial` for compatibility with saved records and the private V1 API; the UI uses the neutral label Inspection Result, with Not tested / Pass / Fail radio options per item.
- New UI and records never record a post-work/final test. Legacy `checks.final` stays archival and unchanged; it cannot be overwritten through the new editor. No destructive data migration.
- ROK requires the single checklist to be filled (Pass or Fail), not a second all-pass test. Failed inspection items remain factual. Refurbishment still requires all Pass. SCRAP needs a reason; WFR remains incomplete.
- Notes-only corrections of previously completed ROK records do not invent missing historical inspection values or invalidate their previously accepted completion.
- Functional Checks export has exactly one Inspection row per function. Historical post-work data, when present, remains in a clearly labelled legacy JSON column in Work Summary, not a second editable inspection.

## Steps

- [x] Reproduce single-inspection backend/client/payload and radio UI requirements with failing tests.
- [x] Update domain/client validation, new demo seed, radio rendering, event binding, export and compatibility documentation.
- [x] Adapt old two-stage test expectations to the explicitly revised rule; preserve unrelated permission/import/photo/lock tests.
- [x] Run focused tests, all core tests and all real-browser scenarios. Inspect actual radio layout and persisted values.
- [x] Back up live demo, restart the updated local app without dropping its records, update documentation/screenshots and a versioned delivery ZIP, verify source fingerprint and archive integrity.

API review: potentially breaking behavior for old private UI clients relying on final-test writes; bundled UI is updated together. Record DTO keeps initial and any pre-existing final archive. No external consumers found. No new database schema migration or dependency required.
