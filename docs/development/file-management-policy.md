# EuriskoTax 文件管理规范（2026-08-16 v1.0）

> 本规范覆盖 EuriskoTax 项目**所有文件**的存放位置、命名规则、编码要求、修改流程、验证步骤。**任何文件新增 / 移动 / 删除 / 重命名 / 格式调整，必须先查阅本规范并严格按流程执行**。

---

## 一、目录结构总览（批准的固定结构）

```
EuriskoTax/
├─ README.md                          ← 项目主说明（仅根目录保留一份 README.md）
├─ CHANGELOG.md                       ← 版本变更记录（仅根目录保留）
├─ index.html                         ← 前端入口
├─ package.json / package-lock.json   ← 前端依赖
├─ zeabur.json                        ← PaaS 部署配置
├─ .gitignore                         ← Git 忽略规则（路径变更必须同步改）
│
├─ docs/                              ← 📚 全部 .md 文档（本规范核心目录）
│   ├─ README.md                      ← 文档入口索引（目录内 README 惯例）
│   │
│   ├─ api/                           ← API 参考类
│   │   └─ api-reference.md
│   │
│   ├─ guides/                        ← 🟢 使用指南 / 操作手册 / 参考手册
│   │   ├─ gui-button-reference.md    ← GUI 110 按钮功能参考（2026-08-16 审计基线）
│   │   ├─ tax-calculation-rules.md
│   │   ├─ responsive-rules-reference.md
│   │   └─ ui-component-reuse-guide.md
│   │
│   ├─ development/                   ← 🟡 开发规范 / 计划 / 工程决策
│   │   ├─ development-plan.md
│   │   └─ file-management-policy.md  ← ⭐ 本文档（你正在看的这个）
│   │
│   ├─ reports/                       ← 测试报告 / 交付清单 / 性能
│   │   ├─ test-report.md
│   │   ├─ refactor-summary-report.md
│   │   ├─ performance-optimization-report.md
│   │   └─ final-delivery-checklist.md
│   │
│   ├─ tech-reports/                  ← 🔵 专题技术报告 / 排查报告 / SOP
│   │   ├─ health-check-report-template.md
│   │   ├─ mock-client-concurrent-logging-retrospective.md
│   │   ├─ troubleshooting-sop-template.md
│   │   ├─ watchdog-deployment-guide.md
│   │   ├─ watchdog-notification-and-event-log-spec.md
│   │   └─ debug-mail-spam.md         ← 邮件密集发送问题排查
│   │
│   └─ admin/                         ← 🔴 敏感文档（含密码/密钥，必须 .gitignore）
│       └─ account-credentials.md     ← 所有账号密码统一管理
│
├─ logs/                              ← 📋 全部 .log 日志（git 忽略）
│   └─ README.md                      ← 日志目录说明 & 历史遗留说明
│
├─ server/                            ← 后端（Koa + Prisma）
├─ src/                               ← 前端 JS 源码（模块化按功能分子目录）
├─ tests/                             ← Jest 测试（performance/ helpers/ 子目录）
├─ images/                            ← 图片 / 图标 / ICO + 构建辅助 PS1
│
└─ tools/                             ← 🔧 辅助工具（带分类前缀）
    ├─ cpolar/                        ← cpolar 二进制
    ├─ gui/                           ← gui-* 前缀：GUI 工具
    │   ├─ gui-dev-console.ps1        ← GUI 主脚本
    │   ├─ _create_shortcut.ps1       ← 内部辅助（下划线前缀）
    │   ├─ EuriskoTax-Console.bat
    │   ├─ EuriskoTax-创建桌面快捷方式.bat
    │   ├─ README.md                  ← 工具内 README 惯例（目录级说明）
    │   ├─ tests/                     ← GUI 相关测试
    │   └─ gui-dev-console.ps1.bak    ← 备份（临时保留，定期清理）
    │
    └─ ops/                           ← ops-* 前缀：运维脚本
        ├─ ops-start-dev.ps1 / ops-watchdog.ps1 / ops-deploy.ps1 / ops-notify.ps1
        ├─ get-token.ps1 / debug-swagger.ps1 / __test-mail-spam-harness.ps1
        ├─ README.md                  ← 工具内 README
        ├─ ops-deploy.config.example.json / ops-notify-templates.json / ops-notify-reason-map.json
        └─ *.log                      ← ⚠ 历史遗留（过渡期保留，下次修改脚本迁到 logs/）
```

