# V1 API contract

This is the binding frontend/backend interface. New internal API: no prior consumers, BACKWARD COMPATIBLE initial contract. Consumers: bundled desktop web UI and test scripts. JSON camelCase. Error shape `{error:{code,message,details?}}`; `details` may be an object or array. 400 invalid JSON, 401 unauthenticated, 403 forbidden/CSRF, 404 absent, 409 version conflict, 422 validation/business rule, 413 payload/export cap, 429 throttled. No CORS. All mutations except login require `X-CSRF-Token` from the session. Session cookie is HttpOnly/SameSite=Strict.

## DTOs

`User = {id,username,displayName,role:'admin'|'operator',active,language:'en'|'zh'}`.

`CheckItem = {code,labelEn,labelZh}`. `Model = {id,nameEn,nameZh,productSku,active,checkItems:CheckItem[]}`.

`AppearanceOption = {code,labelEn,labelZh,active}`. `BomItem = {id,modelId,sku,descriptionEn,descriptionZh,unit,active}`.

`Record = {id,workOrder,sn,modelId,modelSnapshot:Model,productSku,ownerId,ownerName,sourcePallet,storagePallet,workDate,status:'draft'|'wfr'|'completed',outcome:null|'like_new'|'good'|'acceptable'|'rok'|'scrap'|'awp'|'needs_analysis',outcomeGroup:null|'refurbishment'|'repair'|'wfr',appearanceCodes:string[],appearanceSnapshot:AppearanceOption[],appearanceNotes,issueNotes,translatedAppearanceNotes,translatedIssueNotes,receivingSku,postSortSku,receivingOrderNo,receivingStatus,productNameVerification,skuVerification,parentRecord,unspecifiedTextField,scrapReason,checks:{initial:{[checkCode]:'not_tested'|'pass'|'fail'},final?:{[checkCode]:same}},materials:{bomId,sku,descriptionEn,descriptionZh,unit,quantity}[],photos:Photo[],version:number,createdAt,updatedAt,completedAt:null|string}`.

`Photo = {id,recordId,filename,mime,size,width,height,url,uploadedAt,uploadedBy}`; URL relative `/api/photos/:id`. Append `?sn=<exact SN>` to photo URLs when viewing someone else's exact-SN history.

`RecordInput = {version,sn,modelId,productSku,sourcePallet,storagePallet,workDate,outcome,appearanceCodes,appearanceNotes,issueNotes,translatedAppearanceNotes,translatedIssueNotes,receivingSku,postSortSku,receivingOrderNo,receivingStatus,productNameVerification,skuVerification,parentRecord,unspecifiedTextField,scrapReason,checks,materials:{bomId,quantity}[],action:'save'|'complete'}`. Ignore/reject attempts to alter server-owned owner/ID/snapshot/label fields; NEVER trust client snapshots or descriptions. `action=save` yields status wfr for waiting outcomes, otherwise draft. `complete` requires final eligible outcome and validates before committing. A completed record is not unlocked by a normal save.

## Current user override: single functional inspection

CURRENT_RULES.md supersedes v0.3 final-test requirements. Bundled UI and API update together; no external consumers identified. This intentionally reverses the previous potentially breaking dual-stage restoration.

- `checks.initial` is the one editable inspection for every outcome. New records/payloads have no final map. Any existing `checks.final` remains immutable archived evidence; client final values are ignored, never created or overwritten.
- ROK requires every inspection item assessed (pass/fail); refurbishment requires all pass; SCRAP reason and WFR incompletion remain. Old completed ROK with legacy final evidence may receive notes-only corrections when model/inspection are unchanged; no new incomplete inspection can use that exception.
- Client preflight and incomplete-ROK error: `Complete all inspection items. Refurbishment requires all results to pass.` Existing SCRAP exact copy remains unchanged.
- New optional original/manual-translation/reference fields, per-account language preferences and CSRF/auth contract from the v0.3 QA work are retained. No translator or external warehouse/approval workflow.
- Export has one stage `inspection`, displayed Inspection Result (ZH检验结果) per function. Any old final evidence remains in Legacy Post-work Checks JSON (ZH旧版复测存档 JSON) in Work Summary; the other three sheets, bilingual headers, readable values and raw codes remain.

