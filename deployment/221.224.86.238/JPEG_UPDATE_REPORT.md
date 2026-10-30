# JPEG上传兼容更新

已部署13940d5，当前 `/opt/jackery/releases/13940d5-jpeg-upload-20261030`，前版 `/opt/jackery/releases/70bd7b1-manual-model-20261030` 保留。发布校验、维护、备份、切换与失败回退流程复用现有upgrade-guidance.sh；没有数据库迁移。

备份 `/var/backups/jackery/guidance-update-20261030T062452Z-2773376`，内层数据备份jackery-2026-10-30T06-24-53-057Z-2773422。records/photos/users/models/bom/model_knowledge/meta/audits八表逐表哈希无变化。现有业务数据与照片未被测试修改；没有重置生产密码。

本地163/163通过，Ubuntu核心131/131通过；从正式release导入代码、使用隔离测试库执行JPEG上传/读取201，原字节相等、MIME/nosniff与匿名401通过。公网health200。详细根因、API契约与原图验证边界见docs/JPEG_UPLOAD_FIX_REPORT.md；机器证据见docs/jpeg-upload目录。

回退方式不变：维护停服后将current指向前版、启动并核验health，保留现有数据库。回退会重新出现过严的JPEG尾部校验，不应无故回退。
