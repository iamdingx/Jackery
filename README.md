# 华宝翻新／维修记录系统 V1

电脑端网页，英文／中文切换，同页作业，EN2 BOM 宽抽屉多选，Refurbishment／Repair／WFR 三栏全局单选。记录耗用，不管理库存。

## 快速启动：先体验演示

1. 将完整 ZIP 解压到一个普通文件夹，不要直接在压缩包内运行。
2. Windows 双击 **Start-Demo.cmd**，保持启动窗口打开。
3. 浏览器打开 **http://127.0.0.1:4310**。

| 演示账号 | 密码 | 权限 |
|---|---|---|
| admin | HuabaoAdmin!2026 | 管理员：全部记录、基础资料、账号及更正 |
| alex | HuabaoAlex!2026 | 作业员：本人记录，精确 SN 历史只读 |
| blair | HuabaoBlair!2026 | 另一作业员，用于验证数据隔离 |

演示数据均明确标识 DEMO，包括 820 项型号 A BOM。试查 `DEMO-HISTORY-001` 查看他人历史，`DEMO-WFR-001` 可由 alex 继续填写。演示数据只存于 **data-demo/**，不得当作真实型号或正式 BOM。

## 运行环境

- **Node.js 24.10+，24.x 系列**；本次验证版本 **24.22.1**。
- 无运行时第三方 npm 依赖，无前端编译步骤，启动时**无需 npm install**。
- 启动脚本依次查找项目自带 runtime/node.exe（若存在）、当前电脑 Codex 自带 Node、PATH 中的 Node。当前工作电脑已有兼容运行时；其他电脑若没有 Node，安装官方 Node.js 24 后即可运行。
- Node.js 属于独立运行环境，源码交付包不包含浏览器或系统安装程序。

命令行：

```text
node server.js --demo
node server.js
```

macOS／Linux：安装 Node.js 24 后执行 `sh start.sh --demo` 或 `sh start.sh`。本次实际验证平台为 Windows，跨平台源码保留，但不声称已在其他系统实测。

## 正式使用

1. 停止演示服务（启动窗口按 Ctrl+C），双击 **Start.cmd**。
2. 普通模式存于 **data/**，首次生成随机管理员密码；本地读取 **data/first-run-accounts.json**，其中 `admin.username` 和 `admin.password` 为初始账号。该文件不在网页公开目录中，不要对外分享。
3. 管理员登录后修改自己的密码，为每个作业员建立独立账号。
4. 在 Administration 中维护正式型号与功能检查项目、外观选项、BOM，并导入真实英文物料描述。正式模式没有虚构业务目录，不会自动导入演示数据或飞书历史。
5. 使用正式 SN 试录并核对报表后开始业务。照片选填；未知 AWP 的内部定义仍按业务代码使用，不由系统猜测。

演示／正式模式的数据目录禁止混用，系统会校验模式。不要把 data-demo 改名冒充 data。

## BOM 导入

管理员进入 Administration → BOM，选择型号，下载 CSV 模板；也可将 UTF-8 CSV 内容粘贴到导入框。

```csv
sku,descriptionEn,descriptionZh,unit
PART-001,Control Board,控制板,pcs
PACK-001,Packing Box,包装盒,pcs
```

- 必填 SKU 和英文描述；相同型号中 SKU 唯一。名称中有逗号、换行或双引号时按标准 CSV 引号转义。
- 最多 5000 行；同次导入或已存在的重复 SKU 会报告行号，整批拒绝，不会静默去重或部分写入。
- 包材只要在该型号 BOM 内就按普通物料计耗，不另设通用耗材清单。
- 型号检查代码和英语标签应稳定；字典修改不改写已保存作业快照。

## 作业规则

- 新单结果初始为空。先保存后可由原作业员续填；同 SN 独立返修创建新作业单。
- 普通列表及导出仅本人；管理员全部。输入完整精确 SN 可只读查看该 SN 他人历史，不能修改或转交。
- 翻新：一份功能检查全部 Pass 后选 Like New／Good／Acceptable。
- 维修 ROK：Final Test 全部 Pass；原始失败初检保留。SCRAP 必填原因。
- WFR（AWP／Needs Analysis）：保存等待，保持未完成，不能当成已结案。
- 所耗物料从型号 BOM 选择，默认数量 1；重复选择不会自动多记；支持三位小数，无耗料也可完成。
- 完成后作业员只读；管理员更正需原因，并保留修改前后值和操作者。
- PNG／JPEG 图片选填，单张最多 8 MiB、40MP，每单最多 20 张；权限随记录，不生成公共图片链接。

## 导出

Export 生成一个 XLSX 文件，包含 **Work Summary、Functional Checks、Material Usage、Photo Index** 四表，按 Work Order 关联。图片以链接查看，打开时需要同系统账号权限。外部没有账号的人不会自动获得图片访问权。历史导出不会随之后更正自动变化。

系统对极端大型导出明确报错，不静默截断；详细上限见开发报告。未完成／WFR 状态保留，不混作已完成台数。

## 连接、端口与局域网

默认只监听本机 `127.0.0.1:4310`。需要局域网使用时由部署方设置环境变量，例如：

```text
set HOST=0.0.0.0
set PORT=4310
set PUBLIC_BASE_URL=http://192.168.1.50:4310
Start.cmd
```

PUBLIC_BASE_URL 必须设为实际稳定地址，使 Excel 图片链接可访问。浏览器使用同一个地址访问；不要随意更换源地址。正式跨网络访问应由部署方接入 HTTPS 反向代理，设置 HTTPS 的 PUBLIC_BASE_URL；本次不自动公网部署、不更改防火墙或账号共享权限。

端口已占用时不要终止其他软件，可将 PORT 改为另一个端口；PUBLIC_BASE_URL 同步修改。日期 Work Date 与系统 UTC 创建／更新时间分开；系统时间按浏览器本地显示。

## 备份与恢复

备份正式数据：

```text
node scripts/backup.mjs
```

演示数据：`node scripts/backup.mjs --demo`。脚本使用 SQLite 在线备份并复制原始照片到 backups/ 新目录，不删除或覆盖当前数据。备份目录包含业务数据，应按内部数据权限保存。

恢复时先停止服务，将当前 data 目录完整改名保留，再把备份内 huabao.sqlite 和 photos 复制到新的 data 目录；保持原模式，不从演示恢复为正式。初始管理员口令文件不属于备份必需项，账号及密码哈希已在数据库中。不要只复制运行中的 .sqlite 文件而忽略 WAL。

## 自测

核心单元／API／验收：`node --test tests/*.test.js`。

浏览器：开发环境安装 Playwright 1.62.1（仅测试依赖）并具备 Chromium／Edge 后执行 `node --test tests/e2e.test.mjs`。Windows 默认检测已安装 Edge；测试使用新临时配置，不使用日常登录配置。

完整回归：`node scripts/verify.mjs`。日志与结果 JSON 写到 artifacts/verification/，按当前源代码指纹验证，失败不打包。实际结果见 docs/TEST_REPORT.md。

受限沙箱若禁止 localhost 或浏览器进程，测试必须在允许本机网络的测试环境运行，不能把环境 EACCES 误认为业务通过或忽略浏览器测试。

## 项目结构与边界

- server.js：HTTP/API/静态入口。
- src/store.js、domain.js、export.js：SQLite、规则、业务导出。
- src/xlsx.js、zip.js、csv.js、images.js：纯文件处理。
- public/：无构建的中英文网页。
- tests/：单元、API、独立需求验收与真实浏览器 E2E。
- docs/：契约、计划、实施／测试报告、截图与业务依据。

V1 不包含库存、价格结算、飞书历史迁移、自动翻译、ERP/WMS/华宝接口、入库审批或离线同步。正式 BOM、功能清单及翻新等级标准仍由业务资料维护；演示内容不是华宝正式标准。
