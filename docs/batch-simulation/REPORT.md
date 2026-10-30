# Jackery V1 BOM双语改版与大批量仿真验收报告

日期：2026-10-30。唯一业务基准：[CURRENT_RULES.md](../CURRENT_RULES.md)、[前次验收报告及本轮补充](../jackery-release/REPORT.md)。本轮用户明确授权BOM中文翻译和上下双语，覆盖旧版BOM仅提示缺英文的展示状态。全程只在本地执行，没有公网发布或真实多用户并发压力测试。

## 1. 仿真总方案与隔离

- 主清单100笔：40正向、20 BOM边界、15 SN/型号、10故障码、10权限/审计、5双语/导出/附件。追加3笔用户指定故障组合，合计103个场景：F5单选、F0+F3+F8、F2+F9。43条正向输入按型号/语言/数量/检验/故障组合核对，43个业务输入签名互异，不是仅更换SN凑数。
- 使用新建 `tests/.tmp/` 数据库和独立浏览器上下文，admin/alex/blair仅为本地测试账号。每笔先创建自己的合法工单，负向操作另发请求；被拒绝不是跳过创建工单。正常业务API均真实执行，前端操作和直接API负向探测分别记录。
- API批次与浏览器批次串行执行；脚本内逐笔串行。基础工单、辅助边界工单、不同数据库的记录ID分别统计，跨库用“数据库路径+ID”标识，不能按数字ID去重。
- `start-simulation.mjs`只能新建临时库，固定监听127.0.0.1；requests脚本拒绝非loopback及当前业务端口4310，且要求demo模式。每轮测试应从新临时库开始，避免此前的测试夹具被误认为源目录数据。
- F0特殊字符及缺英文/constructor物料均为明确标识的隔离夹具，不更改原PPT、源BOM或正式目录。源数据始终为9个版本、404候选、261启用、143挂起；夹具不是额外源物料。
- P0：主链阻断、权限失控、上限失效、丢数据；P1：保存、展示、导出或型号关联严重错误；P2：次要交互问题。测试脚本缺步、基础设施失败与源资料问题单列，不伪装成业务缺陷。

完整固定字段用例表：[CASES.md](./CASES.md)（103行）；机器输入：[CASES.json](./CASES.json)。包含ID、类别、账号、SN、型号ID/版本、故障、真实SKU和数量、检验状态、Outcome、报废原因、路径、预期及断言。计划modelId在执行时按catalogKey解析。

## 2. BOM修改及证据

242条完整中文描述对应404行物料，现均有独立英文译文，英文在上、中文原文在下。抽屉、待添加清单、耗用清单、管理列表在EN/ZH下均保持同样顺序。原中文、SKU、型号/规格代码、数字、数量上限和启用状态未改写。

示例：

> Car Charging PCBA | HTE078-C-A3 (EU/KR/UK/AU) RoHS REACH
>
> 车充板-PCBA | HTE078-C-A3（欧韩英澳） RoHS REACH

译文以完整原描述精确匹配，保存在独立本地目录，不调用外部翻译。人工已有英文优先；未知原文仍明确提示缺英文并保留原文。英文可搜索，新选物料保存英文/中文快照；旧记录空英文、中文、故障快照及旧final存档均不改写。管理员后续主动保存BOM定义可持久化当前显示英文，但不会改历史作业快照。

翻译验证：404/404覆盖、242唯一键、0空译文、0残留汉字、0数值差异、0源ASCII代码丢失。该检查证明文本保留，不等于供应商技术批准。专有供应商名的拼音和源规格疑义见[翻译报告](./TRANSLATION_REPORT.md)。

当前4310界面也已实测示例原文和英文完全一致、上下顺序正确，未保存新业务工单：[LIVE_UI_SMOKE.json](./LIVE_UI_SMOKE.json)、[截图](./screenshots/live-car-charging-bilingual.png)。

## 3. 串行执行日志与最终结果

