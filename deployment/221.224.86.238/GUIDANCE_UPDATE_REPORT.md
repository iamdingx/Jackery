# 全部中文来源指导翻译：生产更新记录

2026-10-30 已发布。源应用提交 `d0fa49c`，验证指纹 `05226c66c698f41af8ce23a23091fe848e642f61850c89d769dfa3d13e4ae5d3`。此前DEPLOYMENT_REPORT.md为首次发布历史，本报告记录后续更新。

新目录 `/opt/jackery/releases/d0fa49c-guidance-en-20261030`，旧目录 `/opt/jackery/releases/abb8df9-84b855ad13e8` 保留。`/opt/jackery/current`已切换，现有systemd/Nginx运行配置不变。运行包SHA256：`5faa7d2ea86ad543d26dc78c653840dfd0992a91655bd80c9e4df142bb948eb1`；服务器逐文件SHA256SUMS验证通过。

备份 `/var/backups/jackery/guidance-update-20261030T044711Z-2768343` 包含原配置、数据备份及更新前后状态摘要。正式业务SQLite继续使用 `/var/lib/jackery/huabao.sqlite`。短时503维护期间停止应用、备份、切换、健康验证后恢复入口；失败自动回旧程序及代理配置，不自动替换数据库。

八表records/photos/users/models/bom/model_knowledge/meta/audits更新前后行数和SHA256均一致。分别为0/0/1/9/404/9/2/0行，没有导入测试工单，没有更改生产密码或BOM启用状态/标准量。

Ubuntu实际运行同版本源码核心回归129/129通过，0失败/跳过/取消；日志 `/home/sagacity/jackery-guidance-linux-core.log`。生产库只读运行发布版译文模块核验9型号、65唯一译文/来源别名、371处来源字段及90处原空解决方案。生产元数据仍为原中文；英文由本地派生词典补齐。

公网 `/api/health` 返回200及 `{ok:true,version:"1.0.0",demo:false}`。app.js/styles.css/state.js均200并与157项本地回归通过版本SHA256一致。

验收限制：已授权保存的初始账号密码在公网返回401。只读比较发现本机文件与服务器初始文件一致，但该密码已不匹配当前用户密码哈希。没有尝试重置、绕过登录或写生产测试工单；生产登录后验收未完成。使用实际目录的隔离浏览器验证通过，包括截图、9型号API、371处英文、90空方案、英文上中文下、草稿语言切换与1366/1536视口。详见docs/guidance-translation/SERVER_ACCEPTANCE.json及ISOLATED_BROWSER_ACCEPTANCE.json。

若需要回退：先安排维护并停止服务，将current软链接指回上述旧目录，启动并核验health。配置无需变更；严禁直接覆盖现有数据库。当前新版本未引入数据库结构迁移。
