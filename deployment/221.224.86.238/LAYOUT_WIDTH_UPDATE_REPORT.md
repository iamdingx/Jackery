# 左列布局更正发布

2026-10-30 17:04:20（中国时间）发布应用提交`32ab97e`，正式release为`/opt/jackery/releases/32ab97e-left-column-20261030`。Functional Checks下方并排两块备注，照片位于其下，三者均不超过功能检查列宽；物料耗用保留右列。本轮没有应用翻译修改。

## PRECHECK

本地133项核心/API和33项浏览器回归全过，三个桌面视口边界断言及截图检查完成。运行包逐文件SHA256校验通过；包指纹、完整测试指纹和源提交见`docs/layout-width-correction/DEPLOYMENT_RECEIPT.json`。运行时仍为服务器私有Node24.22.2；无依赖变更、数据库迁移或容器变更。

## DEPLOY

使用既有受控升级脚本，先备份业务库、照片及私有服务/代理配置，再原子切换程序目录并恢复代理。备份根目录为`/var/backups/jackery/guidance-update-20261030T090419Z-2788159`。升级前后八张业务/配置表逐表哈希完全一致，保留6笔工单、5张照片、3账号、9型号、404BOM、9知识配置、2元数据、31审计。

## VERIFY

公网health200且demo=false，app.js、styles.css、state.js与本地已通过166项测试的版本逐字节SHA256一致。未使用或重置生产登录口令；完整交互和布局验证在隔离目录执行，不向正式库写入仿真数据。机器证据见`docs/layout-width-correction`。

上传完整源码包后，在服务器新建独立临时验证目录，以实际Ubuntu/Node24.22.2运行全部133项核心/API测试，133/133通过，0失败/跳过/取消。日志为`/home/sagacity/jackery-layout-linux-core-32ab97e.log`，测试不使用正式数据目录。

## ROLLBACK

上一版`/opt/jackery/releases/df6b4c9-fixed-panels-20261030`完整保留。发生程序故障时将`/opt/jackery/current`原子指向上一版并重启jackery.service，再验证健康；无须恢复或替换业务库。本轮未执行回退。

Excel对照表在本地独立交付目录，涵盖950条，未将正式配置导出文件或用户待填写的工作簿推入公开仓库。用户返还填写结果前不更改系统中英文。