---

## 二、文档 (.md) 管理规范

### 2.1 文档分类归属（**必须放到对的二级子目录，不得堆在 docs/ 根目录**）

| 文档类型 | 归属目录 | 命名要求 | 示例 |
|---------|---------|---------|------|
| API 参考 | `docs/api/` | `<对象>-reference.md` | `api-reference.md` |
| 操作指南 / 手册 / 参考 | `docs/guides/` | `<主题>-guide.md` / `<主题>-reference.md` / `<主题>-rules.md` | `gui-button-reference.md` |
| 开发计划 / 规范 / 工程决策 | `docs/development/` | `<主题>-plan.md` / `<主题>-policy.md` | `file-management-policy.md` |
| 测试 / 交付 / 性能**报告** | `docs/reports/` | `<主题>-report.md` / `<主题>-checklist.md` | `test-report.md`、`final-delivery-checklist.md` |
| 技术专题 / 排查记录 / SOP | `docs/tech-reports/` | `<主题>-guide.md` / `<主题>-spec.md` / `debug-<主题>.md` | `debug-mail-spam.md`、`watchdog-deployment-guide.md` |
| 账号密码 / 密钥 / 部署凭证 | `docs/admin/` | `<主题>-credentials.md` | `account-credentials.md` |

### 2.2 允许的例外（.md 不在 docs/ 下的白名单）

| 路径 | 原因 |
|------|------|
| `/README.md` | 项目根主说明（GitHub/GitLab 默认显示首页）|
| `/CHANGELOG.md` | 项目根版本日志（IDE 默认识别位置）|
| `/tools/gui/README.md` | 子工具目录级 README（打开目录时第一屏看到）|
| `/tools/ops/README.md` | 子工具目录级 README |
| `/logs/README.md` | 日志目录说明（.gitignore 例外，logs/README.md 需保留，写 `!logs/README.md` 到 .gitignore？ 见 §6） |
| `/.trae/rules/git-commit-message.md` | IDE 规则，保留在 `.trae/` |

### 2.3 禁止

- ❌ 不在白名单的**散落在项目根目录的 .md**（例如 `debug-mail-spam.md` 原本就在根，违规）
- ❌ 堆在 `docs/` 根下的 .md（例如 `account-credentials.md` 原本就在 docs/ 根，违规；现迁到 `docs/admin/`）
- ❌ 一份文档两个副本（必须决定唯一真源，其余改跳链）

---

## 三、日志 (.log) 管理规范

### 3.1 统一输出目录

- **标准目录**：`$ProjectRoot/logs/`（已在 `.gitignore` 第 25 行忽略）
- **文件名**：见 `logs/README.md` 中的标准日志文件名表

### 3.2 过渡期兼容（2026-08-16）

- **历史遗留位置**：`tools/ops/watchdog.log`、`tools/ops/notify.log`、`tools/ops/events.log`
- **原因**：`ops-watchdog.ps1` / `ops-notify.ps1` / `ops-start-dev.ps1` 共 **30+ 行**代码用 `Join-Path $PSScriptRoot "xxx.log"` 硬绑定
- **处理策略**：
  - 本次不强制迁移（改路径涉及 5 个脚本 + GUI 查看日志按钮 + 多段硬编码说明文字，风险高）
  - **下次修改任一 ops 脚本时**：将 `$WatchdogLog / $EventLog / $NotifyLog` 三处统一改为 `Join-Path $ProjectRoot "logs\xxx.log"`，并同步调整：
    - GUI：L2783 / L2789 / L2795 / L2805（查看/清空日志按钮）
    - 文案：L1468 / L2427 / L2429 / L2432 / ops-start-dev L205 / L206 / L214 / ops-watchdog L138
    - `tools/ops/README.md`：L105 / L108 / L111 的示例命令
