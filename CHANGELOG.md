# Changelog

所有对本项目的重要变更都将记录在本文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本（Semantic Versioning）](https://semver.org/lang/zh-CN/)。

---

## [1.4.0] - 2026-09-06

### 新增

- **生产环境上线（v1.4.0 上线计划完成）**：Zeabur（Tencent Tokyo）+ PostgreSQL + HTTPS 正式对外，公网地址 `https://euriskotax.zeabur.app`
  - Prisma 迁移 PostgreSQL（迁移文件 `20260905_init_postgres`），生产 schema 与本地 `schema.dev.prisma`（SQLite）分离
  - 生产环境启动校验：`JWT_SECRET` 必须为强密钥、`DATABASE_URL` 必须指向 PostgreSQL，否则拒绝启动
  - Docker 部署链路：`Dockerfile`（node:22-slim + OpenSSL 修复 Prisma 引擎崩溃）、构建不再排除 images（修复线上 logo 丢失）、迁移锁 provider 修正为 postgresql（修复 P3019）、`index.html` 返回 no-cache（防新旧混搭）
  - 反向代理信任：`trust proxy` 修复 Zeabur 网关后限流把全站算作同一 IP 的问题
- **邀请码系统（一机一码）**：注册邀请码改为 `EURISKO-XXXX-XXXX` 格式（crypto 级随机），每个码仅可注册一个账号、事务内原子消耗
  - 服务启动时若 `InviteCode` 表为空自动兜底生成 20 个（幂等，重启不重复生成）
  - 管理员 API：`GET/POST /api/invites`（`X-Admin-Token` 认证，count 1-100）
  - GUI 开发控制台新增「一键邀请码管理」；生产令牌与本地令牌分离存储
- **注册邮箱验证码**：`POST /api/auth/send-code` 发送 6 位数字验证码（10 分钟有效、60 秒重发冷却、同 IP 15 分钟最多 5 次限流），数据库存哈希；注册需同时提供邮箱验证码 + 邀请码
- **运营统计概览**：`GET /api/stats/overview`（`X-Admin-Token` 认证）：注册数 / 计算次数 / 类型分布 / 近 7 日趋势
- **用户反馈接口**：`POST/GET /api/feedback`（登录后提交 bug/建议/评分）
- **PWA 离线化（阶段 9）**：`manifest.json`（standalone、192/512 + maskable 图标）+ `service-worker.js` v4
  - 应用壳预缓存（离线可打开）、CDN 资源 cache-first、同源 JS/CSS network-first、API 永不缓存
  - 离线检测顶部提示条；SW 更新提示 + 一键刷新；CDN 失败兜底
- **登录注册全流程完善**：用户协议与隐私政策弹窗（inline onclick）、UI 闪现修复、已注册邮箱发验证码时正确提示并引导登录、密码可见性切换图标、初始化遮罩修复
- **单元测试扩充**：新增 `home-page.test.js`（22）+ `profile-page.test.js`（38），总套件 6、总测试 203

### 修复

- fix(deploy): 限流在 Zeabur 反向代理下失效（全站共享配额）——`app.set('trust proxy', 1)`
- fix(deploy): `node:20` 镜像缺 OpenSSL 导致 Prisma 引擎崩溃——基础镜像换 `node:22-slim` + 安装 openssl
- fix(deploy): `.dockerignore` 排除 images 导致线上 logo/图标丢失
- fix(deploy): 迁移锁文件 provider 仍为 sqlite 触发 P3019
- fix(sw): JS/CSS 改为 network-first 策略，彻底解决强缓存导致的加载旧代码问题
- fix(auth): 初始化遮罩不消失、注册 UI 闪现、协议弹窗与事件重复绑定冲突
- fix(stats): 近 7 日趋势日期标签偏移一天
- fix(ops): 健康检查改用 `/health` 端点，避免被登录限流误判为宕机
- fix(gui): 邀请码生产令牌与本地令牌分离存储
- fix(test): `profile-page.test.js` fixture 缺少 auth 重构新增元素（forgot-password/send-code-btn/register-code/register-invite-code/user-name）导致 `setupAuthEventListeners` 抛错——补齐 fixture，203/203 恢复全绿

### 变更

- 注册入口不再接受固定邀请码，全部改为「向开发者获取一机一码」
- 健康检查端点从 `/api/health` 调整语义为根路径 `/health`（非 API，不受限流影响）
- 计算类 API（comprehensive/business/classification/reverse）当前未强制 JWT，历史记录类接口（history/:id）需 JWT

### 文档

- 全量文档同步至 v1.4.0 状态（2026-09-06）：README / docs 索引 / 开发计划 / API 参考 / 测试报告 / 交付清单 / 冷启动素材
- 修正营销素材邀请码文案（固定码 → 一机一码）

---

## [1.3.0] - 2026-08-15

### 新增

- **GUI 覆盖式滚动条 v3.2（精致 macOS 风）**：全面重构 GUI 滚动条，实现 Chromium/VSCode 级别的现代滚动体验
  - **超细**：常态视觉仅 5px，悬停/拖拽柔和增粗到 8px；命中区为完整原生条宽度（DPI 自适应），5px 细条也容易抓取
  - **高透明**：4 档 Alpha 不透明度（静止 0 完全隐藏 / 滚动中 85 / 悬停 155 / 拖拽 210），每帧 35% 收敛插值，无跳变
  - **精致**：胶囊圆角（两端半圆）+ 悬停双层柔光光晕（外层 0.35×alpha + 内层 1×alpha）+ 悬停宽度插值变粗
  - **智能隐藏**：macOS 风格，静止 1.1s 后自动淡出消失，画面干净；滚轮/拖拽/点击/翻页/键盘箭头均触发显示
  - **平滑动画**：60FPS 全局共享定时器，滑块位置 45%/帧收敛 + Alpha 35%/帧收敛 + 宽度 50%/帧收敛，三重插值
  - **白底覆盖**：主动画 Target.BackColor 填满 overlay 区域，彻底覆盖原生滚动条白底（根因修复）
  - **DPI 自适应**：使用 `SystemInformation.VerticalScrollBarWidth` 获取真实原生条宽度，125%/150% 缩放下不再漏白底
  - **滚轮转发**：overlay 捕获 MouseWheel 后直接计算目标滚动位置（跨 32/64 位无差异），避免原生滚轮事件被吞

- **GUI 桌面快捷方式图标优化**：logo 图片放大 1.5× 生成 `logo-zoomed.png`，多尺寸 ICO（256/128/64/48/32/24/16）独立缩放，小尺寸填充率最高 97%
  - 桌面快捷方式和任务栏图标视觉更饱满，不再因原图标空白边距导致显示过小
  - 新增 `Ensure-ZoomedIcoBuilt` 函数：源 PNG 更新后自动重建 ICO
  - 新增 `Invoke-IconCacheRefresh`：清理 `IconCache.db` + 广播 `SHChangeNotify`，强制 Windows 刷新图标缓存

- **GUI 启动器 UTF8 BOM 自动修复**：`EuriskoTax-Console.bat` 启动前自动检测并补充 UTF8 BOM
  - 解决 PowerShell 5.1 中文 Windows 环境下，Edit 工具保存后丢失 BOM 导致中文乱码、270 个连锁解析错误的问题

### 变更

- **GUI 滚动条架构**：从 Dock=Right 布局参与式改为绝对定位覆盖式（v2→v3.2），彻底消除与主内容面板的布局冲突
- **GUI 滚动条变量名规范化**：`$_overlayBgCache` → `$scrollBgBrush`（避免 `$_` 前缀在 scriptblock 中的解析歧义），`$HIT_W` → `$NATIVE_W`，`$THIN_W` → `$STRIP_W`，`$R_PAD` → `$STRIP_RPAD`

### 修复

- fix(gui): 滚动条底色为白色（非透明）的问题 —— 改为主动画 Target.BackColor 覆盖原生条区域
- fix(gui): `Panel.Selectable` 属性不存在（protected）导致运行时报错 —— 移除该行，`TabStop=false` 已足够
- fix(gui): 鼠标在滚动条区域滚轮无法滚动（事件被 overlay 吞掉）—— 直接计算滚动位置替代 SendMessage 转发
- fix(gui): `SystemInformation.VerticalScrollBarWidth` 在某些环境可能抛异常 —— 包裹 try/catch，异常时回退 17px
- fix(gui): `getScrollInfo`/`setScrollY` 在 Handle 未创建时崩溃 —— 增加 `IsHandleCreated` 检查
- fix(gui): 共享动画定时器无异常保护，单个 overlay 崩溃会影响所有滚动条 —— 包裹 try/catch + 自动清理已销毁的 overlay
- fix(gui): UTF8 BOM 缺失导致 PowerShell 5.1 中文乱码（270 个解析错误）—— 启动器自动补 BOM

---

## [1.2.0] - 2026-04-15

### 新增

- **GUI 公网地址速览卡片**：在「🚀 启动管理」Tab 顶部新增「🌐 公网地址速览」卡片
  - 每 3 秒自动刷新最新 cpolar 公网地址，从共享文件 `%TEMP%\euriskotax-last-cpolar-url.txt` 读取
  - 卡片支持一键复制到剪贴板（点击卡片主体即可）
  - 显示地址状态、刷新时间、操作提示（等待 / 已就绪 / 已变更）
  - 地址变更时颜色高亮 + 一键发送最新地址给朋友按钮

- **GUI 事件弹窗通知**：启动/分享期间以下 4 类关键事件会主动弹出 MessageBox 提醒
  1. URL_CREATED（公网地址首次生成）
  2. URL_CHANGED（公网地址变更）
  3. 邮件发送成功
  4. 邮件发送失败/未发送

- **邮件通知事件扩充**：在 notify-templates.json v3.2 中新增 **URL_CREATED** 模板
  - 标题：【EuriskoTax】公网分享地址已生成
  - 与 URL_CHANGED 同样附带新地址 + 测试账号信息
  - notifyOn 新增 `urlCreated` 开关，默认 true（首次分享时自动发邮件）

### 变更

- **cpolar 启动参数统一（临时隧道）**
  - 之前：`ops-start-dev.ps1` 使用 `http 3000 -region=cn`，`ops-watchdog.ps1` 使用 `start eurisko`（依赖用户预设命名隧道，若没配会启动失败）
  - 之后：**两个脚本都统一使用 `cpolar http 3000 -region=cn` 临时隧道**，无需任何 cpolar.yml 预设即可跑通
  - 避免了"GUI 启动分享不会启动 cpolar"的常见坑

- **GUI 弹窗全局 180s 去重（修复重复弹窗 N 次的问题）**
  - 新增 `$script:DedupPopup` + `Test-AllowPopup`：同一事件 key 在 180 秒内只允许弹 1 次
  - URL 首次弹窗的职责划归 `outHandler`；`Update-PublicUrlCard` 只负责"已变化"弹窗（通过 `UrlPopupMode` 与 `PublicUrlLastSeen` 互斥）
  - outHandler 命中 URL 事件后立即写 `PublicUrlLastSeen = $url`，避免后续定时器再误判为变化

- **GUI 子进程输出捕获增强：[GUI-EVENT] 双通道**
  - `ops-start-dev.ps1`、`ops-watchdog.ps1` 对关键事件（公网地址、邮件成功、邮件失败）除了 `Write-Host` 外额外 `Write-Output "[GUI-EVENT] ..."`
  - `RedirectStandardOutput` 与 `RedirectStandardError` 拆到独立文件，避免争用

### 修复

- fix(gui): 【启动 + 分享 + 自动重启 + 朋友联调推荐】按钮因 watchdog 使用命名隧道（eurisko）而 cpolar 起不来的问题（统一为临时隧道）
- fix(gui): URL 首次生成、地址变更、邮件成功/失败等事件重复弹窗 N 次的问题（全局 180s 去重 + 职责互斥）
- fix(gui): Write-Host 的关键信息 GUI 无法捕获的问题（全部改为同时 Write-Output [GUI-EVENT]）

---

## [1.1.0] - 2026-08-07

### 新增

- **悬浮税助手模块（Phase 4）**：全屏可拖拽的浮动按钮（FAB），点击展开半屏抽屉
  - 搜索框支持关键词模糊搜索（问题/关键词/分类/答案全文匹配），关键词高亮标注
  - 搜索联想下拉：focus 时显示历史，输入时实时匹配 Q&A，无匹配时显示空状态
  - 分类筛选：全部 / 综合所得 / 经营所得 / 分类所得 / 反向倒算 / 汇算清缴 / 政策法规，外加"我的收藏"
  - 28 条 Q&A 数据（综合所得 10 + 经营所得 5 + 分类所得 4 + 反向倒算 2 + 汇算清缴 4 + 政策法规 3）
  - 4 个快捷功能：税率表速查、年终奖测算、历史记录、使用帮助
  - 热门问题 chips：自动渲染标记为 hot 的 10 个条目，点击直达对应问答
  - 收藏 / 取消收藏：乐观更新本地 localStorage，后台异步同步到 MockApi
  - 反馈（有用/无用）：三态互斥记录，同类型再点取消，同步逻辑与收藏一致
  - 同步指示器：异步请求进行中按钮显示半透明 + 旋转动画，完成后自动消失
  - 失败回滚：MockApi 返回失败时自动撤销本地乐观更新，UI 恢复原状并打印 ERROR
  - 搜索历史持久化（最多 8 条），支持清空
  - FAB 拖拽支持：Pointer Events 统一点击/触摸，松手自动靠边停靠，位置存入 localStorage
  - 移动端全屏展示，PC 端右侧抽屉；深色模式自适应
  - 相关问题跳转：Q&A 展开后底部栏提供"去综合测算/去经营测算"等跳转入口
  - 键盘操作：Tab/方向键高亮联想项、Enter 执行搜索、ESC 关闭抽屉

- **通用 Mock 工具类（MockClient + Logger）**：封装为独立模块，所有业务模块可直接复用
  - `Logger`：级别过滤（0=DEBUG / 1=INFO / 2=WARN 默认 / 3=ERROR），带时间戳与分支标签
  - `MockClient`：可配置延迟范围（默认 80-200ms）、失败率（failRate）、强制失败次数（failNext）
  - 并发追踪：模块级全局递增 `reqId`，每次 request 发起瞬间分配，写入日志详情用于乱序场景溯源
  - 边界保护：`_latency()` 内置 `Math.max(0, ...)`，`latencyMin > latencyMax` 时不会产出负值
  - 统一请求日志：成功打 INFO、失败打 ERROR，均包含 reqId / payload / status / duration
  - 工厂 API：`Logger.create({ tag, level })` 与 `MockClient.create({ logger, latencyMin, latencyMax })`
  - 加载顺序：在 `index.html` 中放置于业务脚本（tax-assistant-ui.js）之前

- **单元测试扩充**：从 90 个增长到 143 个
  - `tests/tax-assistant.test.js`（35）：悬浮税助手全交互覆盖
  - `tests/tax-assistant-perf.test.js`（12）：高频点击、MockClient 复用、并发 reqId、延迟边界、搜索联想同步性
  - `tests/interaction.test.js`（45）：含参数提示初始化与交互专项
  - `tests/tax-calculator.test.js`（51）：计税核心逻辑（未变）

- **技术复盘报告**：`docs/tech-reports/mock-client-concurrent-logging-retrospective.md`
  - 并发日志乱序问题的成因分析、方案选型对比、最终实现、验证方式、可复用经验

### 变更

- `src/js/ui/tax-assistant-ui.js`：移除内联的 logger 与 MockApi 实现，改为消费全局 `window.Logger` 与 `window.MockClient` 工厂，对外暴露的 `window.TaxAssistant.mockApi` / `logger` 接口保持不变
- `index.html` 脚本加载顺序：新增 `src/js/data/tax-assistant.js`（Q&A 数据）→ `src/js/utils/mock-client.js`（Mock 工具）→ `src/js/ui/tax-assistant-ui.js`（UI 逻辑）
- 生产默认日志级别 `logger.level = 2`（WARN）：INFO 级高频日志静默，仅 WARN/ERROR 保留控制台输出
- 收藏/反馈同步指示器样式微调：`.api-syncing` 类按钮降低不透明度 + 旋转动画，视觉更柔和

### 修复

- 修复 MockClient 并发请求日志无标识导致的乱序溯源困难：引入模块级全局 `reqId`，每条请求发起瞬间分配，日志中清晰可追溯
- 修复 MockClient 延迟配置非法（`latencyMin > latencyMax`）时可能产出负值的边界问题，加入 `Math.max(0, ...)` 夹紧
- 修复 3 个源文件（auth-ui.js / helper-functions.js / app.js）缺少末尾换行的格式问题
- 修复 `src/js/utils/mock-client.js` 文件在某次写入时内容截断（仅剩 45 字节注释）的问题，重写完整文件并通过 `node --check` 语法验证 + 全量 143 测试通过

### 文档

- `docs/reports/test-report.md`：更新至 2026-08-05 / v1.1.0，4 套件 143 通过，新增税助手模块测试章节与浏览器交互验证结果
- `docs/reports/refactor-summary-report.md`：新增 Phase 4 悬浮税助手与 MockClient 工具封装章节
- `docs/reports/final-delivery-checklist.md`：版本升级为 1.1.0，质量验收标准 143/143

### 浏览器端实证（2026-08-05）

- 登录页 → 主页渲染正常：欢迎语 / 今日税感 / 4 种计税模式入口 / 税务提醒 / 小贴士
- 税助手浮按钮：点击展开抽屉，28 条 Q&A、分类标签、热门问题、快捷功能渲染完整
- 搜索联想：输入"年终"同步显示联想下拉 + 实时过滤 + 关键词高亮，不依赖任何异步延迟
- 收藏：乐观更新立即生效，MockApi 后台同步期间指示器动画流畅（80-200ms）
- 失败回滚：`failNext=1` 注入失败 → UI 自动回滚原状 → ERROR 日志含 `reqId`，链路完整
- 日志静默：`level=2` 高频点击控制台仅保留 WARN/ERROR，INFO 被正确抑制

### 已知问题 / 注意事项

- 性能测试用例中存在少量基于时间的断言（如 `< 200ms` / `< 500ms`），在机器高负载的 CI 环境下可能偶发抖动（flaky），非代码缺陷，可通过放宽阈值或稳定机器环境解决
- `backend-integration` 分支的真实登录流程依赖后端服务（localhost:3000），纯静态预览时快速登录会报 `ERR_CONNECTION_REFUSED`，可通过手动写入 `localStorage.auth_token` 等方式绕过以测试纯前端功能
- MockClient 不经过浏览器 Network 面板（非真实 XHR/fetch），排障需通过 Console 的 Assistant 日志 + reqId 追踪

---

## [1.0.0] - 2026-08-03

### 新增

- 综合所得正向计算：工资薪金 / 劳务报酬 / 稿酬 / 特许权使用费，含社保公积金、6 项专项附加扣除
- 经营所得计算：收入 - 成本费用 - 减除费用 6 万，200 万以下减半优惠
- 分类所得计算：利息股息 / 财产租赁 / 财产转让 / 偶然所得
- 反向倒算：三种模式（目标税率 / 目标月薪到手 / 目标税负均衡），二分法求解
- 预览条：每步输入实时更新关键数值（收入 / 扣除 / 税额）
- 步骤导航：进度条指示 + 步骤标题，支持回到指定步骤重算
- 深色模式切换、历史记录、用户鉴权（JWT）、前后端 API 客户端骨架
- 单元测试：3 套件 90 通过，带覆盖率报告
