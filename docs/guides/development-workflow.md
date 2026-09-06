# EuriskoTax 开发工作流总览（WORKFLOW）

> 最后更新：2026-09-06
> 面向对象：所有在本仓库开发/上线的人。
> 一句话原则：**本地起服务 → 改代码 → 本地门禁全绿 → 唯一入口发布 → 线上核对**。
> 本文档是「按钮名 / 命令 / 流程」的唯一权威定义。遇到与本文不符的描述，以本文为准。

---

## 0. 官方名词对照表（先看这里）

> 历史文档（根 README / 旧版 GUI 图）里可能出现过 **「标准启动」「快速启动」「完整测试」「开发模式」** 等旧按钮名，
> 它们在 2026-09 GUI 大改版后已统一为下表的新名字。若在界面上找不到旧名，对照下表即可。

### A. 本地启动（GUI「🚀 启动管理」Tab）

| 场景 | GUI 按钮（官方名） | 等价命令行 | 说明 |
|------|-------------------|-----------|------|
| 全新环境 / 刚 pull 了新代码 / 依赖变了 | **「第一次用：一键启动」** | `.\tools\ops\ops-start-dev.ps1` | 环境检查 → npm install → 重置测试账号 → 启动 `:3000` |
| 之前成功启动过、依赖已装齐 | **「日常启动：快速启动」** | `.\tools\ops\ops-start-dev.ps1 -SkipInstall -SkipResetUser` | 最快路径，日常开发推荐 |
| 要把地址发给好友体验 | **「启动 + 公网分享」** | `.\tools\ops\ops-start-dev.ps1 -Share` | 开启 cpolar 隧道，URL 自动发邮件 |
| 本地长时间运行防崩溃 | **「启动 + 崩溃自动重启」** | `.\tools\ops\ops-start-dev.ps1 -Watchdog` | 看门狗守护，崩了自动拉起 |
| 分享 + 守护都要 | **「启动 + 分享 + 自动重启」** | `.\tools\ops\ops-start-dev.ps1 -Share -Watchdog` | 好友联调最常用 |
| 改后端代码想自动重启 | **「Nodemon 开发模式」** | `npm run dev`（server 目录） | 仅本地调试后端用 |

> 别再把「标准启动 / 快速启动」挂在嘴边找不到了 —— 现在只有上面这些名字。

### B. 停止 / 端口（同 Tab，功能区 2）

| GUI 按钮 | 等价命令 | 说明 |
|---------|---------|------|
| **「停止后端服务」** | GUI 内 Stop-Job | 正常退出后端 + 看门狗 |
| **「强制释放 3000 端口」** | `Free-Port -Port 3000`（GUI 内置） | 启动报「端口占用」时点它 |
| **「查看 3000 端口状态」** | `netstat -ano \| findstr :3000` | 看是谁占着 3000 |

### C. 验证（GUI「🧪 测试」/ 命令）

| 场景 | GUI 按钮 / 命令 | 说明 |
|------|----------------|------|
| push 前必跑的全链路门禁 | **「本地登录链路验证（发布门禁）」** 或 `npm run verify:local` | 13 项：登录 dev 号 → 邀请码+验证码注册新号 → 新号登录 → 前端/SW 指纹，全绿才允许发布 |
| `:3000` 后端运行中、schema 没改 | `VERIFY_SKIP_GENERATE=1 npm run verify:local` | 逃生门：跳过 `prisma generate`（运行中的后端锁着引擎 DLL，直接跑会 EPERM）。脚本会自动探测并提示 |
| 单元测试 | **「运行全部测试 + 覆盖率」** / `npm test` | 6 套件 203 例 |

### D. 发布（GUI「🔐 Git & 账号」Tab → 卡片 4）

