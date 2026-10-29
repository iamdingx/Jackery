# Huabao V1 development ledger

Plan: docs/superpowers/plans/2026-10-29-huabao-v1.md

- 2026-10-29: User approved EN2 with grouped outcomes and explicitly authorized unattended development/testing/default decisions. GrillMe interviewing phase ended.
- Baseline: D:/Codex/JGPD is not a Git repository. Product is isolated in new huabao-service-v1 directory; archive/materials remain untouched. EXPECTED_CHANGESET: this product directory plus final delivery ZIPs under workspace outputs.
- Runtime verified: Node 24.22.1 with native DatabaseSync. No Express/SQLite npm module installed; choose zero-runtime-dependency backend. Playwright 1.62.1 installed; Edge executable exists for isolated headless E2E.
- Governance tooling check: global workstation CLI absent and project bootstrap imports Unix-only fcntl on Windows; non-blocking tooling is unavailable. Do not fabricate a registry. Functional plan/contract/API/tests and this ledger preserve progress locally.
- Defaults and API compatibility are documented in PRODUCT_CONTRACT.md and docs/API_CONTRACT.md. No existing external API consumers.
- Preflight: helper exports consumed by backend; backend DTOs consumed by UI; E2E consumes startServer and UI labels. Shared signatures are fixed in API_CONTRACT.md. Each parallel lane has disjoint write ownership.
- Complete: T1 helpers, T2 backend, T3 UI, T4 independent acceptance, final review fixes and clean-package verification.

## Failure loop ledger

Track root cause, reproduction, fix round 1..5, focused check, previous green-suite regression. Planned RED tests are not failed repair attempts. At five consecutive failed repair attempts for the same cause, stop and produce an alert.

- Task 1 helpers: 15/15 pass; independent openpyxl four-sheet checks and 13 Pillow image variants green. Report docs/HELPERS_REPORT.md.
- Task 2 backend: latest stable full core 65/65 pass before operations additions. Report docs/BACKEND_REPORT.md. Fixed audit FK, oversized base64 regex, explicit export bounds, login Origin/content-type validation and decimal precision with RED→GREEN.
- Task 3 frontend: real Edge scenario green including original requirements plus CSV/language/dirty form flows; final report pending final targeted checks. Invalid screenshot-fixture PNG checksum was corrected; production validation retained.
- Operations backup: RED for missing module, then valid backup test exposed missing destination parent (ENOENT). Root cause: exported backupData assumed CLI had made parent. Repair round 1 creates destination parent inside helper before exclusive new folder; focused and whole regression scheduled. No failed repair cap reached.

## Final integration and review closure

- Independent review found no Critical defects and three Important defects. Root reproduced each before fixing: duplicate history image query, private custom data packaging, password/session/dirty-work flow. All resolved with focused RED→GREEN and full regressions.
- Other review findings were promoted to functional fixes where user-visible: logout filters/cache reset, snapshot display names, pending-photo reload guard, operational files included in verification fingerprint. No known review finding remains deferred.
- Packaging allowlist repair round 1 accidentally omitted server.js; existing positive inclusion test caught it. Round 2 added server.js and required-source validation; whole regression green. This required two repair rounds: the first failed and the second passed. No root cause reached five consecutive failed repairs.
- One full run encountered Node Fetch bad-port allocation on an OS-selected ephemeral port. Owning Node runtime badPorts and WHATWG Fetch Standard checked; added deterministic blocked-port/retry tests and bounded browser-safe auto-allocation. No blind retries or weakened tests.
- Final current candidate: 74/74 core tests and 7/7 real-browser scenarios pass, 0 skipped/cancelled; openpyxl actual app export and helper reader checks pass.
- Online SQLite backup and preserved-photo copy verified. Windows launcher succeeds. Clean extracted package startup/login/frontend/create/restart-persistence succeeds without runtime npm installation.
- Evidence: docs/TEST_REPORT.md, docs/VERIFICATION_SUMMARY.json, docs/PACKAGE_VERIFICATION.md, artifacts/verification/*.log and clean extraction artifacts. Final ZIP excludes all business databases and bootstrap passwords.
- Remaining operational data preparation is explicit V1 administration: import real bilingual BOM/models/checklists and create users. No inventory/integration/translation/migration scope added.

## Single-inspection revision — 2026-10-30

- User removed post-work testing and requested one inspection with radios. Reproduced RED: six failures across domain/client/payload/browser, including six dropdowns and final-test completion dependency.
- Canonical initial map now records the only inspection; new records have no final map. Existing final evidence is immutable and exported separately. ROK keeps observed failures, requiring all items assessed; refurbishment all-pass, SCRAP and WFR unchanged.
- Targeted domain/client/browser tests passed after implementation. Full regression before export-specific addition: 80 core + 8 browser passed. Added explicit export row-count and legacy-evidence coverage; final counts and fingerprint in TEST_REPORT.md and VERIFICATION_SUMMARY.json.
- Independent read-only review found no critical or important functional issues. No root cause reached five failed repairs.
- Existing demo backed up online before restart; no record migration or deletion.
