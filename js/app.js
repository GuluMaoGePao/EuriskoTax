// 页面加载完成后绑定事件
window.addEventListener('DOMContentLoaded', function() {
    // 模式选择按钮
    document.getElementById('forward-mode-btn').addEventListener('click', function() {
        showPage('forward-calculation-page');
        goToStep(1);
    });
    

    
    document.getElementById('business-mode-btn').addEventListener('click', function() {
        showPage('business-calculation-page');
        showBusinessStep(1);
    });
    
    document.getElementById('classification-mode-btn').addEventListener('click', function() {
        showPage('classification-calculation-page');
        showClassificationStep(1);
    });
    
    document.getElementById('reverse-mode-btn').addEventListener('click', function() {
        showPage('reverse-calculation-page');
        showReverseStep(1);
    });
    
    // 反向倒算页面扣除项显示/隐藏控制
    setupReverseDeductionToggle('reverse-special-deduction-checkbox', 'reverse-special-deduction-content');
    setupReverseDeductionToggle('reverse-special-additional-deduction-checkbox', 'reverse-special-additional-deduction-content');
    setupReverseDeductionToggle('reverse-other-deduction-checkbox', 'reverse-other-deduction-content');
    
    // 反向倒算页面住房类型选择
    document.getElementById('reverse-housing-type').addEventListener('change', function() {
        const type = this.value;
        document.getElementById('reverse-rent-fields').classList.add('hidden');
        document.getElementById('reverse-loan-fields').classList.add('hidden');
        
        if (type === 'rent') {
            document.getElementById('reverse-rent-fields').classList.remove('hidden');
        } else if (type === 'loan') {
            document.getElementById('reverse-loan-fields').classList.remove('hidden');
        }
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面继续教育复选框
    document.getElementById('reverse-education-degree-checkbox').addEventListener('change', updateReverseEducationDeduction);
    document.getElementById('reverse-education-professional-checkbox').addEventListener('change', updateReverseEducationDeduction);
    
    // 反向倒算页面社保缴费相关事件监听器
    document.getElementById('reverse-social-security-base').addEventListener('input', function() {
        calculateReverseSocialSecurity();
    });
    document.getElementById('reverse-pension-insurance').addEventListener('input', function() {
        calculateReverseSocialSecurityRate('pension');
    });
    document.getElementById('reverse-pension-rate').addEventListener('input', function() {
        calculateReverseSocialSecurity();
    });
    document.getElementById('reverse-medical-insurance').addEventListener('input', function() {
        calculateReverseSocialSecurityRate('medical');
    });
    document.getElementById('reverse-medical-rate').addEventListener('input', function() {
        calculateReverseSocialSecurity();
    });
    document.getElementById('reverse-unemployment-insurance').addEventListener('input', function() {
        calculateReverseSocialSecurityRate('unemployment');
    });
    document.getElementById('reverse-unemployment-rate').addEventListener('input', function() {
        calculateReverseSocialSecurity();
    });
    document.getElementById('reverse-housing-fund').addEventListener('input', function() {
        calculateReverseSocialSecurityRate('housing');
    });
    document.getElementById('reverse-housing-fund-base').addEventListener('input', function() {
        calculateReverseSocialSecurity();
    });
    document.getElementById('reverse-housing-fund-rate').addEventListener('change', function() {
        calculateReverseSocialSecurity();
    });
    
    // 反向倒算页面子女教育 + 婴幼儿照护数量输入
    document.getElementById('reverse-children-infant-count').addEventListener('input', function() {
        const count = parseInt(this.value) || 0;
        const rate = parseInt(document.getElementById('reverse-children-infant-deduction-rate').value) || 100;
        const workMonths = parseInt(document.getElementById('reverse-work-months').value) || 12;
        const amount = count * 2000 * (rate / 100) * workMonths; // 每个子女/婴幼儿每月2000元，考虑扣除比例和工作月数
        document.getElementById('reverse-children-infant-deduction').value = amount;
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面子女教育 + 婴幼儿照护扣除比例变化
    document.getElementById('reverse-children-infant-deduction-rate').addEventListener('change', function() {
        const count = parseInt(document.getElementById('reverse-children-infant-count').value) || 0;
        const rate = parseInt(this.value) || 100;
        const workMonths = parseInt(document.getElementById('reverse-work-months').value) || 12;
        const amount = count * 2000 * (rate / 100) * workMonths; // 每个子女/婴幼儿每月2000元，考虑扣除比例和工作月数
        document.getElementById('reverse-children-infant-deduction').value = amount;
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面赡养老人类型选择
    document.getElementById('reverse-elderly-type').addEventListener('change', function() {
        const type = this.value;
        const elderlyDeduction = document.getElementById('reverse-elderly-deduction');
        const workMonths = parseInt(document.getElementById('reverse-work-months').value) || 12;
        if (type === 'only') {
            elderlyDeduction.max = 3000 * workMonths;
            elderlyDeduction.value = 3000 * workMonths;
        } else if (type === 'non-only') {
            elderlyDeduction.max = 1500 * workMonths;
            elderlyDeduction.value = 1500 * workMonths;
        } else {
            elderlyDeduction.max = 0;
            elderlyDeduction.value = 0;
        }
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面大病医疗输入
    document.getElementById('reverse-medical-deduction').addEventListener('input', updateReverseDeductionCalculation);
    
    // 反向倒算页面其他扣除输入
    document.getElementById('reverse-pension-deduction').addEventListener('input', updateReverseDeductionCalculation);
    document.getElementById('reverse-insurance-other-deduction').addEventListener('input', updateReverseDeductionCalculation);
    
    // 反向倒算页面工作月数变化
    document.getElementById('reverse-work-months').addEventListener('change', function() {
        updateReverseDeductionCalculation();
        // 更新子女教育扣除
        const count = parseInt(document.getElementById('reverse-children-infant-count').value) || 0;
        const rate = parseInt(document.getElementById('reverse-children-infant-deduction-rate').value) || 100;
        const workMonths = parseInt(this.value) || 12;
        const amount = count * 2000 * (rate / 100) * workMonths;
        document.getElementById('reverse-children-infant-deduction').value = amount;
        
        // 更新赡养老人扣除
        const elderlyType = document.getElementById('reverse-elderly-type').value;
        const elderlyDeduction = document.getElementById('reverse-elderly-deduction');
        if (elderlyType === 'only') {
            elderlyDeduction.max = 3000 * workMonths;
            elderlyDeduction.value = 3000 * workMonths;
        } else if (elderlyType === 'non-only') {
            elderlyDeduction.max = 1500 * workMonths;
            elderlyDeduction.value = 1500 * workMonths;
        } else {
            elderlyDeduction.max = 0;
            elderlyDeduction.value = 0;
        }
        
        // 更新继续教育扣除
        updateReverseEducationDeduction();
        
        // 重新计算
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面税额输入
    document.getElementById('reverse-total-tax').addEventListener('input', calculateReverseTax);
    
    // 反向倒算按钮
    document.getElementById('calculate-reverse-btn').addEventListener('click', function() {
        calculateReverseTax();
        showReverseStep(3);
        updateReverseBudgetTable();
        updateReverseCharts();
    });
    
    // 反向倒算页面导航按钮
    document.getElementById('reverse-back-to-parameters-btn').addEventListener('click', function() {
        showReverseStep(1);
    });
    
    document.getElementById('reverse-next-to-deductions-btn').addEventListener('click', function() {
        showReverseStep(2);
    });
    
    // 反向倒算页面重置按钮
    document.getElementById('reset-reverse-btn').addEventListener('click', resetReverseCalculation);
    
    // 反向倒算扣除项明细页面重置按钮
    document.getElementById('reset-reverse-deduction-btn').addEventListener('click', function() {
        // 重置专项扣除数据
        document.getElementById('reverse-social-security-base').value = 0;
        document.getElementById('reverse-housing-fund-base').value = 0;
        document.getElementById('reverse-pension-insurance').value = 0;
        document.getElementById('reverse-medical-insurance').value = 0;
        document.getElementById('reverse-unemployment-insurance').value = 0;
        document.getElementById('reverse-housing-fund').value = 0;
        document.getElementById('reverse-pension-rate').value = 8;
        document.getElementById('reverse-medical-rate').value = 2;
        document.getElementById('reverse-unemployment-rate').value = 0.5;
        document.getElementById('reverse-housing-fund-rate').value = 5;
        
        // 重置专项附加扣除数据
        document.getElementById('reverse-children-infant-count').value = 0;
        document.getElementById('reverse-children-infant-deduction').value = 0;
        document.getElementById('reverse-elderly-type').value = 'none';
        document.getElementById('reverse-elderly-deduction').value = 0;
        document.getElementById('reverse-housing-type').value = 'none';
        document.getElementById('reverse-rent-deduction').value = 18000;
        document.getElementById('reverse-housing-loan-deduction').value = 12000;
        
        // 重置继续教育复选框
        document.getElementById('reverse-education-degree-checkbox').checked = false;
        document.getElementById('reverse-education-professional-checkbox').checked = false;
        document.getElementById('reverse-education-deduction').value = 0;
        
        // 重置大病医疗数据
        document.getElementById('reverse-medical-deduction').value = 0;
        
        // 重置其他扣除数据
        document.getElementById('reverse-pension-deduction').value = 0;
        document.getElementById('reverse-insurance-other-deduction').value = 0;
        
        // 重置显示状态
        document.getElementById('reverse-special-deduction-content').classList.remove('hidden');
        document.getElementById('reverse-special-additional-deduction-content').classList.add('hidden');
        document.getElementById('reverse-other-deduction-content').classList.add('hidden');
        document.getElementById('reverse-rent-fields').classList.add('hidden');
        document.getElementById('reverse-loan-fields').classList.add('hidden');
        
        // 重置大病医疗实际可扣除额显示
        document.getElementById('reverse-actual-medical-deduction-display').textContent = '实际可扣除额：0 元';
        
        // 重新计算并更新显示
        updateReverseDeductionCalculation();
    });
    
    // 经营所得页面导航按钮
    document.getElementById('business-back-to-income-cost-btn').addEventListener('click', function() {
        showBusinessStep(1);
    });
    
    document.getElementById('business-next-to-deductions-btn').addEventListener('click', function() {
        showBusinessStep(2);
    });
    
    // 经营所得扣除项明细页面重置按钮
    document.getElementById('reset-business-deduction-btn').addEventListener('click', function() {
        // 重置投资者减除费用
        document.getElementById('business-investor-deduction').value = 60000;
        
        // 重置其他扣除
        document.getElementById('business-other-deduction').value = 0;
        
        // 重置已预缴税额
        document.getElementById('business-prepaid-tax').value = 0;
    });
    
    document.getElementById('calculate-business-btn').addEventListener('click', function() {
        calculateBusinessTax();
        showBusinessStep(3);
        updateBusinessBudgetTable();
    });
    
    // 经营所得页面重置按钮
    document.getElementById('reset-business-btn').addEventListener('click', resetBusinessCalculation);
    
    // 分类所得页面导航按钮
    document.getElementById('calculate-classification-btn').addEventListener('click', function() {
        showClassificationStep(2);
        setTimeout(function() {
            calculateClassificationTax();
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
    
    // 返回按钮
    document.getElementById('back-to-mode-selection').addEventListener('click', function() {
        showPage('mode-selection-page');
    });
    
    document.getElementById('back-to-mode-selection-reverse').addEventListener('click', function() {
        showPage('mode-selection-page');
    });
    
    document.getElementById('back-to-mode-selection-business').addEventListener('click', function() {
        showPage('mode-selection-page');
    });
    
    document.getElementById('back-to-mode-selection-classification').addEventListener('click', function() {
        showPage('mode-selection-page');
    });
    
    // 历史记录按钮
    document.getElementById('history-btn').addEventListener('click', function() {
        showPage('history-page');
        loadHistoryRecords();
    });
    
    // 关于按钮
    document.getElementById('about-btn').addEventListener('click', function() {
        document.getElementById('about-modal').classList.remove('hidden');
    });
    
    // 帮助按钮
    document.getElementById('help-btn').addEventListener('click', function() {
        document.getElementById('help-modal').classList.remove('hidden');
    });
    
    // 关闭模态框按钮
    document.getElementById('close-help-modal').addEventListener('click', function() {
        document.getElementById('help-modal').classList.add('hidden');
    });
    
    document.getElementById('close-about-modal').addEventListener('click', function() {
        document.getElementById('about-modal').classList.add('hidden');
    });
    
    // 正向计税页面导航按钮
    document.getElementById('next-to-income-btn').addEventListener('click', function() {
        goToStep(2);
    });
   // 收入明细页面导航按钮
    document.getElementById('back-to-parameters-btn').addEventListener('click', function() {
        goToStep(1);
    });
    
    document.getElementById('next-to-deductions-btn').addEventListener('click', function() {
        goToStep(3);
    });
    
    // 收入明细页面重置按钮
    document.getElementById('reset-income-btn').addEventListener('click', function() {
        resetIncomeData();
    });
    
    document.getElementById('back-to-income-btn').addEventListener('click', function() {
        goToStep(2);
    });
    
    // 扣除项明细页面重置按钮
    document.getElementById('reset-deduction-btn').addEventListener('click', function() {
        resetDeductionData();
    });
    
    document.getElementById('next-to-result-btn').addEventListener('click', function() {
        calculateTax();
        goToStep(4);
        updateBudgetTable();
        updateCharts();
        generateOptimizationTips();
    });
    
    // 正向计税页面重置按钮
    document.getElementById('reset-parameters-btn').addEventListener('click', resetForwardCalculation);
    
    // 保存计算结果按钮
    document.getElementById('save-calculation-btn').addEventListener('click', saveCalculationResult);
    
    // 导出PDF按钮
    document.getElementById('export-pdf-btn').addEventListener('click', function() {
        exportToPDF('tax-budget-table', '个人年度个税预算表');
    });
    
    document.getElementById('print-report-btn').addEventListener('click', function() {
        printElement('step-result');
    });
    
    // 新计算按钮
    document.getElementById('new-calculation-btn').addEventListener('click', function() {
        resetForwardCalculation();
    });
    
    document.getElementById('new-reverse-calculation-btn').addEventListener('click', function() {
        resetReverseCalculation();
        showReverseStep(1);
    });
    
    document.getElementById('new-business-calculation-btn').addEventListener('click', function() {
        resetBusinessCalculation();
        showBusinessStep(1);
    });
    
    document.getElementById('new-classification-calculation-btn').addEventListener('click', function() {
        resetClassificationCalculation();
        showClassificationStep(1);
    });
    
    // 反向倒算页面导出PDF按钮
    document.getElementById('export-reverse-pdf-btn').addEventListener('click', function() {
        exportToPDF('reverse-tax-budget-table', '个人年度个税预算表（反向倒算）');
    });
    
    document.getElementById('print-reverse-report-btn').addEventListener('click', function() {
        printElement('reverse-result');
    });
    
    // 经营所得页面导出PDF按钮
    document.getElementById('export-business-pdf-btn').addEventListener('click', function() {
        exportToPDF('business-tax-budget-table', '经营所得年度预算表');
    });
    
    document.getElementById('print-business-report-btn').addEventListener('click', function() {
        printElement('business-result');
    });
    
    // 分类所得页面导出PDF按钮
    document.getElementById('export-classification-pdf-btn').addEventListener('click', function() {
        exportToPDF('classification-tax-budget-table', '分类所得计税表');
    });
    
    document.getElementById('print-classification-report-btn').addEventListener('click', function() {
        printElement('classification-result');
    });
    
    // 历史记录页面返回按钮
    document.getElementById('back-to-home-btn').addEventListener('click', function() {
        showPage('mode-selection-page');
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
    document.getElementById('education-degree-checkbox').addEventListener('change', function() {
        let amount = 0;
        if (document.getElementById('education-degree-checkbox').checked) {
            amount += 400; // 学历教育400元/月
        }
        if (document.getElementById('education-professional-checkbox').checked) {
            amount += 300; // 职业资格300元/月
        }
        document.getElementById('education-deduction').value = amount;
        updateDeductionCalculation();
    });
    
    document.getElementById('education-professional-checkbox').addEventListener('change', function() {
        let amount = 0;
        if (document.getElementById('education-degree-checkbox').checked) {
            amount += 400; // 学历教育400元/月
        }
        if (document.getElementById('education-professional-checkbox').checked) {
            amount += 300; // 职业资格300元/月
        }
        document.getElementById('education-deduction').value = amount;
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
    
    // 工作月数变化
    document.getElementById('work-months').addEventListener('change', function() {
        updateIncomeCalculation();
        updateDeductionCalculation();
    });
    
    // 初始化
    loadHistoryRecords();
    
    // 初始化反向倒算页面
    resetReverseCalculation();
    
    // 初始化经营所得页面
    resetBusinessCalculation();
    
    // 初始化分类所得页面
    resetClassificationCalculation();
});