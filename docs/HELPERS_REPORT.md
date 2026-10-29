# Pure helpers verification — 2026-10-29

Scope: `src/zip.js`, `src/xlsx.js`, `src/images.js`, `src/csv.js` and their four matching test files. No runtime npm dependencies, filesystem writes, network access or application-state changes in helper implementations. No commits made; root owns integration.

## Implemented behavior

- ZIP: reproducible deflated ZIP, CRC32, UTF-8 filenames, central directory and end record; rejects duplicate, absolute, traversal, backslash, control, malformed Unicode, Windows device and dot/space-normalized paths. Classic ZIP bounds are explicit; ZIP64 is unsupported.
- XLSX: OOXML ZIP with workbook/worksheet/style/content-type relationships; finite numeric cells; other values use inert inline strings; all XML text/attributes escaped and invalid XML codepoints removed. Header style, frozen first row, widths, wrapping and autofilters. Hyperlinks use external relationships and permit HTTP(S) or application-root paths only. Excel text/row/column limits throw instead of truncating.
- CSV: exact ordered headers `sku,descriptionEn,descriptionZh,unit`, leading UTF-8 BOM, quoted commas, doubled quotes, quoted multiline cells and CRLF/LF/CR. Trims field boundaries, ignores physically empty lines, requires SKU/English description/unit, permits empty Chinese description, rejects duplicates/incomplete fields/control characters/bad quoting/wrong field counts. Errors expose code/message and row-error list with physical line numbers. Returned rows have nonenumerable, nonwritable `sourceRow` metadata for accurate later backend validation; JSON and enumerable DTO keys remain exactly the four contract fields. Up to 5000 data rows; no partial return on error. Backend owns model/existing-SKU transactional checks.
- Images: Buffer only; defaults 8 MiB and 40 MP. PNG signature, chunk bounds/order/CRC, header mode/dimensions/palette, IDAT decompression with exact bounded output/stream consumption and scanline-filter validation, final IEND/no trailing data. Standard PNG bit depths and Adam7 scanline sizing supported; animated PNG rejected. JPEG SOI/EOI, segment bounds, supported 8-bit sequential/progressive frames, dimensions/components/sampling, quantization/Huffman tables, scan components/spectral fields and entropy marker framing; no trailing data. SVG/WebP and malformed/truncated content rejected with error codes. JPEG extension is `jpg`.

## Commands and observed results

Working directory for every command: `D:\Codex\JGPD\huabao-service-v1`.

Node executable: `C:\Users\ilove\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` (Node 24).

Python executable: `C:\Users\ilove\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`.

```powershell
& 'C:\Users\ilove\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/zip.test.js tests/xlsx.test.js tests/images.test.js tests/csv.test.js
```

Final result: **15 tests, 15 pass, 0 fail**, exit 0. Coverage includes the known CRC32 vector `123456789 = CBF43926`; binary/Unicode ZIP round trip; traversal and Windows-normalization attacks; four-sheet workbook; formula-like strings and numeric types; hyperlink validation; strict CSV errors, physical-line provenance and 5000/5001 boundary; every proper prefix of the valid PNG/JPEG fixtures; malicious JPEG tables/scans; PNG non-ASCII chunk names and concealed extra compressed bytes.

TDD evidence: initial helper tests were created and run before implementation and failed because helper modules were absent. After the first GREEN run, separate added regression tests reproduced Windows path normalization acceptance, malformed JPEG tables/scans, PNG concealed data/non-ASCII chunk acceptance, and absent CSV physical-line metadata requested by backend integration. Each reproduced failure was fixed and rerun GREEN. No issue required more than one unsuccessful fix round; five-round stop threshold was never reached.

```powershell
& 'C:\Users\ilove\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' artifacts/helpers/verify_workbook.py
```

Exit 0; independent **openpyxl 3.1.5** opened `artifacts/helpers/four-sheet.xlsx`, verified exact four sheet names, preserved escaped XML/CRLF/Chinese, removed illegal NUL, formula-like strings as type `s`, quantity 2.125 as type `n`, header bold, frozen A2, filter A1:B3, complete hyperlink URL containing `&`, and Python zipfile CRC integrity. Machine result: `artifacts/helpers/openpyxl-result.json`. The first inline Python attempt hit PowerShell quoting and did not run; a saved script resolved invocation quoting, without a workbook change.

