# Jackery 翻新／维修记录系统 V1

电脑端网页，英文／中文切换，同页作业，EN2 BOM 宽抽屉多选，Refurbishment／Repair／WFR 三栏全局单选。记录耗用，不管理库存。

## 快速启动：先体验演示

1. 将完整 ZIP 解压到一个普通文件夹，不要直接在压缩包内运行。
2. Windows 双击 **Start-Demo.cmd**，保持启动窗口打开。
3. 浏览器打开 **http://127.0.0.1:4310**。

| 演示账号 | 密码 | 权限 |
|---|---|---|
| admin | JackeryAdmin!2026 | 管理员：全部记录、基础资料、账号及更正 |
| alex | JackeryAlex!2026 | 作业员：本人记录，精确 SN 历史只读 |
| blair | JackeryBlair!2026 | 另一作业员，用于验证数据隔离 |

启动会幂等加载随包的 **Jackery EU真实目录**：9个型号版本、404行物理候选，启用7个型号配置、261行物料，143行保留挂起不可选。原虚构DEMO型号及BOM停用，历史演示作业保留。演示账号与作业仅用于测试；真实目录不等于正式业务记录，演示数据仍存于 **data-demo/**。

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
4. 首次启动自动事务导入随包Jackery EU目录（幂等、不覆盖存量记录）。普通模式不生成虚构工单、样例目录或飞书历史；管理员在Administration核对基础资料，并提供经审核英文名称。
5. 使用正式 SN 试录并核对报表后开始业务。照片选填；未知 AWP 的内部定义仍按业务代码使用，不由系统猜测。

演示／正式模式的数据目录禁止混用，系统会校验模式。不要把 data-demo 改名冒充 data。

## BOM与故障知识导入

随包目录 `catalogs/jackery-eu-20261030.json` 来自27份原始资料：9份BOM、6份故障代码、6份常见故障、6份功能检查SOP。逐行保留源文件、行/页与SHA256。启动自动导入同批次一次；同批内容改变会报错，禁止静默覆盖。

需要显式导入时，先停止服务并备份，再运行：

```text
node scripts/backup.mjs --demo
node scripts/import-jackery-catalog.mjs --demo --report artifacts/import-report.json
```

正式目录去掉 `--demo`；也可使用 `--data-dir` 和 `--source` 指定位置。此脚本不会重置已存在自定义密码、不会改写存量工单；只将未修改的旧默认演示密码改为上表Jackery密码。普通模式的随机初始密码保持不变。

- SN扫码后人工选择型号及版本，BOM和故障知识按modelId关联。型号显示Original / Cost-down / Version A / Version B，避免版本混用。
- **标准用量是每条作业单、每种BOM物料的硬上限**，保存/WFR/结案/管理员更正同样校验。相同物料只有一行；续存更新实际耗量，不累加保存次数。原始pcs物料数量必须为整数；默认1，不能超过上限。
- 缺少标准量不补1。E1000的25行缺量；E1000V2原始版型号冲突、E2000plus A版停用冲突及个别源状态异常，合计143行已导入为挂起，不能选用。详见 `docs/jackery-release/SOURCE_REPORT.md`。
- BOM包材按物料计耗，整机根与软件不当作实物耗用（共排除10行）。不管理库存或自动入库。
- 英文物料/功能项/故障资料缺失时明确提示并显示来源中文，不自动生成翻译。F0–F9按型号提供；常见故障方案单独显示原表，不捏造F代码与方案的一一对应。
- 后续管理CSV模板为 `sku,descriptionEn,descriptionZh,unit,standardQty`，如 `PART-001,Control Board,控制板,pcs,1`。同型号SKU唯一，最多5000行，整批校验后写入。兼容历史4列表头，但Jackery源型号新增启用项必须有标准量。管理员BOM编辑提供标准量字段；检查清单仍为一行一项，源名称中的换行、竖线、反斜杠分别用 `\n`、`\p`、`\\`可逆显示，保存恢复原值。

## 作业规则

- 新单结果初始为空。先保存后可由原作业员续填；同 SN 独立返修创建新作业单。
- 普通列表及导出仅本人；管理员全部。输入完整精确 SN 可只读查看该 SN 他人历史，不能修改或转交。
- 当前规则：所有作业只记录一次检验，每项 Pass／Fail／Not Tested 单选点，默认未检查，取消作业后复测。见 docs/CURRENT_RULES.md。
- 翻新：本次检验全部 Pass 后选 Like New／Good／Acceptable。
- 维修 ROK：所有功能项已检验（Pass或Fail），保留发现的异常，不要求复测。SCRAP 必填原因。
- WFR（AWP／Needs Analysis）：保存等待，保持未完成，不能当成已结案。
- 所耗物料从当前型号BOM选择，默认1；重复选择定位已有行。真实目录按标准量硬限，pcs整数，无耗料可完成。历史未设标准的非目录物料保留三位小数兼容。
- 完成后作业员只读；管理员更正需原因，并保留修改前后值和操作者。
- PNG／JPEG 图片选填，单张最多 8 MiB、40MP，每单最多 20 张；权限随记录，不生成公共图片链接。

账号语言偏好保存在本账号，其他账号不继承。Translated Appearance Notes／Translated Issue Notes 是独立手工译文，不会自动生成；原文为空时译文保持为空。Reference Details功能块已移除；旧表SKU、校验、订单、父记录和文本9仍原样保存在存量记录及导出中。电脑常用尺寸1366×768及1536×864保持结果和保存按钮可见，长检查/物料列表局部滚动，手工译文和照片按需展开。

当前改版与真实导入报告见 docs/jackery-release/；docs/qa-v03/仅作旧版测试档案。

## 导出

Export 生成一个 XLSX 文件，包含 **Work Summary、Functional Checks、Material Usage、Photo Index** 四表，按 Work Order 关联。图片以链接查看，打开时需要同系统账号权限。外部没有账号的人不会自动获得图片访问权。历史导出不会随之后更正自动变化。

导出按当前 EN/ZH 界面选择表头，原中文、原SKU、手工译文保持原值。所有功能项只输出一次检验；作业汇总增加故障代码和原文快照，物料耗用增加标准用量上限及控制规则。旧记录复测数据仅在 Legacy Post-work Checks JSON 存档列保留，不能在编辑界面更改，也不用于ROK复测门禁。

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

浏览器：开发环境安装 Playwright 1.62.1（仅测试依赖）并具备 Chromium／Edge 后执行 `node --test tests/*.test.mjs`。本次脚本使用 Windows 已安装 Edge 的标准路径；其他浏览器或平台需相应调整测试 launch 配置。测试使用新临时配置，不使用日常登录配置。

完整回归：`node scripts/verify.mjs`。日志与结果 JSON 写到 artifacts/verification/，按当前源代码指纹验证，失败不打包。实际结果见 docs/TEST_REPORT.md及docs/jackery-release/REPORT.md。

受限沙箱若禁止 localhost 或浏览器进程，测试必须在允许本机网络的测试环境运行，不能把环境 EACCES 误认为业务通过或忽略浏览器测试。

## 项目结构与边界

- server.js：HTTP/API/静态入口。
- src/store.js、domain.js、export.js：SQLite、规则、业务导出。
- src/xlsx.js、zip.js、csv.js、images.js：纯文件处理。
- public/：无构建的中英文网页。
- tests/：单元、API、独立需求验收与真实浏览器 E2E。
- docs/：契约、计划、实施／测试报告、截图与业务依据。

V1 不包含库存、价格结算、飞书历史迁移、自动翻译、ERP/WMS/华宝接口、入库审批或离线同步。随包目录只表示已提供资料，不证明当前供货可用性；挂起项、英文名称及版本适用性仍需来源补齐。