| 执行层 | 场景 | 通过 | 实际断言 | 实际HTTP请求 | 本批创建工单 |
|---|---:|---:|---:|---:|---:|
| requests最终R5业务清单 | 103 | 103 | 与下一行合计1684 | 与下一行合计817 | 与下一行合计108 |
| requests异常词典扩展 | 1 | 1 | 包括未知constructor回退、双语两行导出 | 已包含 | 已包含 |
| Playwright主轮R2及3个补充场景 | 103 | 103 | 2878 | 1458 | 107 |
| 既有与新增完整回归 | 123单元/API + 25浏览器 | 148 | 按各测试内部断言 | 不混入上面计数 | 全新测试夹具 |

API有104个独立baseline（103业务+1扩展）、4个辅助工单，共108。浏览器有103个独立UI baseline、4个辅助工单，共107。最后通过的两条批量链路共创建215条测试工单，4562项实际断言，2275次HTTP请求。此前失败或中间回归批次另外保留，不混入最终通过数。

逐笔顺序记录（每一笔的实际status、结果、断言与工单ID）：

- [API_LOG.md](./API_LOG.md)、[API_RESULTS.json](./API_RESULTS.json)。后者单列manifestCases与extensionCases，不把扩展冒充业务清单。
- [BROWSER_LOG.md](./BROWSER_LOG.md)、[BROWSER_RESULTS.json](./BROWSER_RESULTS.json)。主100笔均实际UI新建/保存/重载；非法JSON类型、越权等另用真实API探测。
- [3笔补充浏览器日志](./supplementary-browser/BROWSER_LOG.md)、[合并汇总](./BROWSER_AGGREGATE.json)。103个场景全部通过，0未处理页面异常。
- [完整回归指纹及计数](./VERIFICATION_SUMMARY.json)。0失败、0跳过、0取消。

代表性实际链路：扫码SN→人工型号/版本→故障多选→BOM搜索和数量→单次检验单选→保存WFR→续填→ROK含Fail或翻新全Pass结案→锁定403→管理员带原因更正及审计。负向覆盖超量、非整数、0/负数/字符串/null、重复料、他型号料、挂起料、缺标准量、非法/重复故障码、空SN、无效型号、旧version、CSRF及他人记录权限。预期403/409/422均是正确拦截，不记为接口缺陷。

菜单覆盖My Records、Current Record、SN History、Administration的用户/型号/外观/BOM、CSV表单/模板、账号密码对话框、语言切换、导出、登录与登出。已有完整回归另外实际验证密码变更/重登录、CSV成功导入、大图/非法格式、网络延迟隔离等流程，未用打开菜单代替这些业务断言。

四表导出由zipfile/ElementTree实际解析。逐行核对物料EN/ZH、SKU、qty、standardQty；核对故障代码和原文快照、备注/手工译文、旧字段、功能单次结果、图片原名及授权URL。已成功验证含已翻译物料和未知英文夹具两行的EN/ZH导出。图片网络失败仅C100明确注入一次，随后真实上传成功；不以模拟成功响应替代真实保存。

## 4. 缺陷表、修复代码与回归闭环

| ID/等级 | 场景与预期 | 实际/根因 | 已实施修复 | 回归断言与结果 |
|---|---|---|---|---|
| SIM-01 / P1 | C060换到新型号，允许其合法新物料及故障，禁止旧型号复用 | 合法物料被422拒；`!modelChanged && ...`返回false，`??`把false当已有快照；故障prior同类问题 | 接口域逻辑改为`modelChanged ? undefined : previous...find(...)`，两处同时修，不新增业务枚举 | 原始R2失败保留；单测2条RED→GREEN；C060恢复完整路径：17拒18、25允25、换型新物料/新故障原文/检查清空均通过，R4/R5及浏览器R2通过 |
| SIM-02 / P1（开发期边界） | 未知翻译原文应缺英文回退，不得读对象原型 | `constructor`会读取继承属性而非译文；开发单测捕获 | 前后端字典读取使用Object.hasOwn；不改原文 | 单测RED→GREEN；EXT-PROTOTYPE真实GET200、missingEnglish=true、EN空、原文不变；两语言各两行导出精确通过 |

