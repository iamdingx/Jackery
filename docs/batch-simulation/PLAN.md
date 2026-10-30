# 批量模拟计划

1. 只访问新的隔离demo+真实目录loopback服务；拒绝非localhost/127.0.0.1及live4310。
2. 预登记100条不同业务组合：40正向、20 BOM、15 SN/型号、10故障、10权限审计、5双语导出附件。每条先创建独立合法记录。
3. requests Session + CSRF串行执行；请求/实际状态/业务断言逐步保留。失败继续其余用例，不修生产代码、不触碰真实数据库。
4. 导出使用zipfile/ElementTree读取四表表头、行及值；照片使用已知有效PNG和失败重试。浏览器报告由独立runner提供；API不代称视觉验证。
5. 输出API_RESULTS.json、API_LOG.md、DEFECTS_API.md；以真实成功断言计数，不用预期充当实际。