## Session

- `GET /api/health` -> `{ok:true,version:'1.0.0',demo:boolean}`.
- `GET /api/session` -> `{user:User|null,csrfToken:string|null,demo:boolean}` (200 when logged out).
- `POST /api/login` `{username,password}` -> session object, Set-Cookie.
- `POST /api/logout` -> `{ok:true}` and expire cookie.
- `PUT /api/account/language` `{language:'en'|'zh'}` -> `{user:User}`; authenticated + CSRF, persists only the signed-in account.
- `POST /api/account/password` `{currentPassword,newPassword}` -> `{ok:true}`.

## Catalog

- `GET /api/catalog` -> `{models:Model[],appearanceOptions:AppearanceOption[],outcomes:{code,group,labelEn,labelZh}[]}`. Active options for operators; historical snapshots remain in records. Admin can include inactive for maintenance with `?includeInactive=1`.
- `GET /api/models/:id/bom?q=&page=1&pageSize=50&includeInactive=1` -> `{items:BomItem[],total,page,pageSize}`. Page size <=100; includeInactive admin only; queries only this model's BOM. Full SKU exact match ranks first, English/Chinese description partial matches supported.

## Records and exact-SN history

- `GET /api/records?q=&status=&modelId=&ownerId=&from=&to=&page=1&pageSize=20` -> `{items:Record[],total,page,pageSize}`. Operators own only; ownerId filter admin only. q matches SN or work order. `status` draft/wfr/completed. Date filters ISO workDate.
- `POST /api/records` `{sn,modelId,workDate?,productSku?,sourcePallet?,storagePallet?}` -> `{record:Record}` (201). Owned by creator. Duplicate SN is allowed (independent visit); no foreign owner assignment. Require exact nonempty SN and active model with nonempty bilingual-capable check list.
- `GET /api/records/:id` -> `{record}`; own/admin only. Exact-SN exception: `?historySn=<matching complete SN>` allows other operators read-only.
- `PUT /api/records/:id` RecordInput -> `{record}`; owner unfinished only (admin-owned follows same rules). Atomic validate+save/complete, increment version.
- `POST /api/records/:id/corrections` `{version,reason,changes:RecordInput}` -> `{record}`; admin only, nonempty reason, immutable owner, before/after audit. Completed records stay completed and must pass completed validation.
- `GET /api/records/:id/audit?historySn=` -> `{items:{id,recordId,action,actorId,actorName,reason,before,after,createdAt}[]}`. Same read permissions as record. No password/session secrets.
- `GET /api/sn-history?sn=<exact complete SN>` -> `{items:Record[]}` ordered newest first; no partial or empty search. User-entered full SN is the specific read-only exception, not bulk export permission.
- `POST /api/records/:id/photos` `{version,filename,contentBase64,reason?}` -> `{photo,record}` (201). Owner unfinished or admin with reason, update version. Uploaded images are optional. Validate decoded size/signature/dimensions. DB row and physical filename are server generated.
- `GET /api/photos/:id?sn=` -> image bytes, authorized record permissions, private/no-store/nosniff. Exact SN is optional only for the read-only history exception.
- `DELETE /api/photos/:id` `{version,reason?}` -> `{record}`. Same write permissions; audit/soft removal, preserve original file.

## Administration

- `GET /api/admin/users` -> `{items:User[]}`.
- `POST /api/admin/users` `{username,displayName,role,password}` -> `{user}` (201).
- `PUT /api/admin/users/:id` `{displayName,role,active}` -> `{user}`. Cannot deactivate/demote last active admin. Operator cannot self-promote. Deactivation revokes sessions.
- `POST /api/admin/users/:id/password` `{password}` -> `{ok:true}`, revoke old sessions.
- `POST /api/admin/models` Model minus id -> `{model}` (201); `PUT /api/admin/models/:id` -> `{model}`. checkItems codes unique, labelEn required; changing catalogs never overwrites record snapshots.
- `POST /api/admin/appearance` AppearanceOption -> `{option}` (201); `PUT /api/admin/appearance/:code` -> `{option}`. no_defect reserved compatible key.
- `POST /api/admin/bom` BomItem minus id -> `{item}` (201); `PUT /api/admin/bom/:id` -> `{item}`. Unique model+SKU. label/descriptionEn required. Disable instead of deleting.
- `GET /api/admin/bom/template` -> UTF-8 CSV `sku,descriptionEn,descriptionZh,unit`.
- `POST /api/admin/bom/import` `{modelId,csv}` -> `{created:number}` (201). All rows validate first; at most 5000 rows; reject duplicate/incomplete SKU with row errors atomically, no silent dedup/overwrite. CSV parser supports BOM, quoting, commas, CRLF, quoted multiline cells.

