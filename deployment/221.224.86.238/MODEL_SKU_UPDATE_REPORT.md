# 型号Product SKU主数据更新及发布

PRECHECK：用户11行确认表已登记，正式库9个型号匹配，其中2项差异；171项本地回归通过。未创建缺来源E1000plus型号、未改Part SKU或BOM。API结构不变。

DATA UPDATE：2026-10-30 20:57:37（中国时间）用update-model-sku.sh暂停代理入口、停止应用、备份后，事务更正modelId4的空Product SKU至70-1000-EUO001，modelId5至21-0001-00037；新增一条来源meta回执。备份根目录/var/backups/jackery/model-sku-20261030T125737Z-2794985。严格比对所有模型只允许这两项productSku差异；工单/照片/用户/BOM/知识/审计/外观逐表哈希一致。9个型号ID、启用状态、404行物料及原标准量不变。

DEPLOY：20:57:59发布应用e2a4def到/opt/jackery/releases/e2a4def-model-sku-20261030。程序升级另有备份/var/backups/jackery/guidance-update-20261030T125758Z-2795064，其前后八张表哈希完全一致，未再写主数据。运行包SHA256和机器回执见docs/model-sku。没有改Windows/Ubuntu网络或账号。

VERIFY：800公网首页和health200、demo=false，静态资源哈希与171项通过版本一致。测试未向正式库写工单，未使用/重置生产口令。

正式库只读核对9/9型号Product SKU一致、ID1至9不变、启用7个、缺来源2个待配置。Ubuntu/Node24.22.2独立目录核心136/136通过，0失败/跳过/取消；日志/home/sagacity/jackery-sku-linux-core-e2a4def.log。

ROLLBACK：上一程序38996b1保留，可仅切回程序；原程序兼容更正后的SKU，无须回写数据。若本次主数据更新过程中校验失败，脚本只事务恢复原模型行和对应meta，不以整库备份覆盖业务。本轮未回退，用户确认后的主数据不应随普通程序回退而自动撤销。
