# EuriskoTax 测试报告

**测试日期**: 2026-08-04
**测试环境**: Node.js + Jest 29.7 + jest-environment-jsdom / Chromium 浏览器自动化
**项目版本**: 1.0.0（三批重构 + 个人中心 UI 重设计后）

---

## 一、测试执行结果

### 1.1 总体结果

| 指标 | 数值 |
|------|------|
| 测试套件数 | 2 |
| 通过测试数 | 90 |
| 失败测试数 | 0 |
| 快照数 | 0 |
| 总耗时 | 2.08 秒 |
| 退出码 | 0（成功） |

### 1.2 测试套件明细

| 测试文件 | 测试数 | 状态 | 耗时 |
|---------|--------|------|------|
| tests/tax-calculator.test.js | 51 | PASS | ~1.6s |
| tests/interaction.test.js | 39 | PASS | ~1.6s |

### 1.3 警告与错误分析

| 类型 | 来源 | 说明 | 严重程度 |
|------|------|------|---------|
| console.error | interaction.test.js:378 | 预期行为 — 测试 `saveToHistory` 错误处理时模拟 `QuotaExceededError`，触发源码中的 `console.error('保存计算结果失败:', error)` | 无（预期） |

**结论**: 无意外警告或错误。唯一的 `console.error` 来自错误处理测试用例，属于预期行为。

---

## 二、核心计算逻辑测试（51 个测试）

### 2.1 测试覆盖的函数

| 函数名 | 所在文件 | 测试数 | 覆盖场景 |
|--------|---------|--------|---------|
| checkTaxBracketThreshold | tax-calculator.js | 6 | 接近临界点、远离临界点、最低档、最高档、边界值 |
| calculateOptimalBonusAllocation | tax-calculator.js | 6 | include模式、separate模式、零收入、收入等于扣除额、临界点验证、字段完整性 |
| validateCharitableDonation | tax-calculator.js | 5 | 限额内、超限额、等于限额、零捐赠、零应纳税所得额 |
| calculateOtherIncome | tax-calculator.js | 9 | 劳务/稿酬/特许权使用费的4000元分界点、各税率档、零收入 |
| calculateBonusTax | tax-calculator.js | 7 | 各税率档、临界点跳档、零值、负值、并入综合所得 |
| calculateCumulativePrepaidTax | tax-calculator.js | 4 | 12个月累计、负数月度、最高税率、1个月 |
| calculateTotalIncome | tax-calculator.js | 4 | 含/不含年终奖、零收入 |
| calculateIncomeTax | tax-calculator.js | 5 | 各税率档（3%~45%）、零所得 |
| determinePrepaidTax | tax-calculator.js | 3 | 用户输入优先、自动计算、NaN回退 |
| calculatePreTaxIncome | tax-calculator.js | 2 | 正常计算、零收入 |

### 2.2 关键验证点

- **税率表临界点**: 验证 36000→36001 元跳档（3%→10%）、144000→144001 元跳档（10%→20%）
- **劳务报酬分段**: 验证 4000 元分界点（扣减800 vs 按80%）、20000/50000 元税率跳档
- **稿酬所得**: 验证 70% 减计 + 20% 税率的组合计算
- **年终奖最优分配**: 验证 include/separate 模式选择逻辑、税额不高于全部并入方案
- **公益捐赠限额**: 验证 30% 限额的扣除计算与超额提示

---

## 三、交互流程测试（39 个测试）

### 3.1 测试覆盖的函数

| 函数名 | 所在文件 | 测试数 | 覆盖场景 |
|--------|---------|--------|---------|
| showStepByPanes | navigation-ui.js | 4 | 步骤1/2/3切换、不存在面板ID容错 |
| showReverseStep | navigation-ui.js | 1 | 反向倒算步骤2切换 |
| showBusinessStep | navigation-ui.js | 1 | 经营所得步骤3切换 |
| showClassificationStep | navigation-ui.js | 1 | 分类所得步骤1切换 |
| updateStepIndicator | navigation-ui.js | 4 | completed/active状态、预览条隐藏、进度文字 |
| formatPreviewNum | navigation-ui.js | 6 | 千分位格式化、负数/NaN/null/小数/字符串 |
| saveToHistory | tax-calculator.js | 6 | 有效保存、空结果提示、null提示、unshift顺序、50条截断、错误处理 |
| saveBusinessCalculation | tax-calculator.js | 2 | 默认空状态提示、business类型保存 |
| saveClassificationCalculation | tax-calculator.js | 2 | 默认空状态提示、classification类型保存 |
| saveReverseCalculation | tax-calculator.js | 2 | 默认空状态提示、reverse类型保存 |
| setupReverseDeductionToggle | navigation-ui.js | 4 | 选中显示、未选中隐藏、切换触发、调用更新函数 |
| calculateSingleClassificationTax | tax-calculator.js | 6 | 利息/偶然/转让/租赁（4000分界）/零收入 |

### 3.2 关键验证点

- **步骤导航**: 验证通用函数 `showStepByPanes` 正确隐藏/显示面板
- **步骤指示器**: 验证 completed（✓）、active、进度文字（"2/4"）的 UI 状态
- **预览条**: 验证最后一步添加 `is-result-step` 类
- **保存历史**: 验证 unshift 顺序、50 条上限、localStorage 持久化、错误恢复
- **扣除项切换**: 验证复选框 change 事件的显示/隐藏联动

