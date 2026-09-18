// 页面加载完成后绑定事件
window.addEventListener('DOMContentLoaded', function() {
    // 模式选择按钮
    document.getElementById('forward-mode-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] MODE → 选择"综合所得计税"模式', 'color: #1e40af; font-weight: bold;');
        showPage('forward-calculation-page');
        goToStep(1);
    });

    document.getElementById('business-mode-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] MODE → 选择"经营所得计税"模式', 'color: #1e40af; font-weight: bold;');
        // 阶段17 17B-1：经营所得已迁到 spec 驱动的向导，17B-2（v1.47.0）把旧页面整页删掉了。
        // 按钮本身保留：首页卡片（home-ui 的 cardBtnMap）与工具箱兜底都还会点它，点击即进向导。
        var W = window.EuriskoDeepWizard;
        if (W && W.open('business')) return;
        showAlert('经营所得测算暂不可用，请刷新页面后重试。');
    });

    document.getElementById('classification-mode-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] MODE → 选择"分类所得计税"模式', 'color: #1e40af; font-weight: bold;');
        showPage('classification-calculation-page');
        showClassificationStep(1);
    });

    document.getElementById('reverse-mode-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] MODE → 选择"反向倒算"模式', 'color: #1e40af; font-weight: bold;');
        // 阶段17 17B-2（v1.48.0）：反向倒算已迁到 spec 驱动的向导，旧整页删掉了。
        // 按钮本身保留：首页静态卡片的点击最终落到它身上（工具箱会先按 data-tool-id 走向导），
        // 删掉按钮反而会让两处的点击进入空白。
        var W = window.EuriskoDeepWizard;
        if (W && W.open('reverse')) return;
        showAlert('反向倒算测算暂不可用，请刷新页面后重试。');
    });
    
    
    // 分类所得页面导航按钮
    document.getElementById('calculate-classification-btn').addEventListener('click', function() {
        showClassificationStep(2);
        setTimeout(function() {
            calculateClassificationTax();
            updateClassificationCharts();
        }, 100);
    });
    
    // 分类所得页面添加条目按钮
    document.getElementById('add-classification-item-btn').addEventListener('click', addClassificationItem);
    
    // 分类所得页面重置按钮
    document.getElementById('reset-classification-btn').addEventListener('click', function() {
        resetClassificationCalculation();
        classificationItems = [];
        updateClassificationItemsList();
    });
    
    // 分类所得类型选择
    document.getElementById('classification-type').addEventListener('change', function() {
        const type = this.value;
        document.getElementById('rent-fields').classList.add('hidden');
        document.getElementById('transfer-fields').classList.add('hidden');
        document.getElementById('accidental-hint').classList.add('hidden');
        
        if (type === 'rent') {
            document.getElementById('rent-fields').classList.remove('hidden');
        } else if (type === 'transfer') {
            document.getElementById('transfer-fields').classList.remove('hidden');
        } else if (type === 'accidental') {
            document.getElementById('accidental-hint').classList.remove('hidden');
        }
    });
    
    // 返回按钮 - 使用 goBack() 实现"从哪来回哪去"
    document.getElementById('back-to-mode-selection').addEventListener('click', function() {
        goBack();
    });
    
    
    document.getElementById('back-to-mode-selection-business').addEventListener('click', function() {
        goBack();
    });
    
    document.getElementById('back-to-mode-selection-classification').addEventListener('click', function() {
        goBack();
    });
    
    // 帮助按钮
    document.getElementById('help-btn').addEventListener('click', function() {
        openModal(document.getElementById('help-modal'));
    });
    
    // 关闭模态框按钮
    document.getElementById('close-help-modal').addEventListener('click', function() {
        closeModal(document.getElementById('help-modal'));
    });
    
    // 帮助模态框标签页切换
    document.querySelectorAll('.help-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.help-tab-btn').forEach(b => {
                b.classList.remove('active', 'text-primary', 'bg-primary/10');
                b.classList.add('text-gray-600', 'hover:text-gray-800', 'hover:bg-gray-100');
            });
            this.classList.remove('text-gray-600', 'hover:text-gray-800', 'hover:bg-gray-100');
            this.classList.add('active', 'text-primary', 'bg-primary/10');
            
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.help-tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            document.getElementById('help-tab-' + tabId).classList.remove('hidden');
        });
    });
   // 关闭关于模态框
    document.getElementById('close-about-modal').addEventListener('click', function() {
        closeModal(document.getElementById('about-modal'));
    });

    // 主题切换按钮
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn.querySelector('i');
    // 初始化图标显示（使用 classList 避免覆盖定位样式）
    function setThemeIcon(isDark) {
        themeIcon.classList.remove('fa-moon-o', 'fa-sun-o');
        themeIcon.classList.add(isDark ? 'fa-sun-o' : 'fa-moon-o');
    }
    const isDarkMode = document.documentElement.classList.contains('dark');
    setThemeIcon(isDarkMode);
    themeToggleBtn.addEventListener('click', function() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        setThemeIcon(isDark);
    });

    // 正向计税页面导航按钮
    document.getElementById('next-to-income-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] NAV → 基本参数 → 收入明细', 'color: #1e40af; font-weight: bold;', { prepaidTax: document.getElementById('prepaid-tax')?.value });
        goToStep(2);
    });
   // 收入明细页面导航按钮
    document.getElementById('back-to-parameters-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] NAV → 收入明细 → 基本参数（返回）', 'color: #1e40af; font-weight: bold;');
        goToStep(1);
    });

    document.getElementById('next-to-deductions-btn').addEventListener('click', function() {
        const incomeData = {
            salary: document.getElementById('salary-income')?.value,
            labor: document.getElementById('labor-income')?.value,
            author: document.getElementById('author-income')?.value,
            bonus: document.getElementById('bonus-income')?.value
        };
        console.log('%c[EuriskoTax] NAV → 收入明细 → 扣除项', 'color: #1e40af; font-weight: bold;', incomeData);
        goToStep(3);
    });

    // 收入明细页面重置按钮
    document.getElementById('reset-income-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] RESET → 重置收入明细', 'color: #f59e0b; font-weight: bold;');
        resetIncomeData();
    });

    document.getElementById('back-to-income-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] NAV → 扣除项 → 收入明细（返回）', 'color: #1e40af; font-weight: bold;');
        goToStep(2);
    });
    
    // 扣除项明细页面重置按钮
    document.getElementById('reset-deduction-btn').addEventListener('click', function() {
        resetDeductionData();
    });
    
    document.getElementById('next-to-result-btn').addEventListener('click', function() {
        console.log('%c[EuriskoTax] CALC → 开始正向计税计算', 'color: #1e40af; font-weight: bold;');
        const startTime = performance.now();
        calculateTax();
        const calcTime = performance.now() - startTime;
        const result = typeof calculationResults !== 'undefined' ? {
            totalIncome: calculationResults?.incomeDetails?.total,
            totalDeduction: calculationResults?.deductionDetails?.total,
            taxableIncome: calculationResults?.taxDetails?.taxableIncome,
            totalTax: calculationResults?.taxDetails?.totalTax,
            netIncome: calculationResults?.taxDetails?.netIncome
        } : 'no results';
        console.log('%c[EuriskoTax] CALC → 计算完成 (' + calcTime.toFixed(1) + 'ms)', 'color: #16a34a; font-weight: bold;', result);
        goToStep(4);
        updateBudgetTable();
        updateCharts();
        generateOptimizationTips();
        console.log('%c[EuriskoTax] CALC → 结果页面渲染完成', 'color: #16a34a; font-weight: bold;');
    });
    
    // 正向计税页面重置按钮
    document.getElementById('reset-parameters-btn').addEventListener('click', resetForwardCalculation);
    
    // 保存计算结果按钮
    document.getElementById('save-calculation-btn').addEventListener('click', saveCalculationResult);

    // 分类所得保存按钮
    document.getElementById('save-classification-calculation-btn').addEventListener('click', function() {
        if (Object.keys(classificationCalculationResults).length === 0) {
            showAlert('请先完成计算后再保存');
            return;
        }
        saveClassificationCalculation();
    });

    // === 阶段2：顶部操作区按钮绑定（通用绑定） ===
    function bindCalcActionBtns(config) {
        const { modeName, saveBtnId, resetBtnId, saveFn, resetFn, stepFn } = config;
        const saveBtn = document.getElementById(saveBtnId);
        if (saveBtn) saveBtn.addEventListener('click', function() {
            console.log('%c[EuriskoTax] ACTION → 顶栏保存按钮（' + modeName + '）', 'color: #1e40af; font-weight: bold;');
            saveFn();
        });
        const resetBtn = document.getElementById(resetBtnId);
        if (resetBtn) resetBtn.addEventListener('click', function() {
            console.log('%c[EuriskoTax] ACTION → 顶栏重置按钮（' + modeName + '）', 'color: #f59e0b; font-weight: bold;');
            resetFn();
            if (stepFn) stepFn(1);
        });
    }

    bindCalcActionBtns({ modeName: '综合所得', saveBtnId: 'forward-save-btn', resetBtnId: 'forward-reset-btn', saveFn: saveCalculationResult, resetFn: resetForwardCalculation });
    bindCalcActionBtns({ modeName: '分类所得', saveBtnId: 'classification-save-btn', resetBtnId: 'classification-reset-btn', saveFn: saveClassificationCalculation, resetFn: resetClassificationCalculation, stepFn: showClassificationStep });

    // 导出PDF按钮（阶段10B：专业版出汇算清缴报告，免费版保留现导出——分流在 EuriskoReport 内完成）
    document.getElementById('export-pdf-btn').addEventListener('click', function() {
        if (window.EuriskoReport && typeof window.EuriskoReport.exportFinalReport === 'function') {
            window.EuriskoReport.exportFinalReport('comprehensive');
        } else {
            exportToPDF('step-result', '个人年度个税预算表');
        }
    });
    
    // 导出Word按钮
    document.getElementById('export-word-btn').addEventListener('click', function() {
        exportToWord('step-result', '个人年度个税预算表');
    });
    
    // 新计算按钮
    document.getElementById('new-calculation-btn').addEventListener('click', function() {
        resetForwardCalculation();
    });
    
    document.getElementById('new-classification-calculation-btn').addEventListener('click', function() {
        resetClassificationCalculation();
        showClassificationStep(1);
    });
    
    // 分类所得页面导出PDF按钮
    document.getElementById('export-classification-pdf-btn').addEventListener('click', function() {
        exportToPDF('classification-result', '分类所得计税表');
    });
    
    // 分类所得页面导出Word按钮
    document.getElementById('export-classification-word-btn').addEventListener('click', function() {
        exportToWord('classification-result', '分类所得计税表');
    });
    
    // 专项扣除显示/隐藏控制
    document.getElementById('special-deduction-checkbox').addEventListener('change', function() {
        const content = document.getElementById('special-deduction-content');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateDeductionCalculation();
    });
    
    document.getElementById('special-additional-deduction-checkbox').addEventListener('change', function() {
        const content = document.getElementById('special-additional-deduction-content');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateDeductionCalculation();
    });
    
    document.getElementById('other-deduction-checkbox').addEventListener('change', function() {
        const content = document.getElementById('other-deduction-content');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateDeductionCalculation();
    });
    
    // 住房类型选择
    document.getElementById('housing-type').addEventListener('change', function() {
        const type = this.value;
        document.getElementById('rent-fields').classList.add('hidden');
        document.getElementById('loan-fields').classList.add('hidden');
        
        if (type === 'rent') {
            document.getElementById('rent-fields').classList.remove('hidden');
        } else if (type === 'loan') {
            document.getElementById('loan-fields').classList.remove('hidden');
        }
        updateDeductionCalculation();
    });
    
    // 继续教育复选框
    function updateEducationDeduction() {
        const workMonths = parseInt(document.getElementById('work-months').value) || 12;
        let amount = 0;
        
        if (document.getElementById('education-degree-checkbox').checked) {
            amount += 400 * workMonths; // 学历教育400元/月，按年计算
        }
        
        if (document.getElementById('education-professional-checkbox').checked) {
            amount += 3600; // 职业资格3600元/年
        }
        
        document.getElementById('education-deduction').value = amount;
        updateDeductionCalculation();
    }
    
    document.getElementById('education-degree-checkbox').addEventListener('change', updateEducationDeduction);
    document.getElementById('education-professional-checkbox').addEventListener('change', updateEducationDeduction);
    document.getElementById('work-months').addEventListener('change', updateEducationDeduction);
    
    // 企业年金复选框
    document.getElementById('enterprise-annuity-checkbox').addEventListener('change', function() {
        const content = document.getElementById('enterprise-annuity-fields');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateDeductionCalculation();
    });
    
    // 企业年金输入
    document.getElementById('enterprise-annuity').addEventListener('input', updateDeductionCalculation);
    
    // 个人养老金复选框
    document.getElementById('pension-deduction-checkbox').addEventListener('change', function() {
        const content = document.getElementById('pension-deduction-fields');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateDeductionCalculation();
    });
    
    // 商业健康保险复选框
    document.getElementById('insurance-other-deduction-checkbox').addEventListener('change', function() {
        const content = document.getElementById('insurance-other-deduction-fields');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateDeductionCalculation();
    });
    
    // 税收递延型养老保险复选框
    document.getElementById('tax-deferred-pension-checkbox').addEventListener('change', function() {
        const content = document.getElementById('tax-deferred-pension-fields');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateDeductionCalculation();
    });
    
    // 公益捐赠支出复选框
    document.getElementById('charitable-donation-checkbox').addEventListener('change', function() {
        const content = document.getElementById('charitable-donation-fields');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateDeductionCalculation();
    });
    
    // 子女教育 + 婴幼儿照护数量输入
    document.getElementById('children-infant-count').addEventListener('input', function() {
        const count = parseInt(this.value) || 0;
        const rate = parseInt(document.getElementById('children-infant-deduction-rate').value) || 100;
        const amount = count * 2000 * (rate / 100); // 每个子女/婴幼儿每月2000元，考虑扣除比例
        document.getElementById('children-infant-deduction').value = amount;
        updateDeductionCalculation();
    });
    
    // 子女教育 + 婴幼儿照护扣除比例变化
    document.getElementById('children-infant-deduction-rate').addEventListener('change', function() {
        const count = parseInt(document.getElementById('children-infant-count').value) || 0;
        const rate = parseInt(this.value) || 100;
        const amount = count * 2000 * (rate / 100); // 每个子女/婴幼儿每月2000元，考虑扣除比例
        document.getElementById('children-infant-deduction').value = amount;
        updateDeductionCalculation();
    });
    
    // 赡养老人类型选择
    document.getElementById('elderly-type').addEventListener('change', function() {
        const type = this.value;
        const elderlyDeduction = document.getElementById('elderly-deduction');
        if (type === 'only') {
            elderlyDeduction.max = 3000;
            elderlyDeduction.value = 3000;
        } else if (type === 'non-only') {
            elderlyDeduction.max = 1500;
            elderlyDeduction.value = 1500;
        } else {
            elderlyDeduction.max = 0;
            elderlyDeduction.value = 0;
        }
        updateDeductionCalculation();
    });
    
    // 大病医疗输入
    document.getElementById('medical-deduction').addEventListener('input', updateDeductionCalculation);
    
    // 其他扣除输入
    document.getElementById('pension-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('insurance-other-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('tax-deferred-pension').addEventListener('input', updateDeductionCalculation);
    document.getElementById('charitable-donation').addEventListener('input', updateDeductionCalculation);
    
    // 工作月数变化
    document.getElementById('work-months').addEventListener('change', function() {
        updateIncomeCalculation();
        updateDeductionCalculation();
    });
    
    // 收入明细相关事件监听器
    document.getElementById('labor-income').addEventListener('input', updateIncomeCalculation);
    document.getElementById('author-income').addEventListener('input', updateIncomeCalculation);
    document.getElementById('royalty-income').addEventListener('input', updateIncomeCalculation);
    document.getElementById('salary-income').addEventListener('input', function() {
        updateIncomeCalculation();
    });
    document.getElementById('bonus-income').addEventListener('input', updateIncomeCalculation);
    document.getElementById('bonus-include').addEventListener('change', updateIncomeCalculation);
    
    // 扣除项明细相关事件监听器
    document.getElementById('basic-deduction').addEventListener('input', updateDeductionCalculation);
    // 社保缴费相关事件监听器
    document.getElementById('social-security-base').addEventListener('input', function() {
        calculateSocialSecurity();
        updateDeductionCalculation();
        validateSocialSecurityBase();
    });
    document.getElementById('pension-insurance').addEventListener('input', function() {
        calculateSocialSecurityRate('pension');
        updateDeductionCalculation();
    });
    document.getElementById('pension-rate').addEventListener('input', function() {
        calculateSocialSecurity();
        updateDeductionCalculation();
    });
    document.getElementById('medical-insurance').addEventListener('input', function() {
        calculateSocialSecurityRate('medical');
        updateDeductionCalculation();
    });
    document.getElementById('medical-rate').addEventListener('input', function() {
        calculateSocialSecurity();
        updateDeductionCalculation();
    });
    document.getElementById('unemployment-insurance').addEventListener('input', function() {
        calculateSocialSecurityRate('unemployment');
        updateDeductionCalculation();
    });
    document.getElementById('unemployment-rate').addEventListener('input', function() {
        calculateSocialSecurity();
        updateDeductionCalculation();
    });
    document.getElementById('housing-fund').addEventListener('input', function() {
        calculateSocialSecurityRate('housing');
        updateDeductionCalculation();
    });
    document.getElementById('housing-fund-base').addEventListener('input', function() {
        calculateHousingFund();
        updateDeductionCalculation();
        validateHousingFundBase();
    });
    // 缴费比例是用户自填项（各地口径不同，默认 5%）：input 事件即时重算，
    // 失焦时把留空/越界值归一，避免清空后公积金静默算成 0
    document.getElementById('housing-fund-rate').addEventListener('input', function() {
        calculateHousingFund();
        updateDeductionCalculation();
    });
    document.getElementById('housing-fund-rate').addEventListener('blur', function() {
        normalizeRateInput(this);
        calculateHousingFund();
        updateDeductionCalculation();
    });
    document.getElementById('elderly-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('children-infant-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('rent-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('housing-loan-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('education-deduction').addEventListener('input', updateDeductionCalculation);
    
    // 初始化认证系统
    // auth-ui 不带 ?v= 指纹：与 index.html 其余自有 JS 一致，新代码发放由服务器
    // ETag 协商缓存 + Service Worker network-first（ignoreSearch 兜底）保证，
    // 无需再手动递增指纹版本号（旧方案每次发版升 v 号、老用户仍要清缓存才生效）。
    import('/src/js/auth/auth-ui.js').then(({ initAuth }) => {
        initAuth();
    });
    
    // 初始化
    loadHistoryRecords();
    
    // 初始化分类所得页面
    resetClassificationCalculation();
    
    // 初始化社保金额计算（使用默认最低基数）
    calculateSocialSecurity();
    calculateHousingFund();
    updateDeductionCalculation();
});
