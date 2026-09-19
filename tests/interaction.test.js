// 交互流程单元测试
// 覆盖 navigation-ui.js 的步骤导航、预览条更新、
// tax-calculator.js 的保存历史记录、以及辅助函数

const { loadSource } = require('./helpers/load-source');

// 全局 mock 函数（会在各测试中重新赋值）
let mockShowAlert;
let mockShowSaveSuccess;
let mockShowSaveError;

beforeAll(() => {
    // 先 mock 依赖函数再加载源文件
    global.showAlert = jest.fn();
    global.showSaveSuccessMessage = jest.fn();
    global.showSaveErrorMessage = jest.fn();
    // 17B-2（v1.48.0）：原先这里的 updateReverseDeductionCalculation mock 随旧页面删了。
    global.updateIncomeCalculation = jest.fn();
    global.updateDeductionCalculation = jest.fn();

    // calculationHistory 在 data-management.js 中声明，
    // 此处预先初始化以供 tax-calculator.js 的 saveToHistory 使用
    global.calculationHistory = [];

    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/ui/navigation-ui.js');
});

beforeEach(() => {
    // 清理 DOM（避免跨测试污染）
    document.body.innerHTML = '';
    // 重置 localStorage
    localStorage.clear();
    // 重置 calculationHistory
    calculationHistory = [];
    // 重置 mock 调用记录
    if (global.showAlert && global.showAlert.mockClear) global.showAlert.mockClear();
    if (global.showSaveSuccessMessage && global.showSaveSuccessMessage.mockClear) global.showSaveSuccessMessage.mockClear();
    if (global.showSaveErrorMessage && global.showSaveErrorMessage.mockClear) global.showSaveErrorMessage.mockClear();
});

// ========== 步骤导航测试 ==========
describe('showStepByPanes - 通用步骤面板切换', () => {
    function setupPanes(paneIds) {
        const panes = {};
        paneIds.forEach(id => {
            const el = document.createElement('div');
            el.id = id;
            el.classList.add('hidden');
            document.body.appendChild(el);
            panes[id] = el;
        });
        return panes;
    }

    function setupStepIndicator(pageId, totalSteps) {
        const page = document.createElement('div');
        page.id = pageId;
        const indicator = document.createElement('div');
        indicator.className = 'step-indicator';
        for (let i = 0; i < totalSteps; i++) {
            const stepNum = document.createElement('div');
            stepNum.className = 'step-number';
            const stepTitle = document.createElement('div');
            stepTitle.className = 'step-title';
            indicator.appendChild(stepNum);
            indicator.appendChild(stepTitle);
        }
        const line = document.createElement('div');
        line.className = 'step-line';
        indicator.appendChild(line);
        page.appendChild(indicator);
        document.body.appendChild(page);
    }

    test('应隐藏所有面板后只显示当前步骤面板', () => {
        const pageId = 'test-page';
        setupStepIndicator(pageId, 3);
        const paneIds = ['pane-1', 'pane-2', 'pane-3'];
        const panes = setupPanes(paneIds);

        showStepByPanes(pageId, 2, paneIds);

        expect(panes['pane-1'].classList.contains('hidden')).toBe(true);
        expect(panes['pane-2'].classList.contains('hidden')).toBe(false);
        expect(panes['pane-3'].classList.contains('hidden')).toBe(true);
    });

    test('步骤 1 应只显示第一个面板', () => {
        const pageId = 'test-page-1';
        setupStepIndicator(pageId, 3);
        const paneIds = ['p1', 'p2', 'p3'];
        const panes = setupPanes(paneIds);

        showStepByPanes(pageId, 1, paneIds);

        expect(panes['p1'].classList.contains('hidden')).toBe(false);
        expect(panes['p2'].classList.contains('hidden')).toBe(true);
        expect(panes['p3'].classList.contains('hidden')).toBe(true);
    });

    test('最后一步应只显示最后一个面板', () => {
        const pageId = 'test-page-2';
        setupStepIndicator(pageId, 3);
        const paneIds = ['p1', 'p2', 'p3'];
        const panes = setupPanes(paneIds);

        showStepByPanes(pageId, 3, paneIds);

        expect(panes['p1'].classList.contains('hidden')).toBe(true);
        expect(panes['p2'].classList.contains('hidden')).toBe(true);
        expect(panes['p3'].classList.contains('hidden')).toBe(false);
    });

    test('不存在的面板 ID 不应报错', () => {
        const pageId = 'test-page-3';
        setupStepIndicator(pageId, 2);
        expect(() => showStepByPanes(pageId, 1, ['non-existent-1', 'non-existent-2'])).not.toThrow();
    });
});

