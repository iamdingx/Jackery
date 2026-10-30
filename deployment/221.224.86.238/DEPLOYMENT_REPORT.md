# Jackery V1 部署验收记录

状态：**已部署，公网验收通过**。

- 访问地址：http://221.224.86.238/
- 应用源码提交：`abb8df951b96a65040548f432282777c25db0d6a`。
- 已验证应用指纹：`84b855ad13e879837a2cad8cbef061a23f97d2af7d1c1cab721423b97e288bf5`。
- 部署模式：production，未使用`--demo`。没有迁移本地4条演示作业或仿真记录。
- 主机实测：Ubuntu 24.04.5 LTS、Linux x86_64。公网入口转发至此次登录的Ubuntu，HTTP入口已由服务器外部验证。

## 运行环境及配置

使用[Node.js官方24.22.2 LTS发行](https://nodejs.org/en/blog/release/v24.22.2)，访问与校验日期2026-10-30。Linux x64运行时SHA256：`48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75`，与官方发布值相符。独立安装在`/opt/jackery/runtime/`，未改动其他项目的Node版本。

| 项目 | 实际配置/验证 |
|---|---|
| 正式程序 | `/opt/jackery/releases/abb8df9-84b855ad13e8` |
| 当前版本 | `/opt/jackery/current`软链接 |
| 服务账号 | `jackery`，不可交互登录 |
| 数据目录 | `/var/lib/jackery`，与程序版本分离 |
| SQLite兼容名 | `/var/lib/jackery/huabao.sqlite` |
| 环境配置 | `/etc/jackery/jackery.env`，root:root 0600 |
| 应用服务 | `jackery.service`，active/running且开机自启 |
| 反向代理 | Nginx，active且开机自启，配置校验通过 |
| 内部监听 | `127.0.0.1:14310`，没有对外绑定应用端口 |
| 公网入口 | HTTP 80，Host保留，上传请求体限制16 MiB |
| 首次登录原件 | `/var/lib/jackery/first-run-accounts.json`，jackery:jackery 0600 |
| 初始备份 | `/var/backups/jackery/jackery-2026-10-30T04-09-56-467Z-2764389` |

当前按用户指定HTTP地址提供服务，尚未配置HTTPS证书。没有改SSH密码、操作系统版本或无关应用；原Nginx默认站点保留，新增Jackery专用站点。

正式运行包SHA256：`21d21039adf2ce5130be8fae729a33eb51b3b03e8bb864faf0593a36cd3deea2`。服务器已逐项通过`SHA256SUMS`校验。输入归档中的prepared状态描述归档生成时状态，实际部署状态以本报告和公网验收为准。

## 部署问题及修复

1. 首次解压后文件模式为root 0600，服务账号不能读取package.json。修复为发布目录0755、公开程序文件0644、程序及运行时归root所有。私有数据和凭据未放宽。
2. 使用`/opt/jackery/current/server.js`作为入口时，软链接路径与模块真实路径不同，CLI判断未启动服务，进程以0退出。修复systemd：保留`WorkingDirectory=/opt/jackery/current`，使用`ExecStart=<独立Node路径> server.js`。应用源码未改动。

两项部署配置问题均已实际修复，随后上游、公网、服务重启及浏览器验收通过。修正已同步本地安装脚本与服务模板，未删去失败事实。

## 验收结果

- 在Ubuntu上从隔离源码目录运行全部核心测试：**123/123通过，0失败、0跳过、0取消**。保存、锁定、管理员更正、附件、SKU与BOM限量、双语导出等使用隔离测试数据库，不写正式库。原始日志：服务器`/home/sagacity/jackery-linux-core.log`。
- 公网`/`及`/api/health`均200，health为`{ok:true,version:"1.0.0",demo:false}`。
- 已真实浏览器登录生产管理员，并核对9个真实型号配置、7个启用配置、404候选物料、261启用、143挂起、242个译文。
- 指定车充板示例：英文`Car Charging PCBA | HTE078-C-A3 (EU/KR/UK/AU) RoHS REACH`在上，源中文在下，SKU和1pcs上限保持。
- 功能检查仍只有单次单选点，无新增final阶段；故障码F0–F9可选。语言切换保持未保存SN、物料数量与故障选择，页面无横向溢出及未捕获脚本异常。
- 公网四表导出实际下载并解析通过，故障及用量上限表头完整。
- 匿名管理员接口401，私有初始登录文件路径404。服务重启后健康正常，状态及开机自启均验证。
- **正式库验收前后均0条工单**。没有保留生产测试工单；草稿仅在浏览器内验证。

本地原版完整回归148/148、103笔API/浏览器仿真证据继续保留；不能把这些本地结果误称为在服务器跑过全部浏览器批量。本次服务器新增的是123项核心回归和上述实际公网验收。

## 管理员交付与资料边界

登录账号为`admin`。随机初始密码未写入源码、日志、本报告或公开部署包。用户明确批准后，首次登录文件通过SSH保存到本机`artifacts/deployment/PRODUCTION_LOGIN.json`，NTFS ACL仅当前用户可访问。下载后已比较正式原件和临时传输副本，删除的仅是临时副本，服务器正式原件仍在0600私有路径中。

登录后可通过Change Password修改密码，并在Administration创建真实作业员账号。没有把演示alex/blair账号发布到公网。

143行挂起资料、E1000缺标准量、型号/源状态矛盾继续保持原规则；不会因部署或英文译文启用。BOM译文是中文来源整理结果，不代表供应商技术批准。检查与故障资料未自动补写译文。

## 备份、维护与回滚

备份（必须采用相对脚本入口以配合当前版本软链接）：

```bash
cd /opt/jackery/current
sudo -u jackery /opt/jackery/runtime/node-v24.22.2-linux-x64/bin/node scripts/backup.mjs --data-dir /var/lib/jackery --output /var/backups/jackery
```

服务检查使用`systemctl status jackery`、`journalctl -u jackery`。数据不得放入发布目录，不得把备份或初始密码放到public目录。

这是首次安装，没有旧Jackery版本可自动回退。需要撤回时只停止Jackery服务、禁用本次新增的Nginx站点并校验/重载代理；保留`/var/lib/jackery`及备份，不删除业务数据，不卸载共享Nginx。后续升级应先备份，再保留旧发布目录并切换current链接；旧SQLite文件名不可随意改名。

验收范围为当前部署、隔离核心测试及公网单会话功能检查；未执行真实多用户并发压力、系统重启或HTTPS验收。已验证systemd开机自启配置及服务进程重启，未为测试重启整台服务器。
