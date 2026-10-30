# 人工核对文案发布

## PRECHECK

用户核对表7条修改与950条原文/编号一致性验证完成。生产代码变更仅6个界面中文键及AWP中文标签，保持原文件换行；英文和业务代码不变。133核心/API和34真实浏览器回归全过，截图检查完成。运行时、依赖、数据库结构不变，逐文件SHA256清单已随运行包校验。

## DEPLOY

2026-10-30 20:44:31（中国时间）发布提交38996b1，release为`/opt/jackery/releases/38996b1-reviewed-copy-20261030`。采用既有备份/切换/自动失败回退脚本。备份目录`/var/backups/jackery/guidance-update-20261030T124430Z-2794008`，包含业务库、照片及私有服务/代理配置；不向本机导出凭据或业务数据。

八张持久表升级前后哈希一致，6工单、5照片、3账号、9型号、404BOM、9知识配置、2元数据、31审计保持。没有重写历史、密码或网络配置。Windows宿主机800到Ubuntu80由用户先行增加，本次沿用。

## VERIFY

通过公网800端口直连：首页200、health200且demo=false，app.js/styles.css/state.js哈希与167项通过的精确源码一致。未进行生产账号登录或写入测试单；完整中英文/WFR/导出交互在隔离目录执行。机器证据见`docs/reviewed-copy`。

服务器Ubuntu/Node24.22.2在新建独立目录执行核心133/133通过，0失败/跳过/取消，日志`/home/sagacity/jackery-copy-linux-core-38996b1.log`。只读导入当前正式程序枚举确认awp/wfr/AWP/待料，未读取或更改正式工单。

## ROLLBACK

旧release`/opt/jackery/releases/32ab97e-left-column-20261030`完整保留。如需程序恢复，将current原子指向旧目录并重启jackery.service，再通过800入口验证；不替换业务数据库、不改Windows端口映射。本轮未执行回退。