```powershell
& 'C:\Users\ilove\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' artifacts/helpers/generate_image_variants.py
& 'C:\Users\ilove\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' artifacts/helpers/verify_image_variants.mjs
```

Both exit 0. Independently generated Pillow images: 13 variants, all accepted with actual 13×17 dimensions: bilevel, grayscale, indexed, RGB, RGBA, LA, 16-bit grayscale PNG; grayscale/RGB/CMYK JPEG each baseline and progressive. Machine result: `artifacts/helpers/image-variants-result.json`.

```powershell
& 'C:\Users\ilove\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/*.test.js
```

Required whole-project run at that point: **56 tests, 22 pass, 34 fail**, exit 1. All then-current 13 helper tests plus domain/frontend tests passed. Every failure below occurred on `fetch` connection with sandbox `connect EACCES 127.0.0.1:<ephemeral-port>` before its business assertions. Root was notified to rerun in its approved execution context. These are not a claim that integration passes. Later helper-only hardening increased the pure-helper count to 15; that final helper run is reported above.

Failed acceptance case names:

1. AC-01 unauthenticated requests and own-only lists
2. AC-02 exact SN read-only exception never grants editing or broad search
3. AC-03 repeated SN creates separate work orders without overwriting
4. AC-04 WFR resume retains notes, checks and same work order
5. AC-05 only current model BOM items may be consumed
6. AC-06 and AC-07 packaging is ordinary BOM, precise quantity and no duplicate rows
7. AC-08 no material or photo is required for valid refurbishment
8. AC-09 incomplete or failed refurbishment checks block completion
9. AC-10 failed initial test survives successful ROK completion
10. AC-11 ROK cannot complete without all final checks passing
11. AC-12 SCRAP requires non-whitespace reason but not passing checks
12. AC-13 exactly one outcome is supported; WFR cannot complete
13. AC-14 completed owner cannot edit; administrator correction needs reason
14. AC-15 corrections retain before/after/actor/reason and original owner
15. AC-16 four-sheet export is complete, inert and permission scoped
16. AC-17 catalog edits preserve a saved record model/BOM snapshot
17. AC-18 stale versions are rejected without losing previous saved fields
18. SEC authenticated mutations require CSRF and reject hostile Origin
19. SEC operators cannot administer users, roles or dictionaries
20. ADMIN CSV import is atomic for duplicate/missing rows, accepts quoted cells
21. ADMIN user deactivation invalidates previously issued sessions
22. ADMIN last active administrator is protected
23. DATA invalid numeric quantities and missing English BOM names are rejected
24. DATA no_defect cannot coexist with another appearance defect
25. DATA invalid outcome/check codes and ownership forgery cannot modify authority
26. MEDIA SVG disguised as PNG is rejected without a photo row
27. SEC private data directories and path traversal are not static content
28. AUTH invalid logins are generic and throttled
29. REAL fresh production has no fictitious models or records and generates private admin credentials

Failed API case names:

30. authentication, CSRF, own-only list and full-SN history cannot grant writes or export
31. records validate atomically, preserve snapshots, lock completion and audit corrections
32. admin account maintenance enforces last admin and revokes deactivated/password-changed sessions
33. BOM import rejects duplicate existing SKUs atomically and exports actual XLSX
34. fresh production has empty catalogs and a random first-run credential file, never demo logins

## Limits and integration notes

- JPEG validation checks container/tables/scan structure, not full Huffman pixel reconstruction or visual decodability. It is not a content moderation or antivirus scanner. Original image bytes remain unchanged.
- PNG inflation is bounded by the validated dimensions/bit depth; a 40 MP 16-bit RGBA image can require approximately 320 MB of decompressed memory. The caller should limit simultaneous uploads if needed.
- Workbooks and ZIPs are built in memory; backend owns business export size caps and HTTP error mapping. Invalid workbook definitions throw ordinary Errors; image/CSV errors carry the contract's code fields.
- Only standard 8-bit Huffman sequential/progressive JPEG is accepted; lossless, arithmetic and 12-bit JPEG are intentionally unsupported.
- Test-only generated scripts, workbook, image fixtures and JSON evidence are confined to ignored `artifacts/helpers/`; no archives, source originals, business data or credentials were changed.
