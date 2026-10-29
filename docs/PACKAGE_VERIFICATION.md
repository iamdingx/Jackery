# Clean-package verification

Date: 2026-10-30. Platform: Windows / Node.js 24.22.1.

- ZIP validated with Python zipfile CRC checks and safe extraction path checks.
- Source package excludes .git, node_modules, data/data-demo, custom business/backup directories, initial production passwords and temporary test artifacts.
- Required launchers, server, HTML entry and startup README exist in extracted package.
- Extracted into a new owned artifacts/package-single-inspection directory, not executed from the development source directory.
- Started the extracted HTTP application without installing any runtime npm dependencies.
- Logged in using the demo operator, loaded the frontend, created PACKAGE-SINGLE-INSPECTION-001, stopped the server, reopened the SQLite data directory and verified that the record persisted with its single inspection and completed status. ROK completed with one observed failed function and no post-work checks.
- The canonical Windows Start-Demo.cmd launcher also ran successfully and the live demo is available on http://127.0.0.1:4310 while its process remains running.
- Final report/screenshots are added after this check, then ZIP is rebuilt. Executable source candidate is unchanged; its fingerprint is the value below. The external .sha256.json contains the final ZIP byte hash and file list.

Verified executable candidate: `439cfece9c7e5bce0e5ccbe3dee5f3a3ffac7011dc69a866b2fdffb1ad6ab0c0`.

The ZIP contains source and launchers, not Node.js or browser installers. Current computer's compatible Codex runtime is automatically found by Start.cmd; other computers require Node.js 24.

Single-inspection release: 81 core tests and 8 real-browser scenarios pass. New archive CRC/SHA256/private-file checks and clean extracted startup/restart checks passed. Live demo radio controls verified in both languages; all 4 pre-existing records match the online backup unchanged. Package smoke evidence: artifacts/package-single-inspection-proof.json.
