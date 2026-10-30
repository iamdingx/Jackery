# 手动选型及上传诊断更新

已发布到 `/opt/jackery/releases/70bd7b1-manual-model-20261030`。应用提交70bd7b1，指纹16d1dabf299234fa07bf52bceacac01d374210cba40f2c3dc1e7ef482ace2fab。原d0fa49c发布保留；现有systemd、Nginx与数据目录未改变。

更新复用upgrade-guidance.sh的哈希校验、短暂维护、备份、原子切换、健康验证和失败回退流程；脚本名不代表本轮仍在修改译文目录，本轮未改译文或BOM。

备份路径 `/var/backups/jackery/guidance-update-20261030T061314Z-2771751`；内层数据备份 `jackery-2026-10-30T06-13-14-755Z-2771796`。八张持久化业务/配置表逐表行数及哈希无变化。3张作业记录、2个账号及13条审计保留，照片数仍0；无模拟数据导入。

本地129单元/API + 31浏览器回归通过；Ubuntu隔离核心129/129通过。公网health正常，登录字标Jackery，静态资源哈希匹配。完整证据与图片上传验证边界见docs/MODEL_ENTRY_UPLOAD_REPORT.md及docs/model-entry目录。

上传原故障仍待真实重试：422/413/409现会在通用失败提示之后显示真实错误码/原因；日志只写拒绝状态、代码和静态校验文案，不写文件内容、原文件名或凭据。没有放宽图片校验，没有重置生产密码。
