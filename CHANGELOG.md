# Changelog

所有对本项目的重要变更都将记录在本文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本（Semantic Versioning）](https://semver.org/lang/zh-CN/)。

---

## [未发布] 防旧版残留加固（版本哨兵 + 排障短链 + 排障话术库后台可管理）+ 公积金默认基数对齐社保 + 综合所得汇算「税前收入」口径修正 + 个人中心/管理台样式修复

> 直接提交 main（防旧版残留加固 + 前端口径/文案调整/样式修复）。

### 新增
- **版本哨兵 `StaleGuard`**：`index.html` 启动时以 `cache: 'no-store'` 拉取根目录 `version.json`，与本页 `window.__APP_VERSION__` 比对；不一致即自动注销全部 Service Worker、清空 Cache Storage 并重载，用户无感自愈。用 `sessionStorage` 防抖（本次会话只自愈一次），本地开发（localhost/127.0.0.1）不启用以免打断热更新
- **排障短链 `GET /reset`**：302 跳转 `/clean-cache.html?auto=1`，用于口播、客服话术与群公告发放；定义在 SPA 回退之前，避免被 `index.html` 兜底吞掉
- **`version.json`**：新增版本哨兵基准文件（`server/src/app.js` 的 `setHeaders` 已对其下发 `Cache-Control: no-cache`；`service-worker.js` 对其放行，不缓存、不拦截）
- **排障话术库改为后端可管理（阶段12）**：新增 `SupportScript` 模型（迁移 `20260912_add_support_scripts`，随部署自动执行）与 `/api/admin/support` 接口（列表 / 新建 / 编辑 / 删除 / 恢复内置，均需 `X-Admin-Token`）；管理台新增 `support` Tab，支持增删改、一键复制话术、关键词检索与分类筛选，话术中的 `{RESET_URL}` 占位符自动替换为当前站点的 `/reset` 短链。内置 9 条高频问题在服务启动时幂等播种（**仅当表为空**，不覆盖后台编辑），此后改文案即时生效、无需发版；接口不可用时前端自动回退离线快照，面板不会空白
- **客服排障手册**：`docs/guides/support-playbook.md`

### 变更
- **住房公积金默认基数 4250 → 7546**：与社保默认基数保持一致，同步正向计税、反向倒算、经营所得三处表单默认值与重置逻辑，以及税务档案默认公积金基数；派生公积金金额随基数联动为 377.30（7546 × 5%）。最低基数校验常量 `MIN_HOUSING_FUND_BASE = 4250` 不变（仍作低于标准的提示阈值）
- **预算表汇总行「全年收入额」更名为「税前收入」**：正向汇算、反向单模式、反向多模式三处表格统一标签

### 修复
- **计算历史空态不显示**：`loadHistoryToList` 无记录时先清空列表容器，而 `#profile-history-empty` 是其子节点被一并移除，「暂无计算记录」永不显示；现改为清空后按需挂回
- **个人中心卡片样式统一**：用户横幅卡、底部操作卡、功能模块卡片不再混用 `.card` 自定义类，统一改为内联 Tailwind 工具类（`bg-white rounded-lg shadow-card`），消除 `.card` 自带 padding/flex 在个人中心造成的白边与对齐问题（`index.html`、`src/js/auth/auth-ui.js`）
- **「公告与更新」点击无响应 + 无限请求**：`ContentCenterUI.openNoticeList` 在内容为空时递归调用自身且条件恒成立，导致无限请求 `/content/feed`（实测 429）；现只重试一次，弹窗正常显示「暂无公告内容」
- **管理台 Tab 样式修复**：`admin.html` 中 `.tab-btn` 使用 `@apply` 但 `<style>` 未声明 `type="text/tailwindcss"`，导致 Tailwind Play CDN 未处理，Tab 按钮失去 padding/radius/font 等样式；已修正为 `<style type="text/tailwindcss">`
- **综合所得汇算汇总行「名称与真实计算不一致」**（`src/js/calculation/utils.js` `updateBudgetTable`）：
  - 「税前收入」原取 `incomeDetails.total`（即综合所得**收入额**——劳务报酬/稿酬/特许权使用费已按 80%/70% 折算），名不副实；现改为 `incomeDetails.preTaxTotal`（工资薪金 + 劳务报酬 + 稿酬 + 特许权使用费 + 年终奖的税前收入合计），与结果页「税前年收入」口径一致
  - 「应纳税所得额合计」原由「税前收入 − 年度扣除合计」反推，存在 20% 费用扣除时不成立；现直接取 `taxDetails.taxableIncome`
  - 「累计预缴税额」「应退/补税额」原自行重算（且把年终奖单独计税税额计入综合所得预缴），与结果区口径不符；现直接取 `taxDetails.prepaidTax` / `taxDetails.refundTax`，与结果区一致，并支持用户手动填写的预缴税额
- **计算器步骤按钮移动端排版拥挤**：综合所得（3 步）、反向倒算（2 步）、经营所得（2 步）、分类所得（1 步）共 8 处步骤操作按钮组原用 `flex justify-between`，窄屏下按钮相互挤压、文字换行、主次操作错位；现统一为响应式布局（`flex-col md:flex-row` + `gap-3` + `whitespace-nowrap` + `w-full md:w-auto`），小屏垂直堆叠全宽、中大屏水平排列（`index.html`）
- **发版后仍看到旧页面（旧 SW 滞留）**：注册 SW 补 `updateViaCache: 'none'` + 注册后 `reg.update()`

### 测试
- 单元测试 295/295 通过（12 套件）
- 新增 `tests/support-scripts.test.js`（19 项）：内置话术种子契约 6 项（分类合法 / `script_id` 唯一 / 必填非空 / `{RESET_URL}` 写法统一 / 各分类均有话术）+ 请求体归一化契约 13 项（`steps` 换行拆分含 CRLF 与封顶、`buildData` 新建校验、PATCH 部分更新语义——只改传入字段）
- `tests/profile-page.test.js` 税务档案默认公积金基数断言 4250 → 7546

---

## [1.8.0] - 2026-09-11（内容/公告中心：分层投放 + 定时上线 + 运维后台内容管理）

### 新增
- **内容/公告中心模型**：新增 `ContentItem`（`item_id` 幂等键、`type` = policy/announcement/operation、`audience` = all/free/pro、`placements` 展示位 JSON、`status` = draft/published/revoked、`publish_at`/`expire_at` 时间窗、`priority` 排序、`hot`、`link_url`/`link_text`、policy 专用 `question`/`answer`/`category`/`keywords`）与 `ContentRelease`（`version` 唯一、`notice` 端上提示文案）；生产 PostgreSQL 与本地 SQLite 双 schema 同步，迁移 `20260911_add_content_center`
- **内容分层投放（audience）**：游客仅 `all`；基础版 `all + free`；专业版/体验版 `all + free + pro`。**政策要点（policy）默认面向全体用户（含游客）**，运营内容（operation）/更新公告（announcement）按需逐条选择档位
- **生命周期（定时上线/自动过期）**：条目可预约 `publish_at`（未到时间自动隐藏）与 `expire_at`（到期自动下架），无需定时任务——由端上可见性判定实时生效
- **公开只读端点**：
  - `GET /api/content/tax-policy?since=<revision>`——政策要点（内置 QA 快照之上的增量覆盖层），返回可见条目 + 不可见条目的 `deleted` 墓碑供客户端摘除；`since` 与当前载荷指纹一致时返回空 `items`（增量语义）
  - `GET /api/content/feed?placement=home_banner|modal|notice_list|assistant_qa`——公告/运营内容，按展示位 + 登录态分层返回
  - 两端点均公开只读、可携带 `Authorization` 分层；响应 `revision` 为内容载荷指纹（md5 前 12 位），内容有实质变动才变化
- **`optionalAuth` 中间件**：有 token 挂 `req.user`，无/invalid token 静默放行，供公开但分层的端点使用
- **`contentService`**：audience 解析、时间窗可见性、policy/feed 载荷构建、`revision` 指纹
- **运维后台内容管理**：`admin.html` 新增「内容」Tab（筛选/列表/编辑器：类型、档位、展示位多选、时间窗、优先级、正文）；`admin.js` 提供 `loadContent/saveContent/deleteContentItem/publishContentItems`；管理端点 `GET/POST /api/admin/content`、`PATCH/DELETE /api/admin/content/:id`、`GET/POST /api/admin/content/releases`（全部要求 `X-Admin-Token`）
- **前端内容中心 UI**：新增 `src/js/ui/content-center-ui.js`（`window.ContentCenterUI`）——启动弹窗（`modal` 展示位，本地记已读）、首页公告条（`home_banner`，可关闭、按 `priority` 降序）、个人中心「公告与更新」列表（`notice_list`）
- **`seed-content.js`**：将仓库内 `server/data/content/tax-policy.json` 幂等导入 `ContentItem`，该 JSON 退役为纯种子源（运行时不再读盘）
- **测试**：新增 `tests/content-admin.test.js`（13 项）；重写 `tests/tax-policy.test.js` 为阶段11 语义；`tests/profile-page.test.js` 个人中心卡片 7 → 8（新增「公告与更新」）

### 变更
- **政策要点由「专业版功能」改为「全体用户（含游客）」可见**：`tax-policy.js` 取消免费版短路、游客也发起请求；`plan.js` 的 `PRO_FEATURE_HINT` 与 `auth-ui.js` 多处分层 CTA 文案移除「政策更新」表述
- **`tax-policy.js` 重写为内容中心同步模块**：新增 `syncFeed/getFeed/pendingModalNotices/markModalSeen/homeBannerItem/dismissHomeBanner/noticeList/triggerSync`；`auth-ui.js` 钩子 `triggerPolicySyncIfPro` → `triggerContentSync`（登录/恢复后无条件触发）
- **缓存头安全**：内容端点响应 `Cache-Control: private, no-store` + `Vary: Authorization`，避免 CDN/共享缓存把专业版内容串给游客
- 内容端点不占业务限流配额（`contentLimiter.skip` 覆盖 `/tax-policy`、`/feed`）

### 修复
- **阶段10B 内容缓存丢数据**：旧实现只把 `version`/`notice` 写入 `taxPolicyCache`，刷新后覆盖层内容丢失，且 `since` 恒等于缓存版本导致永不再拉。现改为持久化 `overrides` 并在启动时 `replay()` 重放，配合 `revision` 增量与新鲜期后强制全量，保证撤回/过期即时生效

### 文档 / 门禁
- `verify-local-auth.js` 更新阶段11 前端资源静态断言（内容中心 UI、DOM、auth-ui 钩子、plan.js 去专业版表述）与内容端点断言（`version+revision`、`since` 增量、`private/no-store` + `Vary`、feed、展示位过滤），`request()` 增加响应头回传
- `tools/ops/ops-check-prod.ps1` 线上指纹同步至阶段11（内容中心脚本/DOM、auth-ui `triggerContentSync` + `profile-card-notices`、`tax-policy.js` `syncFeed/triggerSync`、admin 内容 CRUD、`tax-policy` 端点 `revision` + `feed` 端点）
- 新增 `tools/ops/ops-seed-prod.js`：走运维后台 API（`X-Admin-Token`）把 `tax-policy.json` 幂等补种进**生产库**——阶段11 端点改读库后，换新库/重置生产库若不补种，内容端点会返回 `version` 空 + `items=0`，导致线上指纹门禁假失败。`ops-publish.ps1` 在线上核对轮询的间隙自动调用（Token 取 `ADMIN_TOKEN_PROD` 或 `server/.env`；拿不到自动跳过、补种失败只告警不阻断），并新增 `-NoSeedProd` 开关可临时关闭

---

## [1.7.2] - 2026-09-11（汇算清缴口径修正 + 社保基数默认值 + 反向倒算 0 元）

### 修复
- **税前 / 税后年收入口径不一致**：结果页「税前」原取「综合所得收入额」（劳务报酬/稿酬/特许权使用费已按 80%/70% 折算后的金额），而「税后年收入」按税前收入合计扣除税额计算，两者基数不同——含劳务等收入时甚至会算出税后 > 税前。现将「税前年收入」统一为税前收入合计，「税后年收入」扣除综合所得应纳税额与年终奖单独计税税额
- **综合所得汇算「应退/应补」错误**：预缴税额此前默认取输入框的 0，自动推演被跳过，任何场景都显示「应补 = 应纳税额」；且年终奖单独计税税额被误计入综合所得预缴，产生等额虚增退税。现修正为：
  - 预缴税额输入留空（或填 0）时按源泉扣缴规则自动推演：工资薪金累计预缴 + 劳务报酬/稿酬/特许权使用费预缴（这三类所得必然产生预缴税，无综合所得应纳税额时必然退税）
  - 年终奖单独计税税额不计入综合所得预缴，汇算「应退/应补」仅比较综合所得应纳税额与综合所得预缴
  - 「不退不补」改为按浮点容差（差值 < 0.005）判定，避免四舍五入误差误判为应退/应补
- **反向倒算最低档无法得到 0 元应纳税所得额**：3% 档位保守模式此前强制最小 1 元，现允许应纳税所得额为 0 元（0–36000 元均适用 3% 税率）

### 变更
- **社保缴费基数默认值 4250 → 7546**：同步正向计税、反向倒算、经营所得三处表单默认值与重置逻辑，以及税务档案默认社保基数；派生社保金额（养老/医疗/失业）随基数联动为 603.68 / 150.92 / 37.73
- 预缴税额字段提示补充「留空自动估算」说明；从历史记录恢复时不再把自动推演值写回输入框

### 测试
- 单元测试 252/252 通过（`determinePrepaidTax` 用例更新为新口径）

---

## [1.7.1] - 2026-09-11（本地 SQLite 搜索修复 + 门禁 52/52 + 文档口径收口）

### 修复
- **运维后台用户搜索 `GET /api/admin/users?q=` 在本地 SQLite 下 500**：Prisma 的 `mode: 'insensitive'` 不被 SQLite 连接器支持，带关键词的查询会被判为非法参数（生产 PostgreSQL 正常，仅本地开发库暴露）。改为按数据源协议构造查询条件：`file:`（本地 SQLite）走 `LIKE`（本身对 ASCII 不区分大小写），生产 PostgreSQL 保留 `mode: 'insensitive'`，两端搜索语义一致
- **发布脚本自动打标签失效**（`43d09cd`）：`node -p` 传 Windows 反斜杠路径被当转义、PS5.1 按 ANSI 读 UTF-8 导致中文吞引号，version 读不到 → 标签永远被跳过

### 变更
- `verify:local` 扩至 **52/52 通过**（新增 10 项断言）
  - 反馈附图链路：合法 data URL 落库、非图片与超 3 张被拒（400）、用户端与运维后台均能取回附图
  - 阶段10 运维后台用户端点：无令牌 401、列表搜索（大小写不敏感且响应不含密码字段）、详情（反馈/计算计数 + 最近动态）、权益授予限时专业版 → 回落基础版（小节结束时自动恢复 dev 账号种子授权）
- 同步修正 README / 开发工作流 / GUI 文档中已过期的门禁断言数（20/42 → 52）、单元测试套件数（203 → 252）与线上核对项数（10 → 22）
- 版本口径收口：README / 文档中心 / API 参考 / 开发计划 的版本与发布日期同步至 **1.7.1**（此前仍停留在 1.6.1）
- 分支收口：`feature/10a-cloud-sync` 按 [分支规范](./docs/guides/branch-release-strategy.md)「合完删除本地与远程分支」清理本地与远程分支（合入提交 `f33d694`，历史由 tag `v1.7.0` 承担）

---

## [1.7.0] - 2026-09-10（阶段10：免费/专业版体系 + 运维后台）

> 里程碑：M1 后端地基（a29bd12）→ M2 前端同步链路（8f3195a）→ 10B 政策要点与汇算清缴报告 → 运维管理后台 + 反馈附图。
> 核心原则：计税能力永不锁定，锁的是云端增值（历史同步）。

### 新增
- **账户分层模型（阶段10）**：`User` 增 `plan`（free/pro，默认 free）、`plan_expires_at`（null=永久）、`pro_granted_by`（seed/invite/admin/purchase）；生产 PostgreSQL 与开发 SQLite 双迁移
- **种子期专业版授权 `SEED_GRANT_PRO`**：开启后注册/登录即授予 `pro`（`pro_granted_by="seed"`），存量 free 账号登录自动升级；`GET /auth/profile` 返回 plan 相关字段
- **云端历史同步端点 `POST /api/calculations/sync`（专业版）**：按 `(user_id, client_id)` 幂等 upsert + 全量拉取；`updatedAt` 新者胜解决多端冲突；删除以墓碑（`deleted_at` 软删）广播到其它设备，30 天自动清理；云端活跃历史 500 条上限（超限 409 `HISTORY_LIMIT_REACHED`）；免费账号 403 `PRO_REQUIRED`（计税不锁）
- 同步端点限流（20 次/分/IP）、Swagger 文档注释、错误响应带业务 `code` 字段

### 新增 · 前端同步链路（里程碑 2/2）
- **`src/js/auth/plan.js`（PRO 判定模块）**：`window.EuriskoPlan.isPro(plan, planExpiresAt)`——`pro` 且未过期判定，`plan_expires_at` 为 null/畸形值按永久授权容错（种子期 `granted_by=seed`）
- **`src/js/data/history-sync.js`（云同步引擎）**：挂 `window.EuriskoSync`，提供 `restore/afterLogin/afterLogout/updateUser/syncNow/getState`；保存/删除后防抖（1.5s）自动同步；本地 `taxCalculationHistory` 仍为唯一数据源，云端仅镜像；`pure` 子对象暴露纯函数 `normalize/toPayload/mergeCloud`（单测）；墓碑仅对「云端已知 clientId」广播；401 自动登出回登录页、PRO_REQUIRED/HISTORY_LIMIT_REACHED 中文提示、离线失败保留本地自动重试；事件信号 `euriskotax:history-mutated/synced/sync-status`
- **保存/删除挂钩**：`data-management.js` 与 `tax-calculator.js` 保存时写入 `updatedAt` 并派发 `euriskotax:history-mutated`；删除时调 `EuriskoSync.recordLocalDelete`
- **UI 分层呈现（auth-ui.js / index.html）**：顶栏与个人中心 plan 徽标（专业版/免费版）、个人中心云同步状态卡片（免费 gate 提示 / 同步中 / 已同步 / 错误）+「立即同步」按钮；登录成功自动触发同步、登出清理同步元数据、页面恢复防抖拉取（换机/重装找回）；`current_user` 解析 `plan/plan_expires_at`，profile 刷新后更新引擎
- **可测性**：`window.__EURISKO_SYNC_API_BASE__` 覆盖同步 API 地址（沙箱/联调用）；引擎不依赖 DOM 的纯逻辑全部抽到 `pure`，Jest 直接单测

### 变更
- `verify:local` 升级为 6 步门禁：新增前端静态断言（plan/history-sync 脚本、云同步 DOM、保存信号）与**引擎沙箱 e2e**（`server/scripts/verify-cloud-sync-engine.js`：A 设备本端上传 → B 设备空本地拉回），本地 **35/35 通过**
- `npm test` 新增 `tests/plan.test.js`、`tests/history-sync.test.js` 单测套件（幂等/冲突/墓碑/合并/永久授权边界），全套 220/220 通过

### 修复
- `verify-cloud-sync-engine.js` 在 Windows 退出崩溃（退出码 3221226505）：沙箱内改用原生 `http` 轻量 fetch（`agent:false` 连接即用即关），规避 undici keep-alive socket 在 `process.exit` 时触发 libuv `UV_HANDLE_CLOSING` abort

### 新增 · 政策要点更新（阶段10B）
- **政策内容公开端点 `GET /api/content/tax-policy`**：只读静态数据、无需登录、不占业务限流配额（独立宽松 120 次/分限流）；内容源为仓库内 `server/data/content/tax-policy.json`（运维改文件随发布上线、免重启热更新）；`?since=<version>` 版本一致返回空 items（增量语义）；支持 5 分钟内容缓存
- **`src/js/data/tax-policy.js`（政策更新同步）**：专业版登录/恢复会话后静默拉取增量；内置 `window.TAX_ASSISTANT_QA` 快照仍为免费离线全量基准；按 id upsert 合并（覆盖更新 / 新增 / `deleted:true` 撤回），写 `taxPolicyCache` 缓存版本与通知文案；免费版不发起任何请求；触发 `euriskotax:policy-updated` 事件；`window.__EURISKO_SYNC_API_BASE__` 可覆盖 API 地址
- **UI 提示**：tax-assistant 悬浮抽屉顶部「政策要点已更新」提示条（版本前进且未读才显示，可手动关闭、登出/注销随会话清理），登录/恢复钩子（auth-ui `triggerPolicySyncIfPro`）

### 新增 · 专业版汇算清缴报告 PDF（阶段10B）
- **`src/js/export/final-report.js`（`EuriskoReport`）**：专业版报告编排 = 品牌封面（报告标题 + 期间 + 报告对象）→ 收入与税前扣除明细（复用现预算表明细核心）→ 税负对比图（Chart.js 柱状 + 柱顶数值标注，html2canvas 截图前绘制）→ 政策要点/注意事项（从政策库按计算类型挑选）→ 免责声明页；输出 `汇算清缴报告_YYYY-MM.pdf`
- **免费/专业分流**（同一导出按钮）：综合所得与经营所得「导出PDF报告」按钮经 `EuriskoReport.exportFinalReport` 分流——免费/未登录原样保留既有预算表 PDF（无能力倒退），专业版出汇算清缴报告；反向倒算/分类所得按钮保持原样
- `exportToPDF` 支持可选 `opts`（`contentBuilder/beforeCapture/filename`），默认行为完全不变
- `verify:local` 升级到 **42/42 通过**：新增 10B 前端静态断言（tax-policy/final-report 资源与脚本、auth-ui 钩子、tax-assistant 快照）与政策内容端点 e2e（公开内容 + since 增量语义）
- `npm test` 新增 `tests/tax-policy.test.js`、`tests/final-report.test.js`（免费不请求 / pro 增量 / 合并撤回 / 横幅状态 / 文件名规则 / 税负结构 / 政策挑选 / 报告编排冒烟），全套 **252/252 通过（10 套件）**

### 新增 · 账户设置改密改走邮箱验证码

- **账户设置页交互重构**：手机号改为「独立保存」即时生效（部分更新语义，不再依赖页面级提交）；修改密码不再输入「当前密码」，改为复用登录邮箱验证码链路（`POST /auth/send-reset-code` + `POST /auth/reset-password`，60 秒冷却、验证码一次性），与注册/找回密码体验统一
- 移除旧「手机号 + 密码统一提交」遗留的页面底部「取消 / 保存修改」全局条
- 登录成功、退出登录不再弹模态确认框（顶栏用户名/版本徽标、登录页重现即为反馈），减少无意义打断

### 新增 · 运维管理后台（`admin.html`）

- **`admin.html` + `src/js/admin/admin.js`**：独立运维后台页，全请求带 `X-Admin-Token`（= 环境变量 `ADMIN_TOKEN`）；四个 Tab：运营总览 / 反馈处理（含附图预览与状态跟进）/ 用户权益 / 兑换码
- **用户管理端点**：`GET /api/admin/users`（关键词 `q` 匹配用户名/邮箱 + `plan` 过滤 + 分页）、`GET /api/admin/users/:id`（含反馈/计算条数与最近动态）、`PATCH /api/admin/users/:id/plan`（补发 14 天体验 / 按天开通 / 授予永久 / 回落基础版，`grantedBy` 默认 `admin`）

### 新增 · 意见反馈支持附图

- **`Feedback.attachments`**（迁移 `20260909_add_feedback_attachments`）：存前端压缩后的图片 data URL（最多 3 张、仅 png/jpeg/webp、单张 ≤900K 字符），默认 `'[]'` 自动兼容旧数据行
- 提交侧强校验（数量超限 / 类型不符 / 过大一律 400，防脏数据与库容滥用）；反馈日志追加附图张数；管理员反馈列表返回该字段

---

## [1.6.1] - 2026-09-08

### 新增
- **一键缓存清洗页 `clean-cache.html`**：根治旧版 Service Worker / 页面缓存残留导致的"看不到新功能、旧 JS 反复命中缓存"问题；GUI 开发控制台"快速访问"新增一键打开入口
- **弹窗健壮性**：所有通用弹窗（帮助/确认/关于/反馈等）统一挂载到 `body` 顶层，并内联通用弹窗函数，登录页/任意容器隐藏下均可正常弹出

### 修复
- 弹窗嵌套时显示异常（help/confirm/about 等在隐藏的 `app-container` 内无法弹出的问题）
- `ops-check-prod` 修复函数内作用域解析失败导致的崩溃

### 变更
- **登录/注册/找回密码表单文案与校验优化**：注册页必填项标注（未填时标红提示、填写后恢复）；"记住我"等提示改为正式文案；弹窗提示文案统一为正式表述；隐藏尚未实现的微信/QQ 绑定登录 UI
- 用户协议/隐私政策/重置密码提示中的开发者联系邮箱更新为 2044781167@qq.com
- Dockerfile 默认改用 DaoCloud 镜像源，加速构建镜像拉取

---

## [1.6.0] - 2026-09-07

### 新增
- **意见反馈落库闭环**：新增 `Feedback` 表，`POST /api/feedback` 真正持久化（此前仅打日志）；个人中心新增"意见反馈"卡片（登录后可见）：Bug/建议分类 + 1-5 星评分 + 5000 字内容
- **管理员反馈跟进**：`GET /api/feedback/admin?status=` 列出反馈（含提交人信息）、`PATCH /api/feedback/admin/:id` 标记 open/resolved/closed，均走 `X-Admin-Token`
- **匿名计算埋点**：登录用户在保存计算后仅上报"计算类型"（comprehensive/business/classification/reverse），日粒度聚合入 `CalcEvent` 表；不含任何收入/扣除输入数据，失败静默不阻塞、离线不积压
- `GET /api/stats/overview` 的计算次数/今日/类型分布/近7日改读 `CalcEvent` 聚合表（v1.5.1 清理落库死代码后原恒 0），响应结构不变，冷启动每日 curl 观察即刻可用

### 变更
- `requireAdmin`（X-Admin-Token 校验）抽为独立中间件 `middleware/adminAuth.js`，统计/邀请码/反馈管理共用，避免从控制器互相引用
- 埋点接口 `POST /api/stats/events` 单独限流（300 次/10 分钟/IP）
- 隐私政策更正"使用数据"表述：计算记录本地优先、不自动上传；登录后仅匿名统计计算类型/次数（不含具体输入）
- 发布门禁 `verify:local` 扩展 6 项 e2e 断言：反馈落库、用户列表、管理员列表/状态跟进、埋点上报、聚合统计可读

---

## [1.5.2] - 2026-09-06

### 变更
- **SW 缓存策略重构为「网络优先瘦缓存」**（根治旧代码残留 / 需反复手动清缓存）：
  - 移除 install 阶段的应用壳预缓存（`index.html` + 全部自有 JS 不再被快照锁定），SW 不再是某次发布的内容快照
  - HTML 导航 network-first：在线一律返回服务器最新页面，仅真正断网时回退最近缓存的页面 → 解决「登录页点协议/隐私不弹、登录后才弹」等旧页面残留问题
  - 同源 JS/CSS/图片 network-first 并覆写运行缓存（弱网/离线兜底，`ignoreSearch` 兼容历史 `?v=` 请求）；CDN 资源 cache-first；`/api/*` 永不缓存
  - 发版不再需要递增 `CACHE_VERSION`；新 SW 激活时自动清理全部历史版本缓存（老用户无需手动 Unregister + Clear site data）
- `app.js` 动态 import 的 `auth-ui.js` 移除 `?v=3` 指纹：自有 JS 统一走服务器 ETag 协商缓存 + SW network-first（与 index.html 其余脚本一致）
- 发布门禁同步：`verify:local` 与 `ops-check-prod.ps1` 的 SW 断言由「版本号匹配」改为「新策略特征」（无 APP_SHELL 预缓存 / 导航 network-first / 协议守卫）

---

## [1.5.1] - 2026-09-06

### 修复
- **历史记录双轨不一致**：个人中心统计/历史列表原读空的服务端历史（统计恒 0、列表恒空），现与主页统一读本地 `taxCalculationHistory`（唯一数据源）；删除改为本地删除并尽力同步服务器残留；JSON/CSV 导出同源
- 登出/注销清理补 `taxCalculationHistory`（本地历史属当前会话，防换号共用浏览器串数据）；主页各历史视图渲染前统一从 localStorage 同步内存镜像，消除双份缓存展示不一致
- 登录限流仅针对凭证动作：`/profile` 等 JWT 接口豁免（防活跃用户被 10 次/15 分钟配额误锁 429）；限流响应结构与其余错误统一为 `success:false` + `error{message,statusCode}`
- 更新资料（username/email/phone）服务端补格式校验与查重（排除自身），冲突返回明确 400/409 中文提示而非 Prisma P2002→500；邮箱更新与注册一致做归一化存储
- 生产环境 500 不再裸透内部错误详情（日志仍保留堆栈），统一提示"服务器内部错误，请稍后重试"
- Swagger 修正 `verify-password` 请求字段名（`password` → `currentPassword`）
- 清理 `calculationController` 中永不触发的 `if(req.user)` 落库死代码（计算路由无认证中间件，历史数据源在前端本地）

### 变更
- **发布缓存策略根治**：自有 JS/CSS 去掉 1 年 `immutable` 强缓存，改为 ETag 协商缓存；`index.html`/`app.js` 全部脚本移除 `?v=` 指纹，修复无指纹的 ES module import 链路（如 `api-client.js`）被强缓存锁死、老用户长期拿不到新代码的问题（离线兜底由 SW 负责）
- Service Worker 升级 `euriskotax-v6`：同源 JS/CSS 离线回退改为 `ignoreSearch` 兜底（兼容旧带指纹请求）；`auth-ui.js`/`api-client.js` 纳入应用壳预缓存（保证离线可进入登录/个人中心）
- "关于"弹窗与 `package.json` 版本号同步为 1.5.1

---

## [1.5.0] - 2026-09-06

### 新增
- 忘记密码自助找回：登录卡片内嵌"重置密码"面板（验证注册邮箱 → 设置新密码）
  - 后端 `POST /api/auth/send-reset-code`、`POST /api/auth/reset-password`（Swagger 注释齐全）
  - 验证码按用途（register/reset）隔离；重置邮件独立文案；未注册邮箱不发信直接 404
  - 限流：`codeLimiter` 对两个发码端点合并计数（15 分钟 5 次/IP）
- 登录支持"记住我"：勾选 token 存 `localStorage`（跨会话），未勾选存 `sessionStorage`（关浏览器即失效）
- 注册新增协议勾选：必须勾选"我已阅读并同意《用户协议》《隐私政策》"后才能提交
- 协议/隐私弹窗点击即显（不依赖登录）；"关于"弹窗增加协议/隐私入口；ESC、点击遮罩关闭、背景滚动锁定

### 修复
- 协议/隐私弹窗开关统一走 `openModal/closeModal`（淡入淡出 + 滚动锁定 + 状态跟踪），消除旧缓存页面"点链接无反应、登录后才弹"的错乱
- 移除 `index.html` 冗余的静态 `api-client.js` / `auth-ui.js` 模块标签（此前双份加载、版本号不一致）；脚本版本统一为 `?v=4`，SW 缓存升级 `euriskotax-v5`
- `showAlert` 回调改为 `onclick` 直赋去重；补齐帮助/关于弹窗右上角关闭按钮
- 退出登录 / 注销账号时清理本地 `tax_profile`、`calculation_history`，避免换号串数据
- 微信 / QQ 登录按钮点击给出"暂未开放"提示
- 修改注册邮箱 / 重置邮箱后自动清空已填验证码并提示重新获取
- 注册手机号格式校验（`/^1[3-9]\d{9}$/`）
- 服务端补密码最少 6 位校验（注册 / 改密 / 重置），与前端一致

### 变更
- 删除主界面导航中永不显示的 `auth-section`（登录/注册死按钮）及对应空引用处理
- 退出登录后停留登录页（不再误切 `mode-selection-page`）
- 条款更新：用户协议新增"账号安全与注销"（自助找回、自助注销）；隐私政策更新"信息删除与账号注销"与本地存储说明
- "关于"弹窗版本号同步为 1.5.0

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
