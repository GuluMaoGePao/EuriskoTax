# debug-mail-spam (公网 URL_CHANGED/URL_CREATED 邮件密集发送排查)

- Session ID: mail-spam
- Status: [OPEN]
- Start: 2026-08-15
- Symptom: GUI 运行期间 + 邮件系统里出现"公网变更邮件"被密集/重复发送（应该一次变更只发一封）
- Expected: URL_CREATED 每个新 URL 生命周期/重启后最多 1 封；URL_CHANGED 仅当 A→B（不同）时发 1 封，A→B→A 摆动或同一对 old→new 只允许 1 封。

## 可证伪假设 (Falsifiable Hypotheses)

| # | Hypothesis | 证伪点 / 需要观察的数据 |
|---|---|---|
| H1 | `ops-watchdog.ps1` 主循环 `Get-CpolarUrl` 每轮返回值抖动（4040 API 失败 → log fallback 抓旧 URL，或 http/https 切换，或 cpolar 日志含多段 Tunnel 历史导致 regex 抓不同行）→ 同一轮循环误判 URL changed，触发 URL_CHANGED 邮件轰炸 | 每轮 watchdog 主循环打印 `currentUrl` 来源 (api/log/dash)、`script:LastCpolarUrl`、值及长度；若 url 值在同一生成后在相邻轮次出现 A↔B 交替 → H1 成立 |
| H2 | `ops-start-dev.ps1` 启动后先发了 URL_CREATED/URL_CHANGED 邮件（写入持久化文件），随后 watchdog 初始化阶段 fallback 到持久化时未同步通知标记，watchdog 主循环"首次检测 URL"路径或 Restart-Cpolar oldUrl 空路径再次发送第二封。用户看到"启动后 2 封/多封密集邮件" | 在 start-dev 与 watchdog 的 `Invoke-Notification` / `Send-WatchdogNotification` 入口同时打印 eventType / newUrl / oldUrl / callstack（或递增全局计数写入 notify.log），若同 newUrl 被 **两处代码入口** 各调用一次且时间差 < 30s → H2 成立 |
| H3 | `Test-CpolarHealth` 失败后走 `Restart-CpolarTunnel`，或 4040 短暂失败后走 `Get-CpolarUrl` 的 log fallback，拿到的 `$newUrl` 与之前相同，但因为 `$oldUrl` 被清空（例如启动初期 fallback 丢失），错误地走到 URL_CHANGED/URL_CREATED 分支。每一轮 health check 波动都会被当成变更发邮件 | 对 `Restart-CpolarTunnel` 与主循环 URL_CHANGED 路径各插桩：记录 oldUrl、newUrl、持久化值、是否命中 URL_CHANGED/URL_CREATED、判定理由。若 oldUrl 为 empty 时 newUrl 与 persisted 相同但却发了 URL_CHANGED → H3 成立 |
| H4 | `URL_CHANGED` 分支**缺少和 URL_CREATED 对称的"内存 + 持久化双重发送去重"**，仅靠 `currentUrl -ne script:LastCpolarUrl`。当外部（GUI 的 outHandler）写入共享文件 `euriskotax-last-cpolar-url.txt` 或 cpolar 自动重连导致 `LastCpolarUrl` 与文件/外部写入互相覆盖时，会出现 A→B→A→B 的 flapping；此时即便同一对 old→new 已发过，也会无限重发 | 记录 URL_CHANGED 事件的 `(oldUrl,newUrl)` 有序对，若 5 分钟窗口内同一有序对出现 ≥ 2 次，或 newUrl 与 前一次 URL_CHANGED 的 newUrl 相同（即无意义来回），→ H4 成立。这是最可能需要修复的结构性缺口。 |

## 插桩策略 (最小化)

- **ops-watchdog.ps1**:
  - `Get-CpolarUrl` 出口: 报告 `source` (api|dashboard|log|empty) 与返回值
  - `Test-CpolarHealth`: 报告 `ExpectedUrl`、健康结果、freshUrl 变化检测
  - 主循环 L512-558 URL 变更/首次检测分支：打印 old/new/persisted/memory flags/最终是否发送邮件
  - `Restart-CpolarTunnel` 的 URL_CHANGED / URL_CREATED 分支打印同样信息
- **ops-start-dev.ps1**:
  - L197 事件类型判断前后 打印 previousUrl/tunnelUrl/eventType
- **ops-notify.ps1** `Send-WatchdogNotification` 入口 (一次到位去重):
  - 对 URL_CHANGED / URL_CREATED 在发送邮件前打印 (event, newUrl, oldUrl) 和调用方进程名 / PID；
  - 写入 notify.log 的 "DEBUG" 行（开启后可见）。

> 插桩统一使用 `#region debug-point <id>` / `#endregion` 包裹，待修复后删除。

## 修复方向 (先不实施，待证据选择)

取决于假设，最可能的改动：
1. **URL_CHANGED 增加与 URL_CREATED 同等强度的去重 + 冷却**：
   - `$script:LastCpolarUrlChangedNotified = @{}` 或 `@{ "$old|$new" = timestamp }`
   - 5 分钟内相同有序对只发一次；若 newUrl 与上次 URL_CHANGED.newUrl 相同，拒绝发送
   - 持久化: `euriskotax-notified-events.log`（追加写入，避免重启后重来）
2. **Get-CpolarUrl 返回值规范化**：
   - 只接受 https:// 开头 + 长度 >= 28 + host 以 `.cpolar.cn/.trycloudflare.com` 结尾
   - 每次保留 latest 匹配（倒序扫描日志，避免抓到旧 URL）
   - 缓存 10s，避免同轮多次查询不一致
3. **Test-CpolarHealth 的 URL 变化判定与主循环合并**：当前 `Test-CpolarHealth` 会"提前"发现 URL changed 但只返回 true（而不会更新 `$script:LastCpolarUrl`），下一轮主循环再查一次时可能拿到不同值 → 造成误判。改为由 Test-CpolarHealth 把检测到的 freshUrl **直接传回调用方**，一处更新即可。
4. **ops-start-dev 与 watchdog 的通知协议**：持久化写 `lastUrlSentEvent = (URL_CREATED|URL_CHANGED)|url|timestamp`，start-dev 与 watchdog 在发送前都读该标记，避免双入口在同一次"启动 + 看门狗"里重复发。

## 证据表格 (运行后填充)

| 证据 | 观察值 | 结论 (支持/拒绝 H#) |
|---|---|---|
|  |  |  |
