# EuriskoTax 开发工作流总览（WORKFLOW）

> 最后更新：2026-09-12
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
| push 前必跑的全链路门禁 | **「本地登录链路验证（发布门禁）」** 或 `npm run verify:local` | 59 项：前端与 SW 网络优先特征冒烟 → 登录 dev 号 → 反馈落库+附图（含非法附图 400）+用户/管理员列表+状态跟进 → 匿名埋点+聚合统计 → 运维后台用户列表/详情/权益调档 → 邀请码+验证码注册新号 → 新号登录 → 新号身份，全绿才允许发布 |
| `:3000` 后端运行中、schema 没改 | `VERIFY_SKIP_GENERATE=1 npm run verify:local` | 逃生门：跳过 `prisma generate`（运行中的后端锁着引擎 DLL，直接跑会 EPERM）。脚本会自动探测并提示 |
| 改了 `schema.prisma`、或动过 `server/prisma/migrations/`，想确认「上线不会炸」 | **`npm run verify:pg`** | **生产等价演练**：用 Docker 起一个本地 PostgreSQL，按线上容器同序（`generate` → `migrate deploy` → 起服务）把同一套 59 项断言再跑一遍；`npm run verify:pg:fresh` = 先删数据卷（等价「全新库首次部署」）。需 Docker Desktop，未安装时优雅跳过（退出码 2，不是代码问题） |
| 单元测试 | **「运行全部测试 + 覆盖率」** / `npm test` | 12 套件 303 例 |

### D. 发布（GUI「🔐 Git & 账号」Tab → 卡片 4）

| 场景 | GUI 按钮（官方名） | 等价命令 | 说明 |
|------|-------------------|---------|------|
| 上线前零风险预演 | **「安全发布试运行」** | `.\tools\ops\ops-publish.ps1 -DryRun` | 只跑本地门禁，不 commit 不 push |
| **正式上线（唯一入口）** | **「安全发布」** | `.\tools\ops\ops-publish.ps1` | verify → git add+commit → push origin main → 自动轮询线上核对（附带生产内容幂等补种）→ 成功后自动打并推送 `v<package.json版本>` 标签（幂等） |
| 跳过发布后自动打标签 | — | `.\tools\ops\ops-publish.ps1 -NoAutoTag` | 版本号未变/不需要新标签时使用（默认自动打，已存在则跳过） |
| 跳过发布后内容补种 | — | `.\tools\ops\ops-publish.ps1 -NoSeedProd` | 阶段11：生产内容种子默认自动执行（幂等）；未配置 `ADMIN_TOKEN_PROD` 时自动跳过 |
| 手动补种生产内容 | — | `node tools\ops\ops-seed-prod.js [--dry-run]` | 换新库/重置生产库后必需，否则内容端点 `items=0` 会让线上核对失败 |
| 指定提交说明 | — | `.\tools\ops\ops-publish.ps1 -CommitMsg "feat: xxx"` | 弹窗输入即传此参数 |
| 后端占用引擎 DLL 时发布 | — | `.\tools\ops\ops-publish.ps1 -SkipVerifyGenerate` | 等同给 verify 设逃生门 |
| push 走代理（网络受限） | — | `.\tools\ops\ops-publish.ps1 -Proxy "http://127.0.0.1:7890"` | 仅本次 push 生效，不改 git 全局配置 |
| 调长线上等待 | — | `-PollMaxSeconds 900` | 默认 600s |
| 手动复核线上 | — | `.\tools\ops\ops-check-prod.ps1 [-BaseUrl https://euriskotax.zeabur.app]` | 35 项线上指纹，全绿退出码 0 |

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
│    + verify:local（59 项 e2e 门禁）                            │
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
- **线上自愈（2026-09-12 起）**：`index.html` 内置版本哨兵 `StaleGuard` —— 启动时以 `cache: 'no-store'` 拉根目录 `/version.json`，与本页 `window.__APP_VERSION__` 比对，不一致即自动注销 SW、清空 Cache Storage 并重载（每会话只做一次；localhost 不启用，避免打断本地热更新）。前提是**版本号五处同步**（见 [分支与版本发布策略 §3.2](branch-release-strategy.md)），漏改会让它每次会话都清一次缓存。
- **彻底卡死的兜底**：`GET /reset` → 302 → `/clean-cache.html?auto=1`，短、好念、可直接发给用户；旧 SW 死锁首页时它仍能穿透（独立页 + 全新 URL）。

### ③ 验证门禁（改完代码，push 前必跑）

```powershell
npm test              # 单元测试（快）
npm run verify:local  # 全链路门禁（约 1-2 分钟，起真实后端）
npm run verify:pg     # 生产等价演练：同一套断言跑在本地 PostgreSQL（动过 schema/迁移后必跑）
```