无遗留未修复P0/P1。检查得到的代码问题已实际修改，不只给建议。关键代码：`src/domain.js`、`src/bom-translations.js`、`server.js`、`public/app.js`；新增回归在`tests/model-change-regression.test.js`、`tests/bom-translations.test.js`、`tests/bom-bilingual.test.mjs`。独立只读审查未发现新增P0/P1，并复核旧快照保留及导出中英文一致。

测试脚本与证据问题单列：

| 项目 | 实际情况 | 处理 |
|---|---|---|
| API早期C060预置假设 | 随机挑的共享料有相同上限，不能证明17/25 | 固定已核验螺丝08-1000-100253，另建独立工单验证 |
| API早期证据写入 | Windows OSError22导致首轮第66笔后中断 | 原子写入/重试；R1原始文件已被下一轮覆盖，仅保有概要，不声称完整证据。R2/R3/R4完整原证据已外置保留 |
| Browser R1 C081 | 未先选故障码就读空快照 | 实际UI选择F0后保存再逐字段对照；R2重新全跑通过 |
| Browser R1 C084 | 动态:checked集合逐项取消造成索引移动 | 采用稳定故障code定位取消；R2重新全跑通过 |

这些是仿真脚本问题，未把它们计作生产BUG；失败事实未删改为通过。详见[API缺陷日志](./DEFECTS_API.md)和[浏览器缺陷日志](./DEFECTS_BROWSER.md)，原始Browser R1证据保存在priorRuns。

## 5. 可执行批量回归

每轮开全新隔离库。窗口1：

```text
node scripts/start-simulation.mjs
```

它输出本轮baseUrl，窗口2将下例地址替换为该值：

```text
python -m pip install requests
python scripts/simulate-orders.py --base-url http://127.0.0.1:16361 --prefix API-NEW --prototype-regression --output-dir artifacts/simulation-api-new
```

若环境已有requests无需安装。本次验证版本2.34.2；脚本使用Session、CSRF、超时及逐笔请求，不发送真实账号或业务数据到外部。相同服务器若已有本轮测试夹具，应重新建立新库，而非将夹具统计成源物料。

完成API后再执行浏览器批量（开发环境需Playwright和Edge；源码启动不需要测试依赖）：

```text
node scripts/simulate-orders-browser.mjs --prefix UI-NEW --output-dir artifacts/simulation-browser-new
```

浏览器脚本默认自行建立新库，串行运行清单103笔。支持`--only C101,C102,C103`补充回归，以及`--base-url`使用明确隔离服务。禁止把当前4310业务系统作为仿真目标。

完整回归：`node scripts/verify.mjs`；源码包构建：`node scripts/package.mjs`。所有源代码、脚本和本地译文目录均纳入验证指纹，修改后旧通过证明不能打包。

## 6. 数据保护、边界与验收结论

- 当前本地业务库仍4条记录、0照片，原始记录JSON和照片记录逐项相等；未混入仿真工单。机器证据：[LIVE_DATA_PRESERVATION.json](./LIVE_DATA_PRESERVATION.json)。新译文按只读方式加载，不重导入、不更改基础BOM批次摘要。
- 资料边界而非BUG：143行源状态挂起；E1000有25行缺标准量，只允许检验/故障记录而无耗用；E1000V2 Original和E2000plus A源矛盾保持不可选。不能为凑正向场景而启用这些配置。
- BOM翻译忠于源文，没有提供额外性能、替代料或合规认证证明；供应商名称拼音及技术疑义仍需业务核验。检查项目和故障方案的缺英文不在BOM翻译授权之外自动补写。
- 旧final仅作为不可编辑历史存档；新单和检验流程始终无作业后复测。
- 本次未验证公网、现场部署、真实多用户并发压力、供应商当前供货或资料技术有效性。

**本地仿真版本验收通过：103个清单场景分别完成API与真实浏览器验证；API另有1个异常边界扩展通过，148项完整回归通过。无开放P0/P1代码缺陷。** 源资料风险单列保留，不冒充已解决。最终交付包的干净首次启动与源码指纹核验另见PACKAGE_SMOKE.json。
