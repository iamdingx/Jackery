# Bluetooth与固定分区发布

应用df6b4c9已部署至 `/opt/jackery/releases/df6b4c9-fixed-panels-20261030`。旧版 `/opt/jackery/releases/13940d5-jpeg-upload-20261030` 保留。运行包SHA256 f58c07790fa32024b4d3418f31bb10ebbd2594513fc4b96a08b496b438d7b4b4，逐文件检查通过。

备份 `/var/backups/jackery/guidance-update-20261030T081521Z-2785423`。现有systemd/Nginx/数据库结构及账号权限不变，records/photos/users/models/bom/model_knowledge/meta/audits八表逐表哈希无变化。未完成单新清单只在用户实际保存时写入，有正常版本及before/after审计。

本地133+33=166项通过；Ubuntu核心133/133通过。生产只读核实9型号蓝牙，2笔未完成单适配、4笔已完成不改。公网健康及静态资源哈希通过。6笔工单、5张照片保持，测试没有写正式工单、没有重置密码。完整证据见docs/fixed-panels，需求及视觉报告见docs/FIXED_PANELS_REPORT.md。