- verify 会自己起一个**随机端口**的临时后端，不影响你开着的 `:3000`。
- 若 `:3000` 后端正在运行（会锁 Prisma 引擎 DLL），脚本会打印 **`[WARN] 检测到本地后端仍在运行`** 提示。此时二选一：
  - 停掉 `:3000` 后端再跑（GUI：停止后端服务）；
  - 或 schema 未变更时用逃生门：`VERIFY_SKIP_GENERATE=1 npm run verify:local`。
- **什么时候必须跑 `verify:pg`**：改了 `server/prisma/schema.prisma` 或 `server/prisma/migrations/` 之后。
  本地日常开发是 SQLite，线上是 PostgreSQL + 容器启动时 `prisma migrate deploy` 建表——
  「schema 改了忘写迁移」「迁移 SQL 在 PG 上跑不通」这两类问题**在 SQLite 上永远绿**，只会在上线后炸成 500。
  `verify:pg` 用 Docker 起一个临时 PostgreSQL，按线上同序（`generate` → `migrate deploy` → 内容种子 → 起服务）
  再跑一遍同样的 59 项断言；`npm run verify:pg:fresh` 会先删数据卷，等价「全新库首次部署」。
  首次使用需装 Docker Desktop；**没装时该命令优雅退出（退出码 2）并给出提示，不影响 `verify:local`**。

### ④ 发布（只走安全发布）

正式上线**只有一条路**：GUI「🔐 Git & 账号」→「🚀 安全发布」或命令行 `ops-publish.ps1`。
它内部依次完成：verify 门禁（不过就中止）→ 自动 commit → push origin main（自动重试，可 `-Proxy`）→ 轮询线上 35 项指纹（全绿即完成）→ 自动打并推送版本标签 `v<package.json 版本>`（幂等，可用 `-NoAutoTag` 关闭）。
> 版本号请在发布前同步**五处**：`package.json` / 关于弹窗 `版本 x.y.z` / `CHANGELOG.md` 最新条目 / `index.html` 的 `window.__APP_VERSION__` / 根目录 `version.json`（后两处是版本哨兵基准，漏改会让用户每次新会话都清一次缓存）。详见 [分支与版本发布策略 §3.2](branch-release-strategy.md)。

小技巧：重要发布先点「🧪 安全发布试运行」零风险预演一遍，确认门禁能绿再正式发。

---

## 3. 发布后：如何确认真的上线了

- 发布脚本 `[4/4]` 会自动轮询直到 `ops-check-prod` 全绿；`[5/5]` 成功后自动打并推送版本标签；
- 也可随时手动跑：`.\tools\ops\ops-check-prod.ps1`（**35 项**：页面可访问 / 登录表单 / 各阶段前端与后台指纹 / 版本三处线上比对（关于弹窗 `版本 x.y.z`、`__APP_VERSION__`、`/version.json`）/ 排障短链 `/reset` 命中清洗页 / 内容端点 / SW 与 app.js 缓存策略）；
- 只改了 tools/docs 等非前端资源时，线上指纹不变，核对**会很快通过**——属正常现象。

---

## 4. 回滚

**核心观念**：版本标签 `vX.Y.Z`（见[分支与版本发布策略 §5.3 标签记录](branch-release-strategy.md)）就是**稳定锚点**——
每次正式发布都会留下一个「当时线上 35 项指纹全绿」的 commit。所以线上**任何时刻都有一份可以立即回去的已知良好产物**，
回退是「回到锚点」，不是「重新开发」。

按「先止血、再修根」两步走：

| 顺序 | 手段 | 耗时 | 适用 |
|------|------|------|------|
| 1️⃣ 止血 | **Zeabur 控制台 → 服务 → 部署历史 → 选上一个正常构建 → 重新部署**（不改代码、不过门禁） | ~1 分钟 | 线上已经不可用，先把服务恢复 |
| 2️⃣ 修根 | `git revert <坏 commit>`（或批量回退到锚点）→ 再次走「安全发布」 | ~8-10 分钟 | 确认问题提交后，把代码也退回正确状态 |

```powershell
git --no-pager log --oneline -10          # 先定位：坏的是哪个 commit
git revert <坏 commit>                    # 只退坏的这一批（保留历史，符合 trunk 模型）

# 或整体退回某个稳定锚点之后的全部提交：
git revert --no-commit v1.10.0..main      # -no-commit 便于先审一遍变更
.\tools\ops\ops-publish.ps1 -CommitMsg "revert: 回退到 v1.10.0 稳定版（线上故障）"
```