## Export

- `GET /api/export?language=en|zh` (default en) same record filters (no page) -> XLSX attachment, four sheets: `Work Summary`, `Functional Checks`, `Material Usage`, `Photo Index`.
- Operators own only, admin filtered/all. Full business fields including notes, labels, snapshots, state and relevant timestamps; no secrets. Four sheets relate by workOrder plus SN. Photo hyperlinks point to authenticated application endpoints. Row text is inert XML strings, never formulas. Explicit cap error rather than truncation.

## Integration signatures

Backend owner exports from `server.js`: `async startServer({dataDir,demo=false,port=0,host='127.0.0.1',publicBaseUrl?}) -> {server,baseUrl,close:async()=>void}`. CLI reads `--demo`, `HB_DATA_DIR`, `HOST`, `PORT` (4310 default), `PUBLIC_BASE_URL`. No external runtime packages.

Helpers owner exports `buildWorkbook(sheets)` from `src/xlsx.js`: sheets = `[{name,columns:[{key,label,width?}],rows:object[],hyperlinks?:[{row:1-based DATA row,column:key,url}]}]`; returns XLSX Buffer. XML escape every cell/control character; numeric finite numbers stay numeric; plain strings not formulas. `makeZip(entries)` from `src/zip.js`: entries = `[{name,data:Buffer|string}]`, returns ZIP Buffer. `crc32(buffer)` exported.

Helpers owner exports `validateImage(buffer,{maxBytes=8388608,maxPixels=40000000}={}) -> {mime,extension,width,height}` from `src/images.js`; throws Error with `.code` and `.message` on invalid PNG/JPEG, truncation, oversized, invalid dimension; no SVG/WebP in V1.

Helpers owner exports `parseBomCsv(csv) -> [{sku,descriptionEn,descriptionZh,unit}]` from `src/csv.js`; throws Error with `.code`, `.message`, `.details` row error list; max 5000 rows. Framework-independent, no writes. Backend adds model/existing SKU checks transactionally.

## Demo fixtures

Demo only: admin / `HuabaoAdmin!2026`; alex / `HuabaoAlex!2026`; blair / `HuabaoBlair!2026`. Display names Demo Admin, Alex Operator, Blair Operator. Models: `id=1` Sample Model A, `id=2` Sample Model B. Model 1 initial check codes `ac_output`, `dc_output`, `charging`, at least 800 clearly marked demo BOM items, including a Packing Box. Appearance `no_defect`,`scratches`,`cracks`,`dents`. Include one Blair completed historical record with SN `DEMO-HISTORY-001`, one Alex WFR SN `DEMO-WFR-001`; do not preselect outcomes on a new record. Fresh real mode has no fictitious business catalogs/records and writes a random initial admin password to private data-dir first-run credentials file.

## Primary references checked 2026-10-29

- Node.js 24 SQLite: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html ; installed and directly checked v24.22.1 supports DatabaseSync/prepare/binding.
- Node.js HTTP: https://nodejs.org/docs/latest-v24.x/api/http.html
- Node.js test runner: https://nodejs.org/docs/latest-v24.x/api/test.html

Use tested Node 24 APIs, not unpinned main/Node 26 aliases.

## Readable export values

Work Summary Status has In Progress/Completed (localized for zh), with separate Status Code preserving draft/wfr/completed. Functional Checks Stage and Result show Inspection Result and Pass/Fail/Not Tested (localized for zh), with separate Stage Code and Result Code preserving raw values. Material Usage header Part SKU remains distinct from Product SKU. This is an XLSX header/value formatting change for bundled consumers; free originals, stored codes, relationships and four-sheet count are unchanged. No external consumers identified.
