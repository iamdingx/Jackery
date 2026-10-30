# 现表字段映射核查

v0.3 §2.2 保留原字段名。本轮用户明确要求参考字段展示和四表导出，因此以可选原值字符串承接，不扩展为仓库/审批/自动翻译功能。未执行真实飞书导入，不声称核对过全部196条记录或原字段类型。

| 原字段 | 文档英文 | 实现/存储 | 页面及导出核查 |
|---|---|---|---|
| SN | Serial Number | sn；独立id/workOrder | 录入、精确历史，汇总/明细SN；重复SN独立单 |
| 原始照片 | Evidence Photos | photos关联记录，原始文件 | 选填、缩略图、保护原图；Photo Index链接 |
| 外观描述 | Appearance Notes | appearanceNotes | 原文输入/保存/导出，不翻译覆盖 |
| 问题描述 | Issue Notes | issueNotes | 独立原文，不由检查清单替代 |
| 外观描述-翻译 | Translated Appearance Notes | translatedAppearanceNotes | 手工独立字段；原文空时为空 |
| 问题描述-翻译 | Translated Issue Notes | translatedIssueNotes | 手工独立字段；不调用翻译接口 |
| 机器挑货栈板编码 | Source Pallet | sourcePallet | 原值参考，不触发移库 |
| 存放栈板码 | Storage Pallet | storagePallet | 原值参考，不触发库存 |
| 作业时间 | Work Date | workDate，独立createdAt/updatedAt | 闰日/非法日期、历史业务日期与UTC系统时间分开验证 |
| 翻新结果 | Outcome | outcome/outcomeGroup | 七项互斥；原代码及英文/中文标签导出 |
| 机器产品简称 | Model | modelId/modelSnapshot双语名称 | 新单当前目录，历史快照保留 |
| SKU | Product SKU | productSku | 顶部只读参考，绝不作为耗料SKU |
| 入库SKU(1-like new 2-Good 3-accepteble) | Receiving SKU | receivingSku | 原码只读；不按等级生成SKU，汇总原值 |
| 产品名称校验（华宝） | Product Name Verification | productNameVerification | 只读参考，无校验/审批接口 |
| SKU校验（华宝确认） | SKU Verification | skuVerification | 只读参考，不伪造确认结果 |
| 分拣后SKU | Post-Sort SKU | postSortSku | 只读原码，区别Product/Part SKU |
| 入库单号 | Receiving Order No. | receivingOrderNo | 原值参考，不创建入库单 |
| 入库单状态 | Receiving Status | receivingStatus | 原值参考，不驱动仓库状态 |
| SN重复判断 | SN History / Duplicate Indicator | 精确SN历史查询派生，不维护另一份可失真的历史列表 | 自动提示、View History，按workOrder关联多次作业；四表保留独立单号/SN。未迁移原飞书公式或声称复现其公式 |
| 父记录 | Parent Record | parentRecord | 只读来源关系原文；不自动关联生成工单 |
| 文本 9 | Unspecified Text Field | unspecifiedTextField | 标签不改业务含义，原值只读及汇总导出 |

耗用 Part SKU 来自型号BOM的 materials[].sku，与上述所有整机/入库/分拣SKU不同。API测试验证原值、英文描述检索及特殊SKU不改写；浏览器验证参考原值只读；独立openpyxl验证表头、原中文和手工译文保留。新增技术Code列用于保留原存储枚举，非新增业务状态。
