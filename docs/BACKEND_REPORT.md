# Backend implementation and verification

Historical implementation report. Current v0.3 deep-QA restoration supersedes prior single-inspection behavior. See PRODUCT_CONTRACT.md, API_CONTRACT.md and qa-v03/FINAL_REPORT.md for current acceptance and verification.

2026-10-29. Owner lane: `server.js`, `src/domain.js`, `src/store.js`, `src/export.js`, `tests/api.test.js`, `tests/domain.test.js`. Helper modules and browser UI are separate integration lanes.

## Implemented behavior

- Native Node 24 HTTP and SQLite WAL, no third-party runtime packages. `startServer({dataDir,demo,port,host,publicBaseUrl})` returns `{server,baseUrl,close}`. CLI defaults to `127.0.0.1:4310` and keeps `data` and `data-demo` separate. A persisted mode marker refuses accidental reuse between demo and production.
- Scrypt password hashes with random salts, hashed random session tokens, 24-hour HttpOnly/SameSite=Strict cookies, session CSRF tokens, mutation Origin validation including login, JSON request media-type enforcement, generic login errors and per-address/username throttling. Production bootstrap creates only an administrator and a private `first-run-accounts.json` containing `{admin:{username,password}}`; no fictitious production catalogs or records.
- All contracted account, catalog, paginated BOM, record, exact-SN history, audit, protected photo, atomic CSV import and four-sheet XLSX routes. Ordinary operator queries and exports remain owner-scoped. Exact-SN history grants read permission and protected photo access only; it grants no write or bulk-export permission.
- Server-derived immutable ownership, labels and snapshots. Optimistic versions reject stale changes. Draft/WFR resume, completion gates, completed-record locks, reasoned administrator corrections, original completion time, and before/after audit records are transactional.
- Model/BOM/appearance edits retain existing record snapshots. Previously selected material snapshots can be continued after catalog disabling; newly selected materials must belong to the active model BOM. No inventory, pricing or external integration.
- PNG/JPEG validation uses the helper's content, size and dimension checks. Photo changes revise the record version; removals are soft and preserve original bytes. Physical names are random and originals are served only through authorized API routes, with private/no-store/nosniff headers.
- XLSX includes Work Summary, Functional Checks, Material Usage and Photo Index. Functional rows preserve historical bilingual check labels; refurbishment exports its single initial inspection, repair/WFR exports both stages. Work summary includes snapshot JSON and timestamps; user values remain inert strings. Photo links use the configured application origin or the actual local listener URL.

## Actual verification

Runtime: `C:\Users\ilove\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` (Node 24).

Initial RED: `node --test tests/domain.test.js tests/api.test.js` produced 9 failures because the planned production exports were absent. Domain implementation then passed 4/4. The sandbox initially denied loopback fetch with `connect EACCES`; authorized escalated local test execution resolved the environment restriction.

Latest complete core command, from the project directory:

```powershell
& 'C:\Users\ilove\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/*.test.js
```

Result: **65 tests, 65 passed, 0 failed, 0 skipped**, exit 0, approximately 8.5 seconds. This fresh process included independent root acceptance AC-01 through AC-18, security/admin/data cases, helper tests, frontend pure helper tests, and backend tests. Browser E2E and clean-package verification belong to the root integration lane and are not claimed by this report.

Backend tests directly exercise real HTTP/SQLite, not mocks: ownership and exact-SN access, CSRF and login Origin/media types, independent repeat visits, WFR/completion, stale versions, persistence after restart, old catalog snapshots, corrections and audit, last-admin protection, account/session revocation, production bootstrap, CSV atomicity and physical row diagnostics, real image upload/history/read/delete/original retention, malformed large base64, and explicit export cell caps.

## Reproduced defects and repair ledger

Each boundary fix followed a failing test before the production fix. Planned initial RED is not a failed repair attempt.

| Root cause | Observed failure | Repair outcome |
| --- | --- | --- |
| Audit insert omitted its `record_id` FK column | First record-create API attempt returned SQLite error | Corrected dedicated insert; first repair succeeded |
| Repeated-group base64 regex exhausted the regexp stack on 7 MiB valid base64 | API returned 500 / RangeError | Linear character validation plus canonical decode; first repair succeeded |
| Large allowed model snapshot exceeded Excel cell length | Export returned 500 | Explicit 413 cap before workbook construction; first repair succeeded |
| Login bypassed Origin validation | Hostile Origin login returned 200 | Mutation Origin validation moved before login; first repair succeeded |
| JSON routes accepted simple browser request media types | text/plain JSON login returned 200 | JSON media-type enforcement; first repair succeeded |
| Floating-point tolerance admitted more than three quantity decimals | `1.00000000001` accepted | Exact numeric decimal representation validation; first repair succeeded |
| Post-parser BOM errors used logical index rather than physical CSV row | Existing-SKU error reported line 3 instead of 4 after multiline text | Helper sourceRow metadata used transactionally; first repair succeeded |

One earlier in-flight whole-suite process imported an older helper module before the helper owner's new metadata test landed, and reported 63/64 with `CSV keeps physical source lines...` failing. The latest fresh full run above includes the helper fix and passes 65/65. No root cause approached five consecutive failed repairs.

## Operational boundaries

- Explicit export limits: 10,000 records, 200,000 combined rows, 32,767 characters in a snapshot cell, and 64 MiB XLSX output. Exceeding a cap returns 413 rather than truncating or partially exporting. Large model snapshots can require a smaller future export layout; the current contract permits explicit cap errors.
- Request bodies are capped at 12 MiB; photos at 8 MiB each, 40 million pixels, and 20 active photos per record. Soft-removed files remain on disk and therefore remain part of backups.
- SQLite operations are synchronous and intended for the approved single-machine deployment. Session tokens expire after 24 hours. File-system permissions and Windows data-directory access must remain restricted by the deploying user's OS account; the bootstrap file requests owner-only mode, and HTTP never exposes data paths.
- Set `PUBLIC_BASE_URL` for a reverse proxy or LAN address so exported photo links use that application origin. This implementation does not deploy a listener publicly or automatically send any records.
- No unresolved backend test failure at the latest verification. Full V1 completion still depends on the root's browser, packaging and independent review gates.
