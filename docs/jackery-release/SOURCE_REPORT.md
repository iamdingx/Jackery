# Jackery EU catalog source report

Batch: `jackery-eu-20261030`. Built from the supplied original documents on 2026-10-30. This report records document evidence and import configuration; it does not confirm present-day production or supply availability.

## Inputs and traceability

- Original root: `D:\SynologyDrive\Saga\PM\华宝新能\Jackery 1-2度电移储维修材料`.
- Prior extraction index: `D:\Codex\JGPD\outputs\jackery_bom_20261027\bom_data.json`.
- Catalog: `catalogs/jackery-eu-20261030.json` (`schemaVersion: 1`).
- Reproducible builder: `python -X utf8 scripts/build-jackery-catalog.py`; optional `--index` and `--source-root` allow the same source set at another path.
- Source manifest contains 27 original documents: nine BOM workbooks, six fault-code PPTX files, six common-fault PPTX files, and six functional SOPs (four XLSX and two PPTX). Every source has its relative path and SHA-256. Locations on each imported record retain file, relative path, worksheet/slide, row where applicable, and SHA-256.
- All nine BOM hashes equal the archived index. The builder verifies the material code, name, specification, quantity, original model, lifecycle, and issue method directly against the source workbook, where present, for all 414 indexed rows. E1000 uses its own source header mapping and does not invent absent fields. All 27 source hashes are checked again after extraction.
- `artifacts/jackery-catalog/source-extraction.json` retains PPTX table cells with row numbers, paragraph boundaries and merge attributes, plus the relevant SOP workbook cells. Source workbooks and presentations are opened read-only; no source files or business databases are written.

## Row conservation and activation

`414 original BOM rows = 8 product roots + 2 software rows + 404 physical candidate rows`.

`404 physical candidates = 261 active rows + 143 suspended rows`.

These are model/version-specific BOM row counts, not globally deduplicated part counts or stock quantities. Identical SKUs in different versions remain separate BOM records.

| Catalog key | Original model/version label | Physical rows | Active rows | Suspended rows | Model active |
| --- | --- | ---: | ---: | ---: | --- |
| e1000pro-default | E1000pro / 未标注版本 | 46 | 43 | 3 | yes |
| e1000v2-original | E1000V2 / 原始版 | 43 | 0 | 43 | no |
| e1000v2-costdown | E1000V2 / 降本版 | 43 | 42 | 1 | yes |
| e1000-default | E1000 / 未标注版本 | 25 | 0 | 25 | yes, fault recording and knowledge only |
| e2000plus-a | E2000plus / A版 | 57 | 0 | 57 | no |
| e2000plus-b | E2000plus / B版 | 53 | 52 | 1 | yes |
| e2000pro-default | E2000pro / 未标注版本 | 54 | 48 | 6 | yes |
| e2000v2-original | E2000V2 / 原始版 | 42 | 38 | 4 | yes |
| e2000v2-costdown | E2000V2 / 降本版 | 41 | 38 | 3 | yes |
| Total | 9 variants / 6 base models | 404 | 261 | 143 | 7 active / 2 suspended |

Rules applied:

1. All eight BOM hierarchy `0` product-root records are model metadata and are excluded from physical part SKUs. Product SKU comes only from such a root record.
2. The E2000plus B software items `36-0001-000118` (主板软件) and `36-0003-000009` (充电板软件) are excluded from physical parts. Their full original rows and exclusion reasons remain in `excluded`.
3. The other three physical `不发料` rows remain in their catalogs but inactive: E1000pro label `08-1100-117973`, and E1000V2 original/costdown product rear labels `35-0007-001353`.
4. Lifecycle values `停止生产`, `样机`, and `试产` suspend their own rows. These occur in four, twelve, and three rows respectively; these reasons overlap parent-model holds and are not additional row totals.
5. E1000V2 original filename maps to E1000V2, while the original workbook's model field says E2000V2. Both labels are retained; this variant and all 43 candidate rows remain inactive pending confirmation. The costdown workbook says `E1000V2降本版`, and remains a separate version.
6. E2000plus A root specification explicitly begins `【停用】`, while its lifecycle field says `量产`. The source conflict remains unresolved. The model and all 57 candidates remain inactive; this import does not override the root's status.
7. E1000's source directory is marked `01完整BOM表（缺）`. Its 25 rows contain no source quantities or product SKU. `standardQty` remains `null`, `productSku` remains an empty string, and all 25 candidates remain inactive. The model remains available for fault recording and source knowledge; the product-like number in its filename is not treated as a verified product SKU.

The suspended-row reason counts overlap: parent model requires review 100; quantity absent 25; lifecycle 样机 12; 停止生产 4; 试产 3; physical 不发料 3. The unique suspended-row total is 143.

## Fault knowledge and repair context

Each of the six base-model folders has a supplied fault-code table with exactly F0 through F9. Those ten records are retained for each corresponding catalog variant: 60 base-model source records and 90 variant-associated records. Every title and description is copied from its own source table row.

The two final fault-table rows have no code and describe `充放电高温` and `充放电低温`. They are notices with their original text and row references. No F10/F11 is created.

The fault-code tables contain descriptions without explicit code-linked repair steps. `solutionZh` and `solutionEn` are empty for all codes. The common-fault documents are kept separately as five repair guides per base model (slides 2–6), each retaining a whole source slide table rather than guessing which merged row belongs to a nearby symptom. Source-table merge attributes and blank continuation cells remain available in `sourceTables` and the extraction artifact. The complete joined table is `stepsZh`; `symptomsZh` is empty rather than a guessed mapping. This preserves repair context without claiming a direct F-code solution.

Model variants share their own base-model folder's supplied knowledge. This association is configuration based on the original source folder, not proof that every repair operation or software version is interchangeable across BOM versions. No invented translations, replacement instructions, specifications, thresholds, or fault solutions were added.

## Functional checklist and language limits

Checklist titles come from the original `09功能测试SOP及标准` folder. E1000 has six items; E1000pro, E1000V2 and E2000plus have seven; E2000pro and E2000V2 have eight. Their worksheet/slide rows are retained on every checklist item. The titles cover only actual source input/output/display/LED functions. Numeric SOP values are not converted into automatic pass/fail thresholds. In particular, mixed-market instructions in the E2000plus workbook are not asserted as EU-specific thresholds.

Chinese source descriptions remain Chinese. Absent English text is deliberately an empty string in part descriptions, checklist labels, fault knowledge, repair guides and notices. Product/model identifiers are retained as identifiers in `nameEn`; they are not translations. The application must visibly communicate that the English description or guidance is unavailable and show the Chinese source as such. Missing English does not automatically suspend an otherwise ready physical part.

## Remaining source decisions

- Confirm E1000V2 original workbook's model identity before activating it.
- Confirm the E2000plus A root's `【停用】` status versus `量产` before activating it.
- Supply E1000's complete BOM, verified product SKU and standard quantities before issuing its parts through this catalog.
- Confirm availability and approved use of the individual lifecycle-held and `不发料` materials before activation.
- Supply reviewed English descriptions and explicit F-code repair solutions if these are needed; blank fields currently express missing source evidence.
- Confirm a version-specific repair applicability matrix if repair knowledge must differentiate original/costdown or A/B variants beyond the provided folder association.

## Verification performed

The builder completed successfully, including original-hash checks, 414-row source-cell comparison, row conservation, nine unique catalog keys, F0–F9 completeness for every base model, two unnumbered notices for each base model, and source-derived checklist cardinality of 3–8 items. `artifacts/jackery-catalog/verification.json` contains machine-readable counts. Catalog regeneration is deterministic for unchanged inputs.
