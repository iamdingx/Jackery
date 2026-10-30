# 测试执行日志（逐条场景）

本表基于实际执行产物汇总，全部测试使用隔离库；不代表真实飞书数据全量审计。原始API分步日志见execution-api.json，核心及浏览器原始结果见core-results.txt、browser-results.txt。

| 场景 | 预期 | 实际现象 | 证据 | 判定 |
|---|---|---|---|---|
| M1.01 | 新建→SN→Model | 201独立单；结果空；按型号3个检查，初复检默认Not Tested | v03-deep 模块1 | 符合 |
| M1.02 | 英文/SKU搜索、多选、填写数量、加入 | 真实820项样例BOM；跨页/关键词保留待选和2.5等数量；一键加入2行 | e2e + v03-ui | 符合 |
| M1.03 | 重复SKU不加行，只改已有行 | 重复DTO422；界面指定提示并定位现有数量3.25，行数不变，不静默累加 | AC-06/07 + v03-ui | 符合 |
| M1.04 | 初检/复测Pass/Fail/Not Tested独立 | 18个radio，初检AC Fail；复测全Pass后结案，初检Fail不覆盖 | inspection contract + 浏览器 | 符合 |
| M1.05 | 原文/译文独立 | 原中文、手工英文不同字段保存、重载、切语言、导出完整 | v03-backend/state/ui | 符合 |
| M1.06 | 照片选填、成功/失败明确 | 无照片可结案；503无照片行；重试保留文件成功加载真实图片 | AC-08 + v03-interactions | 符合 |
| M1.07 | WFR保存后续填 | 连续3次AWP/Needs Analysis保存，id/单号/检查/耗料保留；界面本人Resume | v03-deep + v03-interactions | 符合 |
| M1.08 | ROK复测全Pass | Fail/Not Tested返回422指定英文；全Pass200；管理员不能绕过 | v03-backend + inspection contract | 符合 |
| M1.09 | SCRAP原因必填 | 空白422指定提示；中英文原因后200 | AC-12 + v03-ui | 符合 |
| M1.10 | Complete锁定 | 所有编辑/物料/检查/图片普通写入受限；浏览器disabled，PUT403 | API/AC-14 + e2e | 符合 |
| M1.11 | 同SN历史与本人续填 | 同SN三张独立单，外国历史精确200普通403，无编辑入口；本人Resume同单 | AC-02/03 + v03-ui | 符合 |
| M1.12 | 四表与双语表头完整 | EN/ZH各4表、7条汇总/42检查行；原文与译文保留；他人同SN不出现在本人导出 | v03-deep + openpyxl | 符合 |
| M2.01 | 默认EN与系统文案 | 新账号en；核心标签/七结果/三检查状态和六句提示逐字断言；照片选择自有英文控件 | v03-backend + v03-ui | 符合 |
| M2.02 | 切语言不丢草稿/检查/耗料/结果/原文 | 备注/手工译文、初复检、ROK/WFR、照片文件、2.5/3.25待选数量保留；账号偏好隔离 | e2e + v03-ui + review-editor-state | 符合 |
| M2.03 | 英文缺失警告 | 真实旧BOM缺descriptionEn仍搜索200；界面显示English description missing与Original，未编造译文 | v03-backend + v03-ui | 符合 |
| M2.04 | 六条指定提示 | SN找到、BOM无匹配、重复物料、ROK拦截、SCRAP原因、上传失败均按原句断言 | v03-ui/interactions + API | 符合 |
| M2.05 | 长英文不截断 | 长AC检查名称可换行；1366/1536/1680无整页横向溢出，Acceptable/Needs Analysis卡片无截断 | v03-interactions + 截图 | 符合 |
| M2.06 | 枚举严格及缩写 | Like New/Good/Acceptable/ROK/SCRAP/AWP/Needs Analysis单组；Not Tested/Pass/Fail；代码不变 | v03-state/ui + e2e | 符合 |
| M3.01 | EN2同页、关闭恢复 | 页面不跳转且保留原输入；Cancel/Close/Esc拒绝放弃保留待选。绝对不遮挡与文档冲突，见待澄清 | v03-ui + 文档§6 | 符合文档；遮挡文字待澄清 |
| M3.02 | SKU/英文描述搜索 | 特殊编码a-B_09(1)-ß精确不变；Distinct connector英文命中；旧请求不覆盖新关键词 | v03-deep + v03-ui异步场景 | 符合 |
| M3.03 | 多选/数量/批量加入 | 跨搜索/页保留Map与数量；默认1，2.125保存；0/负数/四位小数/越界拒绝 | e2e + AC-06/07 + v03-deep | 符合 |
| M3.04 | Product/Part SKU分开 | Product SKU disabled参考；Part SKU来自BOM，特殊编码逐字保留且不等于整机SKU | v03-ui + v03-deep | 符合 |
| M3.05 | 旧仓库/校验信息只参考 | 8项原参考字段界面disabled且原值保留；不新增入库/审批路由/实体；Parent不生成单 | v03-interactions + v03-backend | 符合 |
| M3.06 | 文本9原样 | Unspecified Text Field标签、原值文本9、API往返和汇总导出均保留 | FIELD_MAPPING + 浏览器/导出 | 符合 |
| M4.01 | 重复SN提示且可新建 | 自动找到提示；同SN成功新建独立单号；他人只读，禁止部分SN枚举 | v03-ui + AC-02/03 | 符合 |
| M4.02 | 管理员中英原因更正 | 核对原文/checked source入审计前后值，原owner不变；空原因422 | v03-interactions + AC-14/15 | 符合 |
| M4.03 | WFR多次续填不锁 | 反复save保留wfr，界面不显示完成按钮；本人从历史Resume同id | v03-deep + v03-ui | 符合 |
| M4.04 | 锁定后View-only | Completed与View-only明确，普通编辑403，控件disabled；管理员显式更正且复验门禁 | e2e + inspection contract | 符合 |
| M4.05 | Parent Record只展示 | 原关联文本只读；创建只增加指定单，不自动生成关联单 | v03-backend + v03-deep | 符合 |
| M5.01 | 长备注/中英文混合 | 10000字符中A混合逐字保存；10001明确422、不写入 | v03-deep 模块5 | 符合 |
| M5.02 | 图片非法/大文件 | SVG伪PNG422；8MiB+1接口413、前端拦截；失败不伪成功，重试有效PNG可加载 | images/API + v03-interactions | 符合 |
| M5.03 | 空BOM | 真实空BOM型号total0；浏览器无匹配显示指定英文，不允许自由选料 | v03-deep + v03-ui | 符合 |
| M5.04 | 全部现表字段对应 | 19项要求＋文档2种校验参考逐项映射；SN History为精确派生查询，不迁移原公式；见FIELD_MAPPING | FIELD_MAPPING + API/浏览器/openpyxl | 符合 |
| M5.05 | Work Date与系统时间 | 2024-02-29保存独立，2024-02-30拒绝；createdAt/updatedAt独立UTC且不改业务日期 | v03-deep 模块5 | 符合 |
