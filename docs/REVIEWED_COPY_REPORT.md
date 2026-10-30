# 人工核对文案更新

用户完成原950条对照表核对并授权更新。源工作簿SHA256为`c9631aa9e4562d67d064c413c43267f56577ed86a331e06dc470e48d6147f5e9`。只读核验确认950个稳定编号完整、原中英文列与生成时清单一致，修改栏共7行，无新增英文修改。原工作簿不改写，私有artifacts保留本轮输入副本和来源映射。

| 核对编号 | 英文键/选项 | 原中文 | 已确认中文 |
|---|---|---|---|
| UI-C3AB669B6F | AWP | AWP | 待料 |
| UI-266D102D88 | My Records | 我的作业 | 我的记录 |
| UI-C23B60C0E1 | All Records | 全部作业 | 所有记录 |
| UI-6E2F446EC0 | Atomic import: all rows must be valid; existing or duplicate SKUs are rejected. | 原子导入：全部行通过才导入，拒绝已有或重复 SKU。 | 全部通过才导入，拒绝已有或重复 SKU。 |
| UI-BF33914AF2 | Work Order | 作业单号 | 工单号 |
| UI-DB1B65F8B5 | Work Record | 作业单 | 工单记录 |
| OPT-EFD8CAB291 | AWP / awp | AWP | 待料 |

应用范围为public/app.js的6个中文映射及src/domain.js的AWP中文标签。英文、枚举代码awp、分组wfr、检验/锁定/权限规则、BOM数量、自由备注、原始来源及历史快照不变。结果中文导出按当前枚举显示待料；工作簿报表字段页未填任何建议，故原作业单号表头保持。无数据库迁移或正式业务行改写。

新增真实浏览器回归覆盖管理员所有记录、BOM导入提示、作业员我的记录、工单标题/编号、WFR待料选择与摘要、带Fail检验保存进度、原备注及状态/结果代码保留、中英文往返和Excel导出中文/英文结果值。全量133核心/API及34浏览器通过，0失败/跳过/取消；机器证据见reviewed-copy/VERIFICATION_SUMMARY.json。专项截图位于忽略的artifacts/reviewed-copy。

正式入口已由用户在宿主机增加800转发，发布验证使用http://221.224.86.238:800/。不修改Windows或Ubuntu网络、端口映射和账号。发布与回退机器证据另附本目录。没有生产当前登录口令，因此不使用/重置密码，不在正式库写测试工单；完整交互使用隔离数据验证。
