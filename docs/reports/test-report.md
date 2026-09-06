# EuriskoTax 测试报告

**测试日期**: 2026-09-06（全量重跑基线）
**测试环境**: Node.js + Jest 29.7 + jest-environment-jsdom / Chromium 浏览器自动化
**项目版本**: 1.4.0（生产上线 + PWA + 注册全流程闭环后）
**测试命令**: `npm test`

---

## 一、测试执行结果

### 1.1 总体结果

| 指标 | 数值 |
|------|------|
| 测试套件数 | 6 |
| 通过测试数 | **203** |
| 失败测试数 | 0 |
| 快照数 | 0 |
| 总耗时 | ~2.5 秒 |
| 退出码 | 0（成功） |

### 1.2 测试套件明细

| 测试文件 | 测试数 | 状态 | 说明 |
|---------|--------|------|------|
| tests/tax-calculator.test.js | 51 | PASS | 计税核心纯函数 |
| tests/interaction.test.js | 45 | PASS | 步骤导航 / 保存历史 / tooltip |
| tests/tax-assistant.test.js | 35 | PASS | 悬浮税助手功能交互 |
| tests/tax-assistant-perf.test.js | 12 | PASS | 性能基准 + 日志/并发工具 |
| tests/home-page.test.js | 22 | PASS | 首页渲染与交互（v1.4.0 新增） |
| tests/profile-page.test.js | 38 | PASS | 个人中心 / 税务档案 / 路由栈（v1.4.0 新增） |

### 1.3 本次回归修复记录

- **2026-09-06 修复**：`profile-page.test.js` 的 DOM fixture 缺少 auth 重构（2026-09-06）新增的 `forgot-password` / `send-code-btn` / `register-code` / `register-invite-code` / `user-name` 元素，导致 `setupAuthEventListeners` 绑定到 null 元素抛错、整包运行时 12 个用例失败。补齐 fixture 后 203/203 恢复全绿。
- **性能用例 flaky 提示**：`tax-assistant-perf.test.js` 含时间类断言（如 5000 次调用 < 500ms）。整包并行执行时若机器 CPU 被抢占可能抖动；单文件运行或串行运行均稳定通过。若 CI 偶发失败，优先以 `--runInBand` 复核。

### 1.4 警告与错误分析

`console.error` 均来自错误处理/失败回滚测试用例（`saveToHistory` 注入 `QuotaExceededError`、税助手注入 `failNext=1`），属于预期行为，无意外警告。

---

## 二、历史基线（2026-08-05，v1.1.0）

以下四个套件在 v1.1.0 阶段记录为 143 个测试（2026-08-05 全通过）；其覆盖的函数与场景在 v1.4.0 保持不变，现为 203 中的 143 个。

### 2.1 核心计算逻辑（tax-calculator.test.js · 51 个）

| 函数 | 测试数 | 覆盖场景 |
|--------|---------|--------|
| checkTaxBracketThreshold | 6 | 接近/远离临界点、最低档、最高档、边界值 |
| calculateOptimalBonusAllocation | 6 | include/separate、零收入、收入等于扣除额、临界点、字段完整性 |
| validateCharitableDonation | 5 | 限额内、超限额、等于限额、零捐赠、零应纳税所得额 |
| calculateOtherIncome | 9 | 劳务/稿酬/特许权 4000 元分界、各税率档、零收入 |
| calculateBonusTax | 7 | 各税率档、临界跳档、零/负值、并入综合所得 |
| calculateCumulativePrepaidTax | 4 | 12 个月累计、负数月度、最高税率、1 个月 |
| calculateTotalIncome | 4 | 含/不含年终奖、零收入 |
| calculateIncomeTax | 5 | 3%~45% 各档、零所得 |
| determinePrepaidTax | 3 | 用户输入优先、自动计算、NaN 回退 |
| calculatePreTaxIncome | 2 | 正常计算、零收入 |

### 2.2 交互流程（interaction.test.js · 45 个）

| 函数 | 测试数 | 覆盖场景 |
|--------|---------|--------|
| showStepByPanes / 子步骤切换 | 7 | 步骤 1/2/3、反向/经营/分类步骤切换、不存在面板容错 |
| updateStepIndicator | 4 | completed/active、预览条隐藏、进度文字 |
| formatPreviewNum | 6 | 千分位、负数/NaN/null/小数/字符串 |
| saveToHistory / saveBusiness/Classification/ReverseCalculation | 12 | 有效保存、空结果提示、unshift 顺序、50 条截断、错误恢复 |
| setupReverseDeductionToggle | 4 | 选中显示、未选中隐藏、切换触发 |
| calculateSingleClassificationTax | 6 | 利息/偶然/转让/租赁（4000 分界）/零收入 |
| initTooltipHints | 6 | FIELD_HINTS 注入、点击/外部点击/ESC、互斥展开、无 data-hint 容错 |

### 2.3 悬浮税助手（tax-assistant.test.js · 35 + perf.test.js · 12）

| 分组 | 测试数 | 覆盖场景 |
|---------|--------|--------|
| 初始化与开关 | 4 | FAB/关闭/遮罩/ESC |
| 渲染 | 3 | 快捷功能、分类标签、全部问答 |
| 搜索 / 分类筛选 / 展开 | 8 | 关键词、空状态、清空、高亮、分类、收起 |
| 全局 API / 热门问题 | 4 | window.TaxAssistant open/close/toggle、hot chips |
| 收藏 / 反馈 | 10 | 乐观更新、取消、筛选、计数、转移、失败回滚 |
| 关联跳转 | 2 | related 渲染去测算按钮 |
| 搜索历史与联想 | 4 | Enter 历史、联想下拉、聚焦历史、清空 |
| logger 基准 / 静默 | 4 | 5000 次 <500ms、静默模式快 5 倍、INFO 静默 |
| MockApi / MockClient | 4 | 耗时窗口、实例隔离、并发 reqId 追踪、延迟边界保护 |
| 联想同步性 | 3 | 不被 MockApi 异步阻塞、500 次 <200ms |

