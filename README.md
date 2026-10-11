# StudyTracker · 专注模式自动学习计时

> 开 / 关 iPhone 的「学习」专注模式，学习时长自动记录；每周一早上自动推送学习周报通知，点开就是"屏幕使用时间"风格的可视化报告。开源免费，数据全在本地。
> Focus-mode based automatic study time tracking for iOS — weekly summary notification + a Screen Time-style interactive report. Built on Apple Shortcuts + Scriptable.

## ✨ 功能

- **自动计时**：开启「学习」专注模式 → 记下开始时间；关闭 → 自动计算时长并写入记录。全程零手动操作。
- **可视化报告**：周 / 日双视图、柱状图、日均线、点击柱状图下钻到某天 / 某时段、会话明细、历史周导航。
- **每周一 08:00 通知**：上周学习总时长 · 次数 · 日均 · 较前周变化；**点开通知直接进入该周报告**。
- **稳健设计**：重复开关不会重复记；不足 1 秒的会话不写零记录；保存中断可自动恢复；能自动修正旧版写反方向的负数记录（修复前先留备份）。
- **纯本地**：原始数据是 iCloud Drive 中的纯文本；统计与渲染全部在设备本地完成，没有任何服务器。

## 📦 安装（4 步）

前置：安装免费的 [Scriptable](https://apps.apple.com/app/scriptable/id1405459188)。

1. **放入 Scriptable 脚本**：把 [`scriptable/`](scriptable/) 中的 3 个 `.js` 放进 **iCloud Drive → Scriptable** 文件夹。
   文件名为普通空格（如从网页下载出现 `%20`，请改回空格）。
2. **导入快捷指令**：下载 [`shortcuts/`](shortcuts/) 里的两个 `.shortcut` 并导入；名称保持 **`学习记录 V3.1`** / **`学习周报 V3.1`**（重要：记录的自恢复与自动化依赖该名称）。
   手机上更方便的一键导入（整段复制到 Safari 地址栏打开，会自动带上正确名称）：

   - 学习记录 V3.1：<br>`shortcuts://import-workflow?url=https%3A%2F%2Fraw.githubusercontent.com%2FTrGeorge-dev%2Fstudytracker-shortcuts%2Fmain%2Fshortcuts%2F%E5%AD%A6%E4%B9%A0%E8%AE%B0%E5%BD%95%20V3.1.shortcut&name=%E5%AD%A6%E4%B9%A0%E8%AE%B0%E5%BD%95%20V3.1`
   - 学习周报 V3.1：<br>`shortcuts://import-workflow?url=https%3A%2F%2Fraw.githubusercontent.com%2FTrGeorge-dev%2Fstudytracker-shortcuts%2Fmain%2Fshortcuts%2F%E5%AD%A6%E4%B9%A0%E5%91%A8%E6%8A%A5%20V3.1.shortcut&name=%E5%AD%A6%E4%B9%A0%E5%91%A8%E6%8A%A5%20V3.1`

   （若 raw 链接无法访问，把 `raw.githubusercontent.com/…/main/` 换成 `cdn.jsdelivr.net/gh/…@main/` 走 jsDelivr 镜像。）

3. **运行自检**：在 Scriptable 里运行「学习系统自检」→ 允许通知 → 点开测试通知，确认能打开报告界面。
4. **建立 3 条自动化**（快捷指令 → 自动化，全部选「立即运行」）：

| 触发 | 操作 |
|---|---|
| 「学习」专注模式 **打开时** | 文本 `start` → 运行「学习记录 V3.1」（输入 = 文本） |
| 「学习」专注模式 **关闭时** | 文本 `end` → 运行「学习记录 V3.1」（输入 = 文本） |
| **每周一 08:00** | 文本 `notify` → 运行「学习周报 V3.1」（输入 = 文本） |

> 提示①：手动运行「学习周报 V3.1」（不传输入）＝ 直接展示报告，可翻看任意周。
> 提示②：想先测试周一通知，可把第 3 条先建成"今天 +几分钟"的临时自动化，跑通后再改回每周一 08:00（测试不会影响下周正式通知）。

## 🗂 目录结构

- [`shortcuts/`](shortcuts/) — 已签名成品（可直接导入）
- [`scriptable/`](scriptable/) — Scriptable 端三个脚本：数据引擎 `StudyTracker V3.js`、报告入口 `StudyTracker V3 报告.js`、自检 `学习系统自检.js`
- [`source/`](source/) — 未签名 plist 源文件（可直接编辑、审阅、重新签名）
- [`.github/workflows/sign.yml`](.github/workflows/sign.yml) — 云端重签工作流（改动源码后在 Actions 页手动触发）

## 📄 数据格式

数据位于 iCloud Drive → `Shortcuts/StudyTracker/`（纯文本）：

- `active.txt`：进行中会话的开始时间（ISO 格式，含时区）；结束时写为 `CLOSED`
- `sessions.txt`：每行 `yyyy-MM-dd|HH:mm|HH:mm|秒数`，如 `2026-10-09|19:30|21:00|5400`
- 跨午夜的学习整段计入**开始日期**；日均按 7 天计算
- 运行过程中会生成少量备份 / 修复文件（如 `sessions-before-v3.1-*.txt`），同样为纯文本

## 🔧 从源码构建 / 重新签名

- `source/*.xml` 为未签名源文件；在仓库 **Actions → Sign Shortcuts (HubSign) → Run workflow** 即可自动重新签名并提交回 `shortcuts/`。
- 签名使用 [HubSign](https://hubsign.routinehub.services)（RoutineHub 提供的免费签名服务）。

## 🔐 安全与完整性

- 所有 `.shortcut` 均由 HubSign 签名；证书链：每文件唯一的 Apple 叶证书 → `Apple System Integration CA 4` → **`Apple Root CA - G3`**。iOS 导入时会校验签名，内容被修改即无法导入。
- 快捷指令本身**不含任何网络请求**；只在本机与 iCloud Drive 读写上述文本文件（可在编辑器逐条核对）。
- 通知与跳转均在本地由 Scriptable 完成；不采集、不上传任何数据。

## 📝 更新日志

- **v3.1.3**（2026-10-11）
  - Scriptable 模块：修复真机 `move()` 不覆盖已有文件导致的本地缓存写入报错；通知内容升级为「总时长 · 次数 · 日均 · 较前周变化」；通知跳转改用官方文档格式 `scriptable:///run/<名称>`；报告页脚显示引擎版本。
  - 记录器：修复 iOS「条件判断值显示空白 → 请为此操作中的每个参数选取值」缺陷（三处比较改为经文本中转，另将空占位文本改为不可见字符）。
- **v3.1.1**（2026-10-11）：脚本参数传递改为 Base64 通道，修复参数字段丢失问题。
- **v3.0**（2026-10-09）：基于 Scriptable 的初版（自动计时 + 周报）。

## ⚠️ 注意事项

- 首次运行后若 `StudyTracker` 文件夹不存在：在 iCloud Drive → Shortcuts 下手动新建，再运行一次。
- 计时依赖专注模式的开关事件；请确认三条自动化均为「立即运行」。
- 手动运行「学习记录 V3.1」且未传 start/end 时，会按当前专注模式推断（开 = start，关 = end），用于兼容与补救；日常计时请依赖自动化。
- 建议只在一台设备上同时运行本系统，避免多端同时写同一份文件。

## 📜 License

[MIT](LICENSE) © 2026 赵钧正 (TrGeorge-dev)
