# Jackery 英文指导翻译校验报告

日期：2026-10-30。版本：`jackery-guidance-en-20261030`。

## 范围与交付

- 源目录：`catalogs/jackery-eu-20261030.json`；SHA-256：`06fe649163e90088c8f1c6ba47f995c990cb8324525bf17b907e8cf2ea8aff44`。
- 翻译层：`catalogs/jackery-guidance-translations.json`，schemaVersion 为 1，按完整中文字符串精确去重。
- 人工翻译全部 9 个产品目录中 checkItems、faultCodes、repairGuides、notices 的非空中文且原英文为空的字段：共 371 处，49 个唯一字符串。其中含 5 份完整维修表。
- 另提供 16 个用户可见来源文件名/工作表名的英文显示别名；总计 65 个条目。别名的 textZh 仍是精确原文件名或工作表名，源 file、sheet、relativePath、sha256 未变更。
- BOM 物料描述不属于本指导翻译层；不改中文、SKU、物料码、型号、故障码、原件或数据库。翻译为人工编写，无外部翻译服务。

## 覆盖校验

| 产品目录 | 需补英文的源字段 | 已覆盖 |
| --- | ---: | ---: |
| `e1000pro-default` | 41 | 41 |
| `e1000v2-original` | 41 | 41 |
| `e1000v2-costdown` | 41 | 41 |
| `e1000-default` | 40 | 40 |
| `e2000plus-a` | 41 | 41 |
| `e2000plus-b` | 41 | 41 |
| `e2000pro-default` | 42 | 42 |
| `e2000v2-original` | 42 | 42 |
| `e2000v2-costdown` | 42 | 42 |

全部需翻译字段覆盖率为 100%。原有非空英文字段 0 处保留优先级；翻译层只提供缺失英文的候选值。空中文 solutionZh 共 90 处，源文未提供解决方案，仍保持空值，未从维修表或相邻故障行推断补写。

## 结构与语义检查

- 所有 textZh 与源字符串逐字匹配；五份维修表保留原换行、五列分隔符、空单元格和 `/` 占位行。合并单元格未补齐、未映射成特定 F 故障码。
- 英文无汉字；源中数字和 ASCII 标识符均校验保留，包括 AC、DC、USB、LED、BMS、OK、4 个 USB 端口和约 10 分钟。
- F0 为 `BMS Communication Fault`；说明为 `Communication fault between the BMS and the mainboard`。
- `未接入AC输入` 明确译为 `With no AC input connected`；`如正常`、`不正常则`、`如无输出`、`如不良`、`如OK则` 的条件和否定语义保留。
- AC 无法启动表中两条原文止于“如OK则替换”，英文同样止于 `if OK, substitute`；不将相邻更换部件栏擅自补入句子。
- F6 原文“市电输入过/欠”未写完整限定，英文保留 `mains input over/under` 的有限表达，未增补电压或阈值。其余“标准范围”“最大功率”亦未补规格数值。
- USB/AC 无输出、指示灯亮/不亮、主板/车充板分支按各自源行翻译；未添加替换料、拆机步骤或源文没有的额外操作。

## 可重复验证

```powershell
python scripts/build-guidance-translations.py --check
```

脚本验证覆盖率、精确源字符串去重、无汉字英文、数字和源 ASCII 标识符、逐行分隔符与空单元格，并比较生成 JSON/报告与磁盘文件。普通运行只重建这两个交付文件，不修改源目录。

此报告验证翻译覆盖和源文保真，不构成维修操作的技术认证；本次未进行实机维修验证。