| 场景 | GUI 按钮（官方名） | 等价命令 | 说明 |
|------|-------------------|---------|------|
| 上线前零风险预演 | **「安全发布试运行」** | `.\tools\ops\ops-publish.ps1 -DryRun` | 只跑本地门禁，不 commit 不 push |
| **正式上线（唯一入口）** | **「安全发布」** | `.\tools\ops\ops-publish.ps1` | verify → git add+commit → push origin main → 自动轮询线上核对 |
| 指定提交说明 | — | `.\tools\ops\ops-publish.ps1 -CommitMsg "feat: xxx"` | 弹窗输入即传此参数 |
| 后端占用引擎 DLL 时发布 | — | `.\tools\ops\ops-publish.ps1 -SkipVerifyGenerate` | 等同给 verify 设逃生门 |
| push 走代理（网络受限） | — | `.\tools\ops\ops-publish.ps1 -Proxy "http://127.0.0.1:7890"` | 仅本次 push 生效，不改 git 全局配置 |
| 调长线上等待 | — | `-PollMaxSeconds 900` | 默认 600s |
| 手动复核线上 | — | `.\tools\ops\ops-check-prod.ps1 [-BaseUrl https://euriskotax.zeabur.app]` | 9 项线上指纹，全绿退出码 0 |

---

## 1. 完整工作流（一图流）

```
       本地                                     线上（Zeabur）
┌──────────────────────────┐   ops-publish     ┌──────────────────────────────┐
│ ① 启动后端（GUI 启动管理）│                  │ GitHub main 收到 push        │
│    首次 → 第一次用一键     │ ── 门禁不绿 ──✗──▶│   → Dockerfile 自动构建       │
│    日常 → 日常快速启动    │   物理推不出去     │   → prisma migrate deploy    │
└──────────┬───────────────┘                  │   → 服务重启                  │
           │ 改代码（前端 src / 后端 server）    └──────────────▲───────────────┘
           ▼                                    ops-check-prod │
│ ② 本地验证：npm test（单测）                    （发布后自动轮询）│
│    + verify:local（13 项 e2e 门禁）                            │
│    └ 全绿 ───────────────────────────────────────────────────┘
│ ③ 发布：GUI「安全发布」/ ops-publish
│    verify→commit→push→线上核对  ← 一条命令/一个按钮闭环
│ ④ 出问题：git revert + 再走一次安全发布（见 §4 回滚）
└──────────────────────────
```

---

## 2. 日常循环详解

### ① 启动后端（怎么选按钮）

打开 GUI（`tools/gui/EuriskoTax-Console.bat`）→ 「🚀 启动管理」→ 顶部有**快速开始指引**卡片按你的情况给出建议。

- 判定口径很简单：
  - **第一次用 / 刚拉取过代码 / 装过依赖** → 「第一次用：一键启动」（会自动 `npm install` + 重置 `dev@example.com/password`，首次约 1–3 分钟）
  - **之前已成功启动过、依赖没变** → 「日常启动：快速启动」（秒起）

- 启动成功的标志：输出区出现 `服务器运行在 http://localhost:3000`，随后打印一批邀请码。
- 浏览器打开 `http://localhost:3000`，登录页在 localhost 下点「开发环境：填入本地测试账号」即可填入 `dev@example.com / password`。

### ② 本地缓存策略（2026-09 起本地不再被缓存坑）

- **本地（localhost / 127.0.0.1）**：新版 `index.html` 会**跳过 Service Worker 注册**，并主动**注销历史 SW + 清理 euriskotax 缓存**。效果：改前端代码后**直接刷新即见即所得**，不需要再 Unregister / Clear site data。
- 旧版残留：若本地页面曾注册过旧 SW，首次加载新页面会自动注销；极端情况硬刷一次（Ctrl+F5）。
- **线上**：SW 为网络优先「瘦缓存」策略（无应用壳预缓存，导航请求 network-first），离线回退最近访问的缓存；发布后线上用户正常刷新即可拿到新版，无需手动清缓存。

### ③ 验证门禁（改完代码，push 前必跑）

```powershell
npm test              # 单元测试（快）
npm run verify:local  # 全链路门禁（约 1-2 分钟，起真实后端）
```

- verify 会自己起一个**随机端口**的临时后端，不影响你开着的 `:3000`。
- 若 `:3000` 后端正在运行（会锁 Prisma 引擎 DLL），脚本会打印 **`[WARN] 检测到本地后端仍在运行`** 提示。此时二选一：
  - 停掉 `:3000` 后端再跑（GUI：停止后端服务）；
  - 或 schema 未变更时用逃生门：`VERIFY_SKIP_GENERATE=1 npm run verify:local`。

