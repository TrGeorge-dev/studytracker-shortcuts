# StudyTracker · 专注模式自动学习计时

> 只要开 / 关 iPhone 的「学习」专注模式，学习时长就会被**自动记录**。基于 iOS 快捷指令 + iCloud 文本文件，开源免费。
> Automatically track your study time via iOS Focus modes — open-source Apple Shortcuts system.

## ✨ 功能

- **「学习记录」**：开启「学习」专注模式 → 自动记下开始时间；关闭 → 自动计算时长并追加到记录文件。全程零手动操作。
- **「学习周报」**：一键统计最近 7 个自然日（含今天）的学习时长，生成报告。
- 数据保存在 iCloud Drive（`Shortcuts/StudyTracker/`），纯文本，可导出、可自写脚本分析。

## 📥 安装

> iOS 15+ 首次导入会弹一次「不受信任的快捷指令」提示，点「允许 / 添加」即可（正常流程，签名为官方推送的每文件证书）。

**方式 1 · 一键导入链接**（复制整段到 Safari 地址栏打开；GitHub 页面内不可直接点击）：

- 「学习记录」：<br>`shortcuts://import-workflow?url=https%3A%2F%2Fraw.githubusercontent.com%2FTrGeorge-dev%2Fstudytracker-shortcuts%2Fmain%2Fshortcuts%2Fstudy-recorder.shortcut&name=%E5%AD%A6%E4%B9%A0%E8%AE%B0%E5%BD%95`
- 「学习周报」：<br>`shortcuts://import-workflow?url=https%3A%2F%2Fraw.githubusercontent.com%2FTrGeorge-dev%2Fstudytracker-shortcuts%2Fmain%2Fshortcuts%2Fstudy-weekly.shortcut&name=%E5%AD%A6%E4%B9%A0%E5%91%A8%E6%8A%A5`

**方式 2 · 文件导入**：直接下载 [`shortcuts/`](shortcuts/) 里的两个 `.shortcut` 文件，在 iPhone 上点开导入。

（如上方 raw 链接无法访问，可把链接中的 `raw.githubusercontent.com/…/main/` 换成 `cdn.jsdelivr.net/gh/…@main/` 走 jsDelivr 镜像。）

## ⚙️ 建立两个自动化（必做）

「快捷指令 → 自动化 → 新建 → 专注模式 → 学习」分别创建：

| 触发 | 设置 | 操作 |
|---|---|---|
| 打开时 | 立即运行 | 运行「学习记录」 |
| 关闭时 | 立即运行 | 运行「学习记录」 |

## 📄 数据格式

- `active.txt`：进行中的开始时间 `2026-10-09 19:30:00`；本次已结束则为 `CLOSED`
- `sessions.txt`：每行 `yyyy-MM-dd|HH:mm|HH:mm|秒数`，例如 `2026-10-09|19:30|21:00|5400`
- 跨午夜的学习计入**开始日期**

## 🔧 从源码构建 / Build from source

- [`source/*.xml`](source/) — 未签名的 plist 源文件（可直接编辑与审阅）
- [`source/gen_study.py`](source/gen_study.py) — Python 生成器（面向 Minis/iOS 环境，桌面运行需调整输出路径）
- [`.github/workflows/sign.yml`](.github/workflows/sign.yml) — GitHub Actions 工作流：改动源码后，在仓库 Actions 页手动触发（Run workflow），自动经 HubSign 签名并把结果提交回 `shortcuts/`

## ⚠️ 注意事项

- 首次运行后若没有 `StudyTracker` 文件夹：在 iCloud Drive / Shortcuts 下手动新建，再运行一次
- 计时依赖「专注模式」的开关事件；请确认两个自动化均为「立即运行」
- 专注模式本身可用系统设置按时间/位置自动开关，与课表无关

## 📜 License

[MIT](LICENSE) © 2026 赵钧正 (TrGeorge-dev)
