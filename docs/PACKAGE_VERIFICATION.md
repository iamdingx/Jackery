# Clean-package verification

Date: 2026-10-29. Platform: Windows / Node.js 24.22.1.

- ZIP validated with Python zipfile CRC checks and safe extraction path checks.
- Source package excludes .git, node_modules, data/data-demo, custom business/backup directories, initial production passwords and temporary test artifacts.
- Required launchers, server, HTML entry and startup README exist in extracted package.
- Extracted into a new owned artifacts/package-smoke-round1 directory, not executed from the development source directory.
- Started the extracted HTTP application without installing any runtime npm dependencies.
- Logged in using the demo operator, loaded the frontend, created PACKAGE-PERSISTENCE-001, stopped the server, reopened the SQLite data directory and verified that the record persisted.
- The canonical Windows Start-Demo.cmd launcher also ran successfully and the live demo is available on http://127.0.0.1:4310 while its process remains running.
- Final report/screenshots are added after this check, then ZIP is rebuilt. Executable source candidate is unchanged; its fingerprint is the value below. The external .sha256.json contains the final ZIP byte hash and file list.

Verified executable candidate: `4ff6879258b1daef0a7c60ef94545454a50e51cf02083a18e24f12e9f67d28bf`.

The ZIP contains source and launchers, not Node.js or browser installers. Current computer's compatible Codex runtime is automatically found by Start.cmd; other computers require Node.js 24.