- 第 1️⃣ 步能否操作**以你 Zeabur 控制台实际界面为准**（本仓库历史文档曾记为「没有一键回滚」）；若没有该入口，直接走第 2️⃣ 步。
- 回退同样受门禁保护：revert 后必须重新通过 59 项 + 35 项指纹才会推上线，不会出现「为了救火反而推了更糟的版本」。
- 旧自建服务器模式（`ops-deploy.ps1`，已非主要）：GUI「📦 部署」→「回滚到上一个版本」，或
  `.\tools\ops\ops-deploy.ps1 -Rollback`（切换 releases 软链接）。

> 回滚后用户端可能仍看到旧版缓存：把 `https://<域名>/reset` 发给对方即可（独立清洗页，能穿透旧 SW 死锁）。
> 定位版本/发布/标签纪律见 [分支与版本发布策略 §6 回滚](branch-release-strategy.md#6-回滚策略)。

---

## 5. 排障速查表

| 现象 | 原因 | 处理 |
|------|------|------|
| 本地改代码不生效 / 还是旧页面 | 浏览器还挂着历史 SW 缓存 | 本地新页面会自动注销 SW；极端情况 `Ctrl+F5` 硬刷一次。若仍旧：F12 → Application → Service Workers → Unregister + Clear site data |
| 登录页 JS 报 `Cannot read properties of null (reading "classList")` / 栈里有 `updateUIBtn` | **浏览器加载的是旧版 auth-ui**（v1.5.1 之前的老缓存） | `updateUIBtn` 是旧版特征函数名。v1.5.2 起已移除 `?v=` 版本指纹并改为 SW 网络优先瘦缓存，正常刷新即拉新版；仍旧则清一次缓存 / 无痕窗口验证 |
| verify 卡在 `prisma generate ... EPERM` | `:3000` 后端锁着引擎 DLL | 停后端，或 `VERIFY_SKIP_GENERATE=1`（schema 未变更时）；发布用 `-SkipVerifyGenerate` |
| `npm run verify:pg` 提示「未检测到 docker 命令」（退出码 2） | 本机没装 Docker Desktop / 没启动 | **不是代码问题**：日常继续用 `verify:local`；要启用演练就装 Docker Desktop 并启动后重跑（见 §2③） |
| `npm run verify:pg` 报 `prisma migrate deploy` 失败 | 迁移本身有问题——**这正是上线会炸的点** | 修好迁移再发布（`cd server && npx prisma migrate dev` 修正 SQL）；演练库可 `docker compose -f docker-compose.postgres.yml down -v` 重置后重跑 |
| 跑完 `verify:pg` 后 `verify:local`/本地启动报 Client provider 不匹配 | 演练把 Prisma Client 生成成了 PostgreSQL 版本 | 脚本收尾会自动恢复 SQLite Client；若恢复失败（引擎被占用）手动执行 `cd server && npm run prisma:generate:dev` |
| `git push` 超时 / Connection reset | 网络到 github.com 不通 | 发布脚本已自动重试 3 次；仍失败用 `-Proxy "http://127.0.0.1:7890"`（自己代理端口替换），先 `git ls-remote origin main` 测连通 |
| 发布 `[4/4]` 一直显示「仍在构建」直到超时 | Zeabur 构建慢，或（历史问题）核对脚本本身有 bug（已修：补 BOM + 修引号转义） | 手动跑 `ops-check-prod.ps1` 看明细；真慢就 `-PollMaxSeconds 900` 再来一次 |
| 线上老用户看到旧版 | 其浏览器内旧 SW 尚未更新（导航 network-first，一般刷新即新） | 先让用户刷新；仍旧则把 `https://<域名>/reset` 发给对方直接打开（302 → 独立清洗页，能穿透旧 SW 死锁，不必教开 F12）；也可让用户跑 `tools\clean-browser-cache.bat` |
| 某用户**每次**进站都闪一下 / 被重载一次 | 线上 `/version.json` 与 `index.html` 的 `__APP_VERSION__` 不一致（版本落点漏改） | 补齐五处版本号后重新发布；`ops-check-prod.ps1` 已能红灯拦下。快速自查：直接访问 `<域名>/version.json` 对比页面底部版本号 |
| 端口 3000 被占用启动失败 | 上次没正常退出 | GUI「强制释放 3000 端口」后重启 |
| GUI 找不到某按钮 | 用的是旧文档名字（标准启动/完整测试/开发模式…） | 对照 §0 名词表找新名；按钮旁有说明，悬停看 Desc |

---

## 6. 相关文档

- 项目入口与快速启动：[根 README](../../README.md)
- 文档中心：[docs/README.md](../README.md)
- GUI 按钮速查：[gui-button-reference.md](gui-button-reference.md)
- 运维脚本说明：[tools/ops/README.md](../../tools/ops/README.md)
- 单元测试与发布纪律说明：[根 README 发布纪律](../../README.md)
- 分支与版本发布策略：[branch-release-strategy.md](branch-release-strategy.md)