- **必须删除的重复日志**：项目根目录下 `watchdog.log` / `notify.log` / `events.log`（2026-08-16 已清理，是 GUI 异常工作目录产生的冗余副本）

---

## 四、辅助脚本（.ps1 / .bat）管理规范

### 4.1 位置（Hard Constraints 已固化）

| 分类 | 目录 | 前缀 | 示例 |
|------|------|------|------|
| GUI 相关 | `tools/gui/` | `gui-` | `gui-dev-console.ps1` |
| 运维相关 | `tools/ops/` | `ops-` | `ops-start-dev.ps1` |
| 内部辅助 | 同一工具目录 | 下划线前缀 `_` | `_create_shortcut.ps1` |
| 临时诊断脚本 | 任意相关目录 | `diag-` 或 `__test-` | `images/diag-scrollbar.ps1`、`ops/__test-mail-spam-harness.ps1` |
| 批处理入口 | `tools/gui/` / 根分发点 | 中文语义名，前缀 `EuriskoTax-` | `EuriskoTax-Console.bat`、`EuriskoTax-创建桌面快捷方式.bat` |
| 图片构建脚本 | `images/` | `build-` / `diag-` | `images/build-zoomed-logo.ps1` |

### 4.2 编码（Hard Constraints）

| 文件类型 | **强制编码** | 原因 |
|---------|-------------|------|
| `.ps1` (PowerShell) | **UTF-8 with BOM**（首 3 字节 `EF BB BF`） | PowerShell 5.1 无 BOM → 中文字符解码乱码 |
| `.bat` / `.cmd` | **GBK**（ANSI/OEM，CP936） | Windows cmd.exe 默认 GBK 解析 |
| `.json` | UTF-8 (无 BOM) | JSON 标准 |
| `.md` / `.js` / `.html` / `.css` | UTF-8 (无 BOM) | 跨平台通用 |

### 4.3 Edit 工具丢失 BOM 陷阱（⚠ 高优先级经验）

每次用 IDE 的 Edit / Write 工具链修改 `.ps1` 文件后：**必须立即重验证文件首 3 字节并修复 BOM**（当前 Edit 实现会剥离 BOM）。可靠修复方式（**禁止用文本重保存方式**，避免中文二次漂移）：

```powershell
$f = "path\to\script.ps1"
$b = [IO.File]::ReadAllBytes($f)
$hasBom = ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF)
if (-not $hasBom) {
    $bom = [byte[]](0xEF, 0xBB, 0xBF)
    $nb = New-Object byte[] ($b.Length + 3)
    [Buffer]::BlockCopy($bom, 0, $nb, 0, 3)
    [Buffer]::BlockCopy($b, 0, $nb, 3, $b.Length)
    [IO.File]::WriteAllBytes($f, $nb)
}
```

已两次受害：`ops-start-dev.ps1`、`_create_shortcut.ps1`

### 4.4 验证：每次修改 .ps1 后的语法检查

```powershell
$tokens=$null; $errors=$null
[System.Management.Automation.Language.Parser]::ParseFile(
  "tools/gui/gui-dev-console.ps1", [ref]$tokens, [ref]$errors
)
# $errors.Count 必须 = 0
```

---

## 五、GUI 启动链 & 文件引用约定

### 5.1 单窗口启动（Hard Constraints 新增强制）

