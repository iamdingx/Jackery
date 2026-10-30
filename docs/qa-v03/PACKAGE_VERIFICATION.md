# 交付包复核（2026-10-30）

完整回归通过后，从 outputs/huabao_v1_v03_qa_20261030/Huabao_Service_V1.zip 解压到新的 artifacts/package-v03-qa 目录，实际验证：

- SHA256与清单一致，ZIP CRC通过，解压路径保持在指定目标内。
- 包内无业务数据库/照片、备份、初始管理员口令、node_modules、Git及测试临时目录。
- 从解压源码启动原生Node HTTP/SQLite，不安装任何运行时npm依赖；登录、静态前端入口正常。
- 新建样例单，复测Fail时ROK返回422指定英文；复测全Pass后结案，初检Fail仍保留。
- 原中文、手工英文译文、Receiving SKU/Parent Record原参考值保存，中文导出200。
- 同账号语言改ZH，关闭服务再重启：语言偏好和完整作业记录均持久化。
- Windows Start-Demo.cmd本地实际运行，原有4条记录升级前后原始JSON完全一致；未保存视觉检查测试单。

最终包将本报告/证明加入后重建；可执行代码与上述已启动的干净解压副本逐字比较，确保未换入未经验证源码。最终SHA256由交付目录内.sha256.json记录，避免自引用。

证据：PACKAGE_PROOF.json、LIVE_VERIFICATION.json、VERIFICATION_SUMMARY.json。源指纹对应97核心/20真实浏览器全量通过。

源码包不附带Node或浏览器安装程序。当前电脑启动器可找到兼容Node；其他电脑按README准备Node24。未自动对公网发布。
