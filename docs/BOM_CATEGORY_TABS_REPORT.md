# BOM 顶部分类标签 · 实施与验收

用户确认方案 1，本轮先改系统布局，BOM 分类数据等待提供，禁止提前导入或推断。搜索框下新增全部、核心、非核心、包材四个标签及数量，右侧继续使用原有待选清单和数量输入；固定入口下的物料表独立滚动。

现有无分类物料在“全部”中正常选择，其他类别为空时明确提示待补充分类标注，不显示虚构示例或根据物料名称猜类别。本轮只读代码不修改 BOM、启用状态、单条上限、型号版本、作业数据及原始资料。分类示例仅在 tests/.tmp 独立仿真数据内。

## 接口兼容检查

| 项目 | 判定 |
| --- | --- |
| Contract summary | GET /api/models/:id/bom 新增可选 category=all、core、non_core、packaging；省略时默认 all。categoryCounts 为附加返回字段，包含 all、core、non_core、packaging、uncategorized；在搜索前按型号和原 active 权限计算。搜索及分类在分页前组合过滤。 |
| Consumers affected | public/app.js 的 BOM 抽屉；已知管理界面、测试和旧请求不传 category，保留原有结果。未知消费者需继续忽略附加字段。 |
| Breaking changes | 无；旧参数、items、total、page、pageSize、排序及默认过滤语义保留。显式非法 category 返回现有 422 VALIDATION。 |
| Compatibility risk | BACKWARD COMPATIBLE；物料 JSON 中 category 目前为空，只读识别预留值；正式导入字段映射不在本轮实现。 |
| Migration requirement | 无 schema migration，无数据回填，无导入、无新增写接口。 |
| Test requirement | 默认兼容、计数、不改 BOM JSON、跨页过滤、搜索交集、权限、型号隔离、双语、旧无分类数据、保留数量、去重、硬上限、桌面布局。 |
| Recommendation | 布局可独立发布，分类数据待用户提供新版 BOM；发布前后逐表哈希对比，证明没有借布局变更修改数据。 |

## 验证

新增 3 个 API 和 3 个真实浏览器用例，先观测到 6 项因缺少分类布局和筛选全部失败，再实现并验证通过。分类数据通过测试数据库预置，不使用生产物料、不通过正式导入流程、不用接口响应伪造无分类场景。

浏览器覆盖 1366×768 / 1536×864；验证横向不溢出、分类和底部确认可见，跨分类及语言保留数量，数量超过上限拦截，重复物料保持禁选；原有所有业务用例继续完整回归。最终完整结果见 bom-category-tabs/VERIFICATION_SUMMARY.json，截图见 artifacts/bom-categories（仅本地）。

完整回归：145 核心/API + 39 浏览器 = 184 项全部通过。当前状态：已发布并完成发布后验证；尚未导入任何 BOM 分类数据。

2026-11-02 13:26（Asia/Shanghai）部署至 http://221.224.86.238:800/。健康检查、3 份前端资源哈希、接口鉴权及 800 端口来源校验通过。发布前后 8 张持久表哈希一致（含 404 条 BOM），未执行分类回填或导入。回执见 bom-category-tabs/DEPLOYMENT_RECEIPT.json 与 PUBLIC_SMOKE.json。真实生产账号未用于登录/写单；交互在隔离浏览器及仿真数据库中验证。