// 17B-2（v1.48.0）：showReverseStep 与 setupReverseDeductionToggle 的用例随旧页面删了 ——
// 它们测的不是业务规则，而是那张表单自己的显示/隐藏接线，页面没了就没人可测。
// 反算口径本身的回归 guard 在 tests/reverse-migration.test.js（按税法口径独立重算，不读页面）。
// 17B-4（v1.50.0）：showClassificationStep 的用例随旧页面删了 —— 与上面的 showReverseStep 同一个理由：
// 它测的不是业务规则，而是那张表单自己的步骤显隐接线，页面没了就没人可测。
// 分类所得口径的回归 guard 改为 tests/classification-migration.test.js（按税法口径独立重算，不读页面）。
// 至此四个页面式 deep（经营所得 v1.47.0 / 反向倒算 v1.48.0 / 综合所得 v1.49.0 / 分类所得 v1.50.0）
// 页面各自那批 step 包装函数都翻篇了 —— 分步这件事交给向导按 spec 的 steps 渲染。

// ========== 步骤指示器更新测试 ==========
describe('updateStepIndicator - 步骤指示器更新', () => {
    function setupPageWithSteps(pageId, totalSteps) {
        const page = document.createElement('div');
        page.id = pageId;
        const indicator = document.createElement('div');
        indicator.className = 'step-indicator';

        for (let i = 0; i < totalSteps; i++) {
            const stepNum = document.createElement('div');
            stepNum.className = 'step-number';
            indicator.appendChild(stepNum);
            const stepTitle = document.createElement('div');
            stepTitle.className = 'step-title';
            indicator.appendChild(stepTitle);
        }
        for (let i = 0; i < totalSteps - 1; i++) {
            const line = document.createElement('div');
            line.className = 'step-line';
            indicator.appendChild(line);
        }
        const previewBar = document.createElement('div');
        previewBar.className = 'calc-preview-bar';
        page.appendChild(previewBar);
        page.appendChild(indicator);
        document.body.appendChild(page);
        return page;
    }

    test('步骤 2 时第 1 步应标记为 completed，第 2 步应标记为 active', () => {
        const pageId = 'indicator-test-page';
        setupPageWithSteps(pageId, 4);
        updateStepIndicator(pageId, 2);

        const stepNumbers = document.querySelectorAll(`#${pageId} .step-number`);
        expect(stepNumbers[0].classList.contains('completed')).toBe(true);
        expect(stepNumbers[0].classList.contains('active')).toBe(false);
        expect(stepNumbers[0].textContent).toBe('✓');
        expect(stepNumbers[1].classList.contains('active')).toBe(true);
        expect(stepNumbers[1].textContent).toBe('2');
        expect(stepNumbers[2].classList.contains('active')).toBe(false);
        expect(stepNumbers[2].classList.contains('completed')).toBe(false);
    });

    test('最后一步时预览条应添加 is-result-step 类', () => {
        const pageId = 'indicator-test-result';
        setupPageWithSteps(pageId, 3);
        updateStepIndicator(pageId, 3);

        const previewBar = document.querySelector(`#${pageId} .calc-preview-bar`);
        expect(previewBar.classList.contains('is-result-step')).toBe(true);
    });

    test('非最后一步时预览条应移除 is-result-step 类', () => {
        const pageId = 'indicator-test-not-result';
        setupPageWithSteps(pageId, 3);
        updateStepIndicator(pageId, 2);

        const previewBar = document.querySelector(`#${pageId} .calc-preview-bar`);
        expect(previewBar.classList.contains('is-result-step')).toBe(false);
    });

    test('应创建步骤进度文字 "step/total"', () => {
        const pageId = 'indicator-test-progress';
        setupPageWithSteps(pageId, 4);
        updateStepIndicator(pageId, 2);

        const progressEl = document.querySelector(`#${pageId} .step-progress-text`);
        expect(progressEl).not.toBeNull();
        expect(progressEl.textContent).toBe('2/4');
    });
});