| 启动方式 | Target / 命令 | 必须参数 | 禁止 |
|---------|--------------|---------|------|
| bat 双击 (`EuriskoTax-Console.bat`) | `start "EuriskoTax" powershell.exe ...` | `-WindowStyle Hidden -STA -File "<abs>\gui-dev-console.ps1"` | 禁止用同步 `powershell.exe -File`（cmd 窗口残留直到 GUI 关闭）|
| 桌面快捷方式 .lnk | `powershell.exe`（直接）| `-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "<abs>\gui-dev-console.ps1"` | 禁止 TargetPath 指向 `cmd.exe` / `%ComSpec%`；禁止用 `-Command`（会破坏 `$PSScriptRoot` 解析）|

### 5.2 GUI 按钮 → 文档路径引用

GUI 中所有 `Start-Process (Join-Path $ProjectRoot "docs\...")` 必须与 §2 目录结构保持一致。2026-08-16 已验证 3 处（L3155/3156/3563）改为 `docs/admin/account-credentials.md`。

**每次移动文档后，必须全局搜索路径引用：**
```powershell
Select-String -Pattern "docs[\\/]account-credentials" -Path . -Recurse -Include *.ps1,*.md,*.js
```

---

## 六、.gitignore 同步规则

**任何文件移动（特别是敏感文件 / 日志）必须同步修改 `.gitignore`。**

2026-08-16 已确认的路径：
```gitignore
# 敏感文档（账号密码）
docs/admin/account-credentials.md

# 通知 / 部署配置（含 SMTP/SSH 凭据）
tools/ops/notify.config.json
tools/ops/ops-deploy.config.json

# 日志目录 & 所有 .log 文件
logs/
*.log

# 如果 logs 目录要保留 README.md，需在下一行追加（取消注释）
# !logs/README.md
```

如果以后决定 `logs/README.md` 必须入库，把最后一行取消注释（`!logs/README.md`）并提交一次。

---

## 七、文件变动标准流程（Checklist）

### 7.1 新增文档 / 日志 / 脚本

- [ ] 决定新文件的**准确归属目录**（查 §1 结构图 + §2/§3/§4 分类表）
- [ ] 命名符合规范（语义化 + 合适的前缀/后缀）
- [ ] 编码符合 §4.2（特别注意 .ps1 要有 BOM、.bat 要是 GBK）
- [ ] 是敏感文件？ 加到 `.gitignore`（§6）
- [ ] 新增 GUI 按钮引用它？ 路径写对并全局搜旧路径
- [ ] 如果是日志：更新 `logs/README.md` 文件名表

### 7.2 移动 / 重命名现有文件

- [ ] 全局路径引用搜索（GUI .ps1 + 其他 .md + README + .js + .bat + .gitignore）：
  - `docs/<old>` → 所有引用都要改
  - `.log` 路径 → 检查 `Join-Path $PSScriptRoot` / `$OpsDir` / `$ProjectRoot` 三处写死
- [ ] `.gitignore` 同步更新（特别是敏感文件）
- [ ] GUI 按钮 `.Desc` 中涉及路径的**文字描述**一起改（这是最容易漏的！）
- [ ] 文档中的「相关链接」章节加一条重定向说明（旧文档放个「已迁移」说明，保留 1 个版本后再删）

### 7.3 删除文件

- [ ] 确认无其他文件引用（§7.2 同款搜索）
- [ ] 是目录级 README？ 除非目录删除，否则不要删
- [ ] 是敏感文件？ 确认 `.gitignore` 未把它漏出去

### 7.4 修改 .ps1 脚本编码相关

- [ ] 改完后立刻重检 BOM（§4.3）
- [ ] 语法校验 `[Parser]::ParseFile` 无错误（§4.4）
- [ ] 修改了日志路径？ GUI 查看日志按钮 + 清空日志按钮 + 所有说明文字一致（30+ 处检查点见 §3.2）

---

## 八、变更历史

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-08-16 | 1.0 | 首次发布。固化目录结构；修复 4 份零散文件位置（`account-credentials.md → docs/admin/`、`debug-mail-spam.md → docs/tech-reports/`、清理根目录冗余 3 个 .log、建立 `logs/` 目录说明）；新增 `.ps1` BOM 验证 SOP；新增 GUI 按钮路径联动清单 |
