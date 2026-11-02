# 备注文本框固定尺寸及标题更名

用户反馈可拖动文本框造成Defect remark与Condition & Notes大小不一致。现禁用仅这两个面板内textarea的resize，统一同视口输入高度；桌面44px，常规布局64px，长内容保留内部滚动。原桌面高度分别66px/32px，已统一；小屏外观预设换行时收紧面板内部间距，使输入完整可见，不扩大面板或挤压结果区。

右侧标题改为Appearance condition，中文外观状况。输入标签Appearance Notes保持，底层appearanceNotes/issueNotes及原记录、API、导出字段和业务校验不变。

强化已有真实浏览器用例，先捕获旧标题失败，再校验computed resize:none、等高等宽及实际鼠标拖动角落后尺寸不变。1366×768、1536×864、2048×1000均检查两块边界、外观输入无裁切、照片位置、操作可见、无页面横向溢出；保留双语切换、自由文本、保存重载、蓝牙和照片回归。测试捕获1366下等高输入底部超出4px后，仅调整外观区内部间距修复。截图位于忽略的artifacts/fixed-panels。

最终142项核心/API及36项浏览器全过，178/178，0失败/跳过/取消，精确源码证据见fixed-note-inputs/VERIFICATION_SUMMARY.json。只涉及public/app.js、public/styles.css和既有测试，不进行数据库迁移或数据修正。正式发布继续备份、原子切换与逐表哈希验证，沿用800地址及旧80跳转配置。