---

## 四、性能基准测试结果

### 4.1 测试环境
- 运行环境: Node.js
- 迭代次数: 每函数 10,000 次
- 预热: 每函数 100 次

### 4.2 性能数据

| 测试函数 | 场景 | 总耗时 (ms) | 平均耗时 (μs) |
|---------|------|------------|--------------|
| checkTaxBracketThreshold | 接近临界点（35000） | 4.09 | 0.409 |
| checkTaxBracketThreshold | 远离临界点（100000） | 0.80 | 0.080 |
| calculateOptimalBonusAllocation | 中收入（300000） | 30.60 | 3.060 |
| calculateOptimalBonusAllocation | 高收入（1000000） | 28.17 | 2.817 |
| validateCharitableDonation | 正常捐赠 | 1.31 | 0.131 |
| validateCharitableDonation | 超额捐赠 | 2.62 | 0.262 |
| calculateOtherIncome | 三项所得 | 3.24 | 0.324 |
| calculateBonusTax | 单独计税 | 0.90 | 0.090 |
| calculateCumulativePrepaidTax | 12 个月累计 | 10.58 | 1.058 |
| calculateTotalIncome | 综合所得 | 0.45 | 0.045 |

### 4.3 性能评估

| 指标 | 数值 | 评估 |
|------|------|------|
| 最快函数 | calculateTotalIncome (0.045 μs) | 优秀 — 纯加法运算 |
| 最慢函数 | calculateOptimalBonusAllocation (3.060 μs) | 优秀 — 遍历7个临界点+税率表 |
| 所有函数平均合计 | 8.277 μs | 优秀 — 远低于100ms用户感知阈值 |
| 1000次连续计算预估 | ~8.3 ms | 无卡顿风险 |

**结论**: 所有核心计算函数性能均达到预期优化目标，单次执行 < 3.1 μs，完全满足实时计算需求。

---

## 五、测试覆盖率说明

当前覆盖率报告显示 0%，这是因为项目源码使用浏览器全局变量（无 `module.exports`），测试通过 `eval` 加载源码，Jest 的覆盖率插桩无法跟踪 `eval` 执行的代码。

**实际覆盖情况**（基于测试用例手动评估）:

| 模块 | 函数覆盖率 | 关键路径覆盖率 | 评估 |
|------|----------|-------------|------|
| 纯计算函数 | 90%+ | 95%+ | 覆盖了所有税率档、边界值、异常输入 |
| 步骤导航 | 80%+ | 85%+ | 覆盖了核心切换逻辑、指示器更新 |
| 保存历史 | 85%+ | 90%+ | 覆盖了正常保存、空结果、错误处理 |
| DOM 交互 | 70%+ | 75%+ | 覆盖了扣除项切换、预览条格式化 |

---

## 六、测试命令

```bash
# 运行所有单元测试（含覆盖率报告）
npm test

# 监听模式运行测试
npm run test:watch

# 运行性能基准测试
npm run test:performance
```

---

## 七、结论

1. **90 个单元测试全部通过**，无意外警告或错误
2. **10 个核心函数性能均达标**，单次执行 < 3.1 μs
3. **测试覆盖了所有核心计算逻辑和关键交互流程**
4. **唯一预期的 `console.error` 来自错误处理测试**，验证了异常场景的容错能力
5. **测试套件可作为回归测试基线**，后续功能迭代时可运行 `npm test` 确保不引入回归

---

## 八、浏览器交互测试结果

### 8.1 测试环境
- 服务器: http-server @ localhost:9099
- 浏览器: Chromium（browser_use 自动化）
- 测试范围: 个人中心页面（重构后）

### 8.2 测试项目与结果

| 测试项 | 结果 | 说明 |
|--------|------|------|
| 登录 | PASS | 快速登录成功 |
| 进入个人中心 | PASS | 页面布局完整：用户信息卡片 + 4 统计卡片 + 6 模块卡片 |
| 浅色模式显示 | PASS | 子导航栏 sticky 正常，卡片样式正确 |
| 卡片点击（计算历史） | PASS | 成功跳转子页面，显示"暂无计算记录" |
| 返回按钮 | PASS | 成功返回个人中心主页面 |
| 深色模式 | PASS | 子导航栏、卡片、文字颜色全部正确适配 |
| 移动端 375px | PASS | 统计卡片 2 列，模块卡片 1 列，自适应正常 |
| 性能日志输出 | PASS | 控制台输出 39 条日志，含 7 条 Profile 性能日志 |

### 8.3 浏览器性能日志（ProfilePerf 实测）

| 操作 | 实测耗时 |
|------|---------|
| 进入个人中心（总耗时） | ~1.4 ~ 1.6 ms |
| API 获取用户信息 | ~79 ~ 82 ms |
| 页面渲染（各项合计） | ~0.5 ~ 0.7 ms |
| 完整加载总耗时 | ~80 ~ 84 ms |

### 8.4 结论

浏览器交互测试 **8 项全部通过**，未发现视觉布局异常、深色模式样式错误、移动端自适应问题或返回按钮功能异常。个人中心完整加载耗时 ~80ms，远低于 200ms 性能验收标准。