// 17B-4（v1.50.0）：formatPreviewNum 的六条用例随 classification 页面整页删除 ——
// 它只服务那条「常驻预览条」（页面式 deep 各自那一条），四个页面迁完、预览条也归零了。
// 与上面 showClassificationStep 同一个理由：它测的不是业务规则，而是那张表单自己的显示接线。
// 结果数字现在统一由 toolbox-ui 的 fmtValue（¥ 千分位 + 两位小数）格式化，
// 那一处有专门用例守着（tests/quick-report.test.js / tests/scenario.test.js），这里不再重复。

// ========== 保存历史记录测试 ==========
describe('saveToHistory - 保存计算结果到历史记录', () => {
    test('有效结果应成功保存并写入 localStorage', () => {
        const results = { totalTax: 10000, totalIncome: 100000 };
        const result = saveToHistory(results, 'forward', '综合所得计税');

        expect(result).toBe(true);
        expect(global.showSaveSuccessMessage).toHaveBeenCalled();

        const stored = JSON.parse(localStorage.getItem('taxCalculationHistory'));
        expect(stored).toHaveLength(1);
        expect(stored[0].type).toBe('forward');
        expect(stored[0].title).toContain('综合所得计税');
        expect(stored[0].results).toEqual(results);
        expect(stored[0].id).toBeDefined();
        expect(stored[0].date).toBeDefined();
    });

    test('空结果对象应提示并返回 false', () => {
        const result = saveToHistory({}, 'forward', '综合所得计税');

        expect(result).toBe(false);
        expect(global.showAlert).toHaveBeenCalledWith('请先完成计算后再保存');
        expect(global.showSaveSuccessMessage).not.toHaveBeenCalled();
    });

    test('null 结果应提示并返回 false', () => {
        const result = saveToHistory(null, 'forward', '综合所得计税');

        expect(result).toBe(false);
        expect(global.showAlert).toHaveBeenCalledWith('请先完成计算后再保存');
    });

    test('保存应在历史记录顶部插入新记录（unshift）', () => {
        saveToHistory({ tax: 100 }, 'forward', '记录1');
        saveToHistory({ tax: 200 }, 'forward', '记录2');

        const stored = JSON.parse(localStorage.getItem('taxCalculationHistory'));
        expect(stored).toHaveLength(2);
        expect(stored[0].results.tax).toBe(200);
        expect(stored[1].results.tax).toBe(100);
    });

    test('历史记录超过 50 条时应截断为 50 条', () => {
        // 先填充 50 条
        for (let i = 0; i < 50; i++) {
            saveToHistory({ index: i }, 'forward', '记录' + i);
        }
        // 再添加第 51 条
        saveToHistory({ index: 50 }, 'forward', '记录50');

        const stored = JSON.parse(localStorage.getItem('taxCalculationHistory'));
        expect(stored).toHaveLength(50);
        expect(stored[0].results.index).toBe(50);
    });

    test('保存失败时应调用错误处理函数并返回 false', () => {
        // 使用 spyOn 模拟 localStorage.setItem 抛出异常
        const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        const result = saveToHistory({ tax: 100 }, 'forward', '测试');

        expect(result).toBe(false);
        expect(global.showSaveErrorMessage).toHaveBeenCalled();

        setItemSpy.mockRestore();
    });
});

