# API模拟失败与根因线索

以下按实际失败断言登记；API失败不自动等同生产缺陷，需区分测试前置、脚本问题和业务实现。

## 先前运行 API-R2-20261030 / C060：原始失败保留

- `PUT /api/records/129` expected 200, actual 422; body={'version': 2, 'modelId': 8, 'materials': [{'bomId': 1054, 'quantity': 25}]}; response={'error': {'code': 'VALIDATION', 'message': 'Material is outside the model BOM'}}
- P1实际业务缺陷：切换型号并同一请求加入新型号合法BOM被422拒绝。domain中 `old=!modelChanged && ...` 在切型号时为false，`old ?? current`保留false，因而拒绝合法新BOM；fault prior存在同类风险。C060保留完整换型+合法新材料+新型号故障snapshot+旧检查清空额外断言。本轮完整路径已通过，API修复回归闭环；原始失败证据仍保留。

本次实际运行未发现API断言失败；不覆盖浏览器视觉、现场部署或真实业务数据。
历史R1：第66笔后证据写入发生Windows OSError22；另C060曾比较两个相同上限版本，属于测试假设问题。R1原始JSON在保留要求到达前已被下一轮覆盖，只有工具输出/概要，不声称保有完整原始证据。后续写入增加重试，全部100笔执行完成；R2完整日志已外置保留。
