# 此目录用于存放 EuriskoTax 项目运行时产生的日志文件

> 📌 统一规范：**2026-08-16 起所有新增/重构的脚本必须输出日志到此目录（`$ProjectRoot/logs/`）**
>
> 📌 过渡期兼容：`tools/ops/` 目录下目前仍存在 `watchdog.log` / `notify.log` / `events.log` 共 3 份历史日志（由 `ops-watchdog.ps1` / `ops-notify.ps1` 用 `$PSScriptRoot` 相对路径写入，涉及 30+ 行代码硬绑定），**下次修改 ops 脚本时一并迁移到此目录**。

---

## 标准日志文件名

| 文件名 | 用途 | 写入方式 | 轮转策略 |
|--------|------|---------|---------|
| `watchdog.log` | 守护脚本每次检查的详细运行日志 | Append（逐行） | 建议保留最近 7 天 |
| `events.log` | 结构化事件日志（URL_CREATED / URL_CHANGED / STARTED / CRASHED 等）| Append（JSON 行）| 建议保留最近 30 天 |
| `notify.log` | 邮件通知交互日志（SMTP 握手 / 发送结果 / 去重）| Append | 建议保留最近 30 天 |
| `ops-start-share-test.log` | `ops-start-dev.ps1 -Share` 一次性测试日志 | 覆盖写 | 单次运行后可删 |
| `debug-*.log` | 临时调试日志（开发期）| 不限 | Git 提交前删除 |

---

## .gitignore

`logs/` 目录已经被 `.gitignore` 第 25 行忽略（`logs/`），运行时生成的内容不会意外入库。单独的 `*.log` 规则（第 26 行）也兜底覆盖了散落在其他目录的日志文件。