### ④ 发布（只走安全发布）

正式上线**只有一条路**：GUI「🔐 Git & 账号」→「🚀 安全发布」或命令行 `ops-publish.ps1`。
它内部依次完成：verify 门禁（不过就中止）→ 自动 commit → push origin main（自动重试，可 `-Proxy`）→ 轮询线上 9 项指纹（全绿即完成）。

小技巧：重要发布先点「🧪 安全发布试运行」零风险预演一遍，确认门禁能绿再正式发。

---

## 3. 发布后：如何确认真的上线了

- 发布脚本 `[4/4]` 会自动轮询直到 `ops-check-prod` 全绿；
- 也可随时手动跑：`.\tools\ops\ops-check-prod.ps1`（9 项：页面可访问 / 无快速登录按钮 / 登录表单 / auth-ui dev 入口指纹 / 无 quick-login / 409 提示 / SW v8 / 协议守卫 / app.js `?v=2`）；
- 只改了 tools/docs 等非前端资源时，线上指纹不变，核对**会很快通过**——属正常现象。

---

## 4. 回滚

| 部署模式 | 回滚方式 |
|---------|---------|
| **生产 Zeabur（当前主要）** | `git revert <有问题的 commit>` → 重新走一次「安全发布」。Zeabur 没有额外一键回滚；因为安全发布自带门禁，revert 后必然安全 |
| 旧自建服务器模式（`ops-deploy.ps1`，已非主要） | GUI「📦 部署」→「回滚到上一个版本」或 `.\tools\ops\ops-deploy.ps1 -Rollback`（切换 releases 软链接） |

> 判断该回滚哪个 commit：`git --no-pager log --oneline -10`，revert 那个 SHA 即可。

---

## 5. 排障速查表

| 现象 | 原因 | 处理 |
|------|------|------|
| 本地改代码不生效 / 还是旧页面 | 浏览器还挂着历史 SW 缓存 | 本地新页面会自动注销 SW；极端情况 `Ctrl+F5` 硬刷一次。若仍旧：F12 → Application → Service Workers → Unregister + Clear site data |
| 登录页 JS 报 `Cannot read properties of null (reading "classList")` / 栈里有 `updateUIBtn` | **浏览器加载的是旧版 auth-ui**（老缓存） | 这是「旧版」特征函数名。`?v=2` 版本指纹已生效，清一次缓存 / 无痕窗口验证即可；新版无此函数 |
| verify 卡在 `prisma generate ... EPERM` | `:3000` 后端锁着引擎 DLL | 停后端，或 `VERIFY_SKIP_GENERATE=1`（schema 未变更时）；发布用 `-SkipVerifyGenerate` |
| `git push` 超时 / Connection reset | 网络到 github.com 不通 | 发布脚本已自动重试 3 次；仍失败用 `-Proxy "http://127.0.0.1:7890"`（自己代理端口替换），先 `git ls-remote origin main` 测连通 |
| 发布 `[4/4]` 一直显示「仍在构建」直到超时 | Zeabur 构建慢，或（历史问题）核对脚本本身有 bug（已修：补 BOM + 修引号转义） | 手动跑 `ops-check-prod.ps1` 看明细；真慢就 `-PollMaxSeconds 900` 再来一次 |
| 线上老用户看到旧版 | 其浏览器内旧 SW 尚未更新（导航 network-first，一般刷新即新） | 提示用户刷新；仍旧则 Unregister + Clear site data 一次 |
| 端口 3000 被占用启动失败 | 上次没正常退出 | GUI「强制释放 3000 端口」后重启 |
| GUI 找不到某按钮 | 用的是旧文档名字（标准启动/完整测试/开发模式…） | 对照 §0 名词表找新名；按钮旁有说明，悬停看 Desc |

---

## 6. 相关文档

- 项目入口与快速启动：[根 README](../../README.md)
- 文档中心：[docs/README.md](../README.md)
- GUI 按钮速查：[gui-button-reference.md](gui-button-reference.md)
- 运维脚本说明：[tools/ops/README.md](../../tools/ops/README.md)
- 单元测试与发布纪律说明：[根 README 发布纪律](../../README.md)