describe('保存包装函数 - 调用通用 saveToHistory', () => {
    // 注意：businessCalculationResults 等变量用 let 声明于 eval 词法作用域，
    // 测试环境无法直接修改。因此这里测试默认状态（空对象）下的行为，
    // 以及 saveToHistory 对各类型的正确处理。

    test('默认状态下 saveClassificationCalculation 应提示用户先计算', () => {
        saveClassificationCalculation();
        expect(global.showAlert).toHaveBeenCalledWith('请先完成计算后再保存');
    });

    // 17B-2（v1.48.0）：saveReverseCalculation 这个「未算先提示」的包装函数随旧页面删除了 ——
    // spec 驱动的向导走到结果步才渲染保存按钮，压根没有「没算就能点」的入口，这个分支不存在了。
    // 历史记录里 type='reverse' 仍然有效（向导保存用的就是它），见下面那条类型的用例。

    test('saveToHistory 用 business 类型应正确保存', () => {
        saveToHistory({ totalTax: 5000 }, 'business', '经营所得计税');
        const stored = JSON.parse(localStorage.getItem('taxCalculationHistory'));
        expect(stored[0].type).toBe('business');
        expect(stored[0].title).toContain('经营所得计税');
    });

    test('saveToHistory 用 classification 类型应正确保存', () => {
        saveToHistory({ totalTax: 2000 }, 'classification', '分类所得计税');
        const stored = JSON.parse(localStorage.getItem('taxCalculationHistory'));
        expect(stored[0].type).toBe('classification');
        expect(stored[0].title).toContain('分类所得计税');
    });

    test('saveToHistory 用 reverse 类型应正确保存', () => {
        saveToHistory({ totalIncome: 200000 }, 'reverse', '反向倒算计税');
        const stored = JSON.parse(localStorage.getItem('taxCalculationHistory'));
        expect(stored[0].type).toBe('reverse');
        expect(stored[0].title).toContain('反向倒算计税');
    });
});

// ========== 扣除项切换测试 ==========
// 17B-2（v1.48.0）：setupReverseDeductionToggle 随旧页面删除。它做的事（勾选取消 → 显示/隐藏 +
// 重算扣除）在 spec 驱动下由渲染器的 when 条件与 collect 统一处理，没有页面私有的 toggle 函数了。
// ========== 分类所得计算测试 ==========
describe('calculateSingleClassificationTax - 分类所得单条计算', () => {
    test('利息所得应按 20% 比例税率计算', () => {
        const result = calculateSingleClassificationTax('interest', 10000);
        expect(result.totalTax).toBe(2000);
        expect(result.taxableIncome).toBe(10000);
        expect(result.taxRate).toBe(0.20);
    });

    test('偶然所得应按 20% 比例税率计算', () => {
        const result = calculateSingleClassificationTax('accidental', 5000);
        expect(result.totalTax).toBe(1000);
    });

    test('财产转让所得应允许扣除财产原值', () => {
        const result = calculateSingleClassificationTax('transfer', 100000, 60000);
        // 应纳税所得额 = 100000 - 60000 = 40000
        // 税额 = 40000 * 20% = 8000
        expect(result.taxableIncome).toBe(40000);
        expect(result.totalTax).toBe(8000);
    });

    test('财产租赁所得不超过 4000 元应扣减 800 元', () => {
        const result = calculateSingleClassificationTax('rent', 3000);
        // 应纳税所得额 = max(0, 3000 - 800 - 0) = 2200
        expect(result.taxableIncome).toBe(2200);
        expect(result.totalTax).toBe(440);
    });

    test('财产租赁所得超过 4000 元应按 80% 计算', () => {
        const result = calculateSingleClassificationTax('rent', 10000);
        // 应纳税所得额 = max(0, 10000 * 0.8 - 0) = 8000
        expect(result.taxableIncome).toBe(8000);
        expect(result.totalTax).toBe(1600);
    });

    test('零收入应返回 0 税额', () => {
        const result = calculateSingleClassificationTax('interest', 0);
        expect(result.totalTax).toBe(0);
    });
});

