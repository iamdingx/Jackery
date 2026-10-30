# 3-case supplemental browser simulation

Started: 2026-10-30T03:21:24.336Z
Finished: 2026-10-30T03:21:29.286Z
Isolated data: D:\Codex\JGPD\huabao-service-v1\tests\.tmp\batch-browser-kYPp8i
Prefix: UI-EXTRA-20261030

3/3 passed; 0 failed; 3 independent UI-created baseline records. Cases run serially. Both 1366×768 and 1536×864 viewports are used. All baseline business APIs are real; only C100 explicitly injects one photo network failure before an actual successful retry. C082 uses a labelled special-character fault fixture in an isolated catalog copy; the base source catalog is unchanged.

|Case|Variant|Record|Result|ms|Assertions|
|---|---|---:|---|---:|---:|
|C101|positive_single_f5_requested|3|passed|1251|27|
|C102|positive_multi_f0_f3_f8_requested|4|passed|1168|26|
|C103|positive_multi_f2_f9_requested|5|passed|1083|31|

Menu/branch coverage: login:alex, login:blair, login:admin, My Records/new record, account language, fault selector, BOM drawer, Current Record/reload, Current Record menu, logout.

Machine-readable per-case requests/status codes, console diagnostics, assertions and screenshots are in BROWSER_RESULTS.json. Rejected direct API probes follow a separate legal UI baseline for each case; they do not replace browser creation.