---

## 三、v1.4.0 新增前端页面测试（60 个）

### 3.1 首页（home-page.test.js · 22 个）

| 分组 | 测试数 | 覆盖场景 |
|---------|--------|--------|
| 问候语 | 3 | 👋 表情、日期文案、按时段变化 |
| 今日税感 | 1 | 容器内容渲染 |
| 税务提醒 | 4 | 提醒项、日历列表、剩余天数、空状态 |
| 最近计算 | 3 | 空状态、recent-card 渲染、最多 5 条、点击跳转 |
| 小贴士 | 2 | 内容渲染、"换一条"切换、连续点击循环 |
| 模式卡片 | 5 | 综合/经营/分类/反向四卡片触发对应按钮 |
| 卡片 info | 2 | 不触发模式按钮、调用 showAlert |
| 全部入口 | 1 | 跳转个人中心 |

### 3.2 个人中心（profile-page.test.js · 38 个）

| 分组 | 测试数 | 覆盖场景 |
|---------|--------|--------|
| 统计卡片渲染 | 2 | 4 个统计卡片、幂等不重复渲染 |
| 模块卡片渲染 | 2 | 6 个模块卡片、幂等 |
| 统计数字更新 | 2 | 更新数字、无税务档案为 0 |
| 税务日历 | 2 | 事件渲染、状态标签 |
| 税务档案 | 10 | 默认值/已存值加载、保存校验（工作月数、养老金、负数）、重置（含取消） |
| 用户信息加载 | 4 | 调 getProfile、填充顶栏、API 失败 showAlert、phone 空串 |
| 卡片导航 | 6 | profile-link 及 5 个模块卡片跳转/模态框 |
| 返回 / 路由栈 | 4 | showPage 隐藏页面、历史栈压入、goBack、多次导航 |
| 档案保存/重置按钮 | 2 | 点击触发保存/重置 |
| 密码可见性切换 | 2 | input type 切换、fa-eye 类增删 |
| 保存/重置（localStorage）| 2 | 档案落库、越界拒绝 |

---

## 四、性能基准（历史数据，2026-08-05 实测）

迭代 10,000 次、预热 100 次：

| 函数 | 场景 | 平均耗时 (μs) |
|------|------|------------|
| calculateTotalIncome | 综合所得 | 0.045 |
| checkTaxBracketThreshold | 远离临界点 | 0.080 |
| calculateBonusTax | 单独计税 | 0.090 |
| validateCharitableDonation | 正常捐赠 | 0.131 |
| calculateOtherIncome | 三项所得 | 0.324 |
| checkTaxBracketThreshold | 接近临界点 | 0.409 |
| calculateCumulativePrepaidTax | 12 个月累计 | 1.058 |
| calculateOptimalBonusAllocation | 高收入 | 2.817 |
| calculateOptimalBonusAllocation | 中收入 | 3.060 |

**评估**：单次执行均 < 3.1 μs，远低于 100ms 用户感知阈值；10 个核心函数性能全部达标，无卡顿风险。计税引擎本地运行，性能不依赖网络。

---

## 五、测试覆盖率说明

当前覆盖率报告显示 0%，因为源码使用浏览器全局变量（无 `module.exports`），测试经 `eval` 加载，Jest 覆盖率插桩无法跟踪 `eval` 执行代码。

**实际覆盖情况**（基于用例手动评估）：

| 模块 | 函数覆盖率 | 关键路径覆盖率 |
|------|----------|-------------|
| 纯计算函数 | 90%+ | 95%+ |
| 步骤导航 / 保存历史 | 80%+ | 85-90%+ |
| 首页渲染与交互 | 85%+ | 90%+ |
| 个人中心 / 税务档案 | 85%+ | 90%+ |
| 悬浮税助手 | 85%+ | 90%+ |

---

## 六、测试命令

```bash
npm test                    # 全部单元测试（含覆盖率报告）
npm run test:watch          # 监听模式
npm run test:performance    # 计税性能基准
```

---

## 七、浏览器交互测试记录（历史，2026-08-04/05）

> 针对个人中心页面重构与税助手 Phase 4 的 Chromium 自动化测试，14 项全部通过。后续 v1.4.0 引入的注册/邀请码/验证码流程尚未做浏览器 E2E，列入待办。

| 测试范围 | 结果 | 要点 |
|--------|------|------|
| 个人中心页面 | 9 项 PASS | 布局、明暗模式、移动端 375px 自适应、完整加载 ~80ms |
| 悬浮税助手 | 5 项 PASS | 抽屉、搜索联想、收藏回滚、日志静默 |

---

## 八、结论

1. **203 个单元测试全部通过**（6 套件，2026-09-06 实测），无意外警告或错误
2. 计税核心函数性能达标（单次 < 3.1 μs），税助手高并发联想 < 200ms
3. 新增首页 + 个人中心两套件，覆盖页面渲染、导航路由栈、档案校验、密码可见性切换等
4. 测试套件可作为回归基线：后续迭代运行 `npm test` 确保不引入回归（本次已修复一次 auth 重构导致的 fixture 回归）
5. **已知缺口**：注册 → 邮箱验证码 → 邀请码 → 登录全流程尚无浏览器 E2E 用例；全量并行时 perf 时间断言偶发抖动