// ========== 参数提示系统（Tooltip）测试 ==========
describe('initTooltipHints - 参数提示初始化与交互', () => {
    // 模拟 FIELD_HINTS 数据
    const mockHints = {
        'test_key': '测试提示文本',
        'common_work_months': '一年中实际工作的月数',
        'forward_salary': '税前月工资薪金'
    };

    function setupTooltipHTML() {
        document.body.innerHTML = `
            <span class="tooltip ml-1" data-hint="test_key">
                <i class="fa fa-info-circle text-gray-400"></i>
                <span class="tooltip-text"></span>
            </span>
            <span class="tooltip ml-1" data-hint="common_work_months">
                <i class="fa fa-info-circle text-gray-400"></i>
                <span class="tooltip-text"></span>
            </span>
            <span class="tooltip ml-1">
                <i class="fa fa-info-circle text-gray-400"></i>
                <span class="tooltip-text">无data-hint的tooltip</span>
            </span>
        `;
        window.FIELD_HINTS = mockHints;
    }

    test('应将 FIELD_HINTS 中的文本注入到 tooltip-text', () => {
        setupTooltipHTML();
        // 重新加载 navigation-ui.js 以触发 initTooltipHints
        jest.resetModules();
        const { loadSource } = require('./helpers/load-source');
        loadSource('src/js/ui/navigation-ui.js');

        const tips = document.querySelectorAll('.tooltip[data-hint]');
        expect(tips.length).toBe(2);

        const firstTip = tips[0];
        const textEl = firstTip.querySelector('.tooltip-text');
        expect(textEl.innerHTML).toBe('测试提示文本');
    });

    test('点击 tooltip 应切换 is-open 类', () => {
        setupTooltipHTML();
        jest.resetModules();
        const { loadSource } = require('./helpers/load-source');
        loadSource('src/js/ui/navigation-ui.js');

        const tip = document.querySelector('.tooltip[data-hint="test_key"]');
        expect(tip.classList.contains('is-open')).toBe(false);

        tip.click();
        expect(tip.classList.contains('is-open')).toBe(true);

        tip.click();
        expect(tip.classList.contains('is-open')).toBe(false);
    });

    test('点击外部区域应关闭已打开的 tooltip', () => {
        setupTooltipHTML();
        jest.resetModules();
        const { loadSource } = require('./helpers/load-source');
        loadSource('src/js/ui/navigation-ui.js');

        const tip = document.querySelector('.tooltip[data-hint="test_key"]');
        tip.classList.add('is-open');
        expect(tip.classList.contains('is-open')).toBe(true);

        // 模拟点击页面其他区域
        document.body.click();
        expect(tip.classList.contains('is-open')).toBe(false);
    });

    test('ESC 键应关闭所有 tooltip', () => {
        setupTooltipHTML();
        jest.resetModules();
        const { loadSource } = require('./helpers/load-source');
        loadSource('src/js/ui/navigation-ui.js');

        const tip1 = document.querySelector('.tooltip[data-hint="test_key"]');
        const tip2 = document.querySelector('.tooltip[data-hint="common_work_months"]');
        tip1.classList.add('is-open');
        tip2.classList.add('is-open');

        const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(escEvent);

        expect(tip1.classList.contains('is-open')).toBe(false);
        expect(tip2.classList.contains('is-open')).toBe(false);
    });

    test('同时只应展开一个 tooltip（互斥）', () => {
        setupTooltipHTML();
        jest.resetModules();
        const { loadSource } = require('./helpers/load-source');
        loadSource('src/js/ui/navigation-ui.js');

        const tip1 = document.querySelector('.tooltip[data-hint="test_key"]');
        const tip2 = document.querySelector('.tooltip[data-hint="common_work_months"]');

        // 点击第一个
        tip1.click();
        expect(tip1.classList.contains('is-open')).toBe(true);
        expect(tip2.classList.contains('is-open')).toBe(false);

        // 点击第二个（应关闭第一个，打开第二个）
        tip2.click();
        expect(tip1.classList.contains('is-open')).toBe(false);
        expect(tip2.classList.contains('is-open')).toBe(true);
    });

    test('无 data-hint 的 tooltip 不应报错', () => {
        setupTooltipHTML();
        jest.resetModules();
        const { loadSource } = require('./helpers/load-source');
        expect(() => {
            loadSource('src/js/ui/navigation-ui.js');
        }).not.toThrow();
    });
});
