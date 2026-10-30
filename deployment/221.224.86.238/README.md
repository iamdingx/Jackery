# Jackery V1 server deployment

State: deployed and externally verified. See `DEPLOYMENT_REPORT.md` for actual results, configuration fixes, private credential handoff and rollback. The remaining preparation notes document the intended controls and must not replace the actual receipt.

Verified application input: commit `abb8df9`, candidate `84b855ad13e879837a2cad8cbef061a23f97d2af7d1c1cab721423b97e288bf5`, 148/148 complete regression tests. The runtime bundle must match the source files in this verified candidate. Local simulation data and demo accounts are excluded.

## Observed target and pending checks

The target's SSH port responds as Ubuntu OpenSSH. HTTP/HTTPS currently refuse TCP connections. This proves SSH reachability, not login, OS ownership, web forwarding, or deployment success. No local SSH key, agent or authenticated remote session was found.

After SSH authentication, run `remote-preflight.sh` read-only. Check OS/architecture, Node 24.10+ on the 24.x line, free disk, existing processes and proxy configuration. Verify which host actually owns the public address and whether inbound web ports are forwarded. Do not replace existing sites or service data.

## Intended production layout

- Immutable runtime releases: `/opt/jackery/releases/<commit>-<candidate-prefix>/`.
- Current symlink: `/opt/jackery/current`.
- Dedicated non-login service account: `jackery`.
- Persistent data: `/var/lib/jackery/`; SQLite filename stays `huabao.sqlite` for compatibility.
- Private service configuration: `/etc/jackery/jackery.env`, root-owned mode 0600.
- Dedicated service: `/etc/systemd/system/jackery.service`.
- Internal HTTP listener: `127.0.0.1:14310` after checking that this port is free.
- External origin: the requested IP address; use existing approved HTTPS configuration if available. The supplied HTTP template is a candidate, pending the server and forwarding inspection.

The public origin must equal `PUBLIC_BASE_URL` so CSRF checks, cookies and export photo URLs agree. Nginx preserves the public Host and accepts 16 MiB request bodies, enough for the app's 8 MiB photo uploads encoded in JSON. The application's database, private credentials and backup folders must not be exposed as web roots.

## Installation and rollback boundaries

Use production mode, with no `--demo`; do not copy `data-demo`, test accounts or simulated work orders. First start creates only a random administrator credential file in the private data directory and imports the real source catalog and local BOM translations. Do not print that credential into logs or source control.

Before upgrading an existing Jackery installation, back up its service configuration and data with the verified `scripts/backup.mjs`. Retain the old release and its current symlink target. Only after the local upstream health check succeeds should a new dedicated reverse-proxy site be enabled. Validate the proxy configuration before reloading it.

If the new service fails, restore the previous symlink and configuration, then restart the old service. Do not overwrite a database with a backup while either application is running. First-time installs must leave unrelated sites and services intact.

## Acceptance after deployment

1. Confirm process runs as the dedicated user, survives restart and uses persistent data.
2. Confirm `/api/health` reports production mode at both the local upstream and actual external URL.
3. Authenticate with the newly generated production admin; check 9 real catalog variants, 7 enabled model configurations, 261 enabled parts and 242 source translations. The 143 held parts stay unavailable.
4. Validate English above Chinese, the specified car-charging example, model-specific faults, quantity caps and single inspection without final retests.
5. Validate a controlled smoke record, attachment, four-sheet export, lock and reasoned admin correction. Label any acceptance test record explicitly; do not silently erase business data.
6. Record the deployed commit, runtime file hashes, service/proxy configuration, backup location and actual access URL. Never report this deployment as complete based only on local tests.
