# 100-case browser simulation

Started: 2026-10-30T03:19:00.245Z
Finished: 2026-10-30T03:20:39.273Z
Isolated data: D:\Codex\JGPD\huabao-service-v1\tests\.tmp\batch-browser-ONXAv4
Prefix: UI-R2-20261030

100/100 passed; 0 failed; 100 independent UI-created baseline records. Cases run serially. Both 1366×768 and 1536×864 viewports are used. All baseline business APIs are real; only C100 explicitly injects one photo network failure before an actual successful retry. C082 uses a labelled special-character fault fixture in an isolated catalog copy; the base source catalog is unchanged.

|Case|Variant|Record|Result|ms|Assertions|
|---|---|---:|---|---:|---:|
|C001|positive_like_new_1|3|passed|1206|26|
|C002|positive_good_1|4|passed|1172|26|
|C003|positive_acceptable_1|5|passed|934|26|
|C004|positive_rok_1|6|passed|767|24|
|C005|positive_scrap_1|7|passed|1066|26|
|C006|positive_awp_1|8|passed|1001|31|
|C007|positive_needs_analysis_1|9|passed|1099|31|
|C008|positive_like_new_2|10|passed|950|26|
|C009|positive_good_2|11|passed|967|26|
|C010|positive_acceptable_2|12|passed|967|26|
|C011|positive_rok_2|13|passed|831|26|
|C012|positive_scrap_2|14|passed|950|26|
|C013|positive_awp_2|15|passed|867|29|
|C014|positive_needs_analysis_2|16|passed|1153|31|
|C015|positive_like_new_3|17|passed|796|24|
|C016|positive_good_3|18|passed|898|26|
|C017|positive_acceptable_3|19|passed|919|26|
|C018|positive_rok_3|20|passed|935|26|
|C019|positive_scrap_3|21|passed|965|26|
|C020|positive_awp_3|22|passed|1101|31|
|C021|positive_needs_analysis_3|23|passed|1033|31|
|C022|positive_like_new_4|24|passed|883|26|
|C023|positive_good_4|25|passed|899|26|
|C024|positive_acceptable_4|26|passed|840|24|
|C025|positive_rok_4|27|passed|993|26|
|C026|positive_scrap_4|28|passed|883|26|
|C027|positive_awp_4|29|passed|1100|31|
|C028|positive_needs_analysis_4|30|passed|1035|31|
|C029|positive_like_new_5|31|passed|931|26|
|C030|positive_good_5|32|passed|984|26|
|C031|positive_acceptable_5|33|passed|917|26|
|C032|positive_rok_5|34|passed|917|26|
|C033|positive_scrap_5|35|passed|749|24|
|C034|positive_awp_5|36|passed|1117|31|
|C035|positive_needs_analysis_5|37|passed|1201|31|
|C036|positive_like_new_6|38|passed|898|26|
|C037|positive_good_6|39|passed|883|26|
|C038|positive_acceptable_6|40|passed|934|26|
|C039|positive_rok_6|41|passed|900|26|
|C040|positive_scrap_6|42|passed|1000|26|
|C041|cap_save_over|43|passed|912|29|
|C042|cap_complete_over|44|passed|979|29|
|C043|cap_admin_over|45|passed|1414|30|
|C044|quantity_zero|46|passed|954|29|
|C045|quantity_negative|47|passed|982|29|
|C046|pcs_fraction|48|passed|866|29|
|C047|quantity_string|49|passed|865|28|
|C048|quantity_null|50|passed|816|28|
|C049|duplicate_material|51|passed|985|29|
|C050|foreign_model_material|52|passed|882|28|
|C051|suspended_material|53|passed|534|25|
|C052|unknown_bom|54|passed|818|28|
|C053|cap_exact_save|55|passed|858|26|
|C054|cap_lower_save|56|passed|884|26|
|C055|wfr_repeated_not_accumulated|57|passed|1033|28|
|C056|catalog_counts|58|passed|1106|32|
|C057|suspended_original_create|59|passed|810|26|
|C058|suspended_a_create|60|passed|817|26|
|C059|e1000_no_consumption|61|passed|689|26|
|C060|version_independent_cap|62|passed|2018|71|
|C061|blank_sn|64|passed|912|26|
|C062|whitespace_sn|65|passed|953|26|
|C063|overlength_sn|66|passed|714|23|
|C064|numeric_sn|67|passed|849|25|
|C065|control_sn|68|passed|883|25|
|C066|sn_trim|69|passed|819|27|
|C067|sn_special_chars|71|passed|883|27|
|C068|exact_history|73|passed|1044|26|
|C069|partial_history_empty|74|passed|913|25|
|C070|same_sn_second_record|75|passed|710|25|
|C071|invalid_model|77|passed|792|25|
|C072|string_model|78|passed|835|25|
|C073|model_change_clears_context|79|passed|1483|32|
|C074|model_change_foreign_material|80|passed|906|28|
|C075|model_change_old_checks|81|passed|867|28|
|C076|fault_optional|82|passed|878|27|
|C077|fault_all_f0_f9|83|passed|1300|27|
|C078|fault_unknown|84|passed|671|26|
|C079|fault_duplicate|85|passed|833|28|
|C080|fault_nonarray|86|passed|1012|28|
|C081|fault_snapshot_original|87|passed|1132|31|
|C082|fault_snapshot_specialchars|88|passed|1026|32|
|C083|fault_model_switch|89|passed|1372|32|
|C084|fault_order_preserved|90|passed|1119|26|
|C085|fault_translation_notes|91|passed|817|25|
|C086|foreign_read|92|passed|799|25|
|C087|foreign_write|93|passed|800|25|
|C088|foreign_history_readonly|94|passed|799|24|
|C089|export_other_owner|95|passed|866|25|
|C090|operator_admin|96|passed|902|26|
|C091|csrf_invalid|97|passed|834|28|
|C092|stale_version|98|passed|933|31|
|C093|completed_lock|99|passed|1057|32|
|C094|correction_reason_required|100|passed|1329|30|
|C095|correction_audit|101|passed|1274|30|
|C096|language_en_export|102|passed|1071|30|
|C097|language_zh_export|103|passed|1207|35|
|C098|notes_reference_export|104|passed|1360|33|
|C099|photo_success_export|105|passed|1283|31|
|C100|photo_failure_retry|106|passed|1487|32|

Menu/branch coverage: login:alex, login:blair, login:admin, My Records/new record, account language, fault selector, BOM drawer, Current Record/reload, front-end validation, Administration/users, Administration/models, Administration/appearance, Administration/bom, CSV import form, CSV template, password dialog, SN History, model switch context reset, fault source detail/guides, foreign SN History, stale version recovery, reasoned admin correction/audit, Excel export en, Excel export zh, photos upload/retry, logout.

Machine-readable per-case requests/status codes, console diagnostics, assertions and screenshots are in BROWSER_RESULTS.json. Rejected direct API probes follow a separate legal UI baseline for each case; they do not replace browser creation.

Supplemental user-requested fault selections: C101 F5, C102 F0/F3/F8, C103 F2/F9 each passed as a separate real UI work order. Evidence: supplementary-browser/BROWSER_RESULTS.json. Combined: 103/103 passed, 103 independent baseline records plus 4 boundary work orders; database-qualified identities and 2878 assertions / 1458 actual requests are in BROWSER_AGGREGATE.json. The supplementary run also explicitly navigated My Records to Current Record and verified the saved SN.
