# Frontend implementation and evidence

Historical implementation report. Current v0.3 deep-QA restoration supersedes prior single-inspection behavior. See PRODUCT_CONTRACT.md, API_CONTRACT.md and qa-v03/FINAL_REPORT.md for current acceptance and verification.

2026-10-29. Scope: `public/`, `tests/frontend.test.js`, `tests/e2e.test.mjs`. Native HTML/CSS/ES-module application; no bundler, CDN, framework, or production npm dependency. UI follows the approved EN2 same-page editor, two-column checks/material layout, three grouped outcome columns with seven globally exclusive radios, and wide BOM drawer.

## Delivered behavior

- English and Chinese navigation/forms/catalog labels. Free-text notes stay unchanged when switching language. Unsaved editor, administrator form, and CSV changes are protected; a selected photo remains available across language switches. Explicit save/completion, busy buttons, validation and optimistic-conflict error feedback preserve user entries.
- Owner/admin record lists with SN/order, status, model, owner (admin), and date filters; pagination and authenticated Excel download.
- Same-page record creation/editing: model snapshot checks, initial/final phases, mutually exclusive no-defect appearance presets, separate appearance/issue notes, optional reference fields, quantities and optional protected photos. Refurbishment shows one functional test; ROK requires final passes; SCRAP requires a reason; waiting outcomes only offer Save WFR. Completed records are read only; administrator corrections require a reason.
- Exact full-SN history, history details/photos read only, audit timeline with before/after values. Ordinary record listing stays owner-scoped through the server API.
- Searchable paginated model-BOM drawer with pending multi-selection, editable quantity, cross-search/page retention, cancellation, existing-item detection and no duplicate record rows. Packaging follows ordinary BOM handling.
- Administrator user creation/editing/deactivation/password reset; model/checklist maintenance; appearance maintenance; BOM maintenance, template download, file/text CSV import and atomic row-error feedback. Account password dialog is available to signed-in users.
- Escaped dynamic HTML/attribute values, external ES modules only, visible focus, native labels/radios/checkboxes/dialog focus trapping, Escape-to-close, skip link, responsive grids and reduced-motion rule. No inline script/event handlers or external assets.

## Test-first evidence

`tests/frontend.test.js` was written before `public/state.js`; first run failed because the module did not exist. The implemented behavior then passed all five tests: BOM deduplication/quantity retention, appearance exclusivity, completion checks, server-field stripping and text escaping.

The browser scenario was written and attempted before `public/app.js`. Subsequent integration used the real `startServer` backend with fresh `tests/.tmp/frontend-*` demo databases and installed headless Microsoft Edge. No API mocking. Sandbox Edge/localhost restrictions required an authorized elevated test process; ordinary runtime deployment does not require that test harness privilege.

Additional regressions were reproduced before fixes: unsaved CSV lost during language switching, CSV navigation not warning, and selected photo lost during language switching. Each now passes the browser regression. An invalid internet PNG fixture was rejected for checksum mismatch; the fixture was corrected to the validated PNG used by the image helper tests without weakening production validation. Distinct-BOM and duplicate-status selector fixture mistakes were corrected in the test.

Latest frontend command (Node 24.22.1):

```powershell
& 'C:\Users\ilove\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/frontend.test.js tests/e2e.test.mjs
```

Actual final result: **6 passed, 0 failed** (9.83 seconds): five pure UI tests and one comprehensive real-browser scenario. The scenario checks login/ordinary-list isolation, new WFR save, pending BOM selection/quantity/pagination/search retention, duplicate prevention, ROK/final pass, language retention, selected-photo language retention and upload, completed locking, dirty-navigation dismissal, SCRAP/refurbishment validation, appearance exclusivity, exact-SN history/audit, administrator model/checklist/CSV/users/appearance maintenance, reasoned correction and XLSX download. Page errors and console errors fail the scenario; the final run had zero. See root final verification for the full-project test count; unrelated CSV/operations work was still landing during an earlier whole-suite run.

## Visual evidence

Captured at 1680 × 1100 viewport, full-page where useful, and visually inspected:

- `artifacts/e2e/editor-en.png`
- `artifacts/e2e/bom-drawer-en.png`
- `artifacts/e2e/operator-completed.png`
- `artifacts/e2e/admin-records.png`

The form scrolls vertically at this viewport; navigation, checks, material usage and outcomes remain on one page. Native date/file chooser chrome follows the operating-system locale even when the application uses English. Supported target is desktop Edge/Chromium; no assertion of Firefox, Safari, assistive-technology certification or live production data verification is made.
