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
        const amount = count * 2000 * (rate / 100); // 每个子女/婴幼儿每月2000元，考虑扣除比例（月度金额）
        document.getElementById('reverse-children-infant-deduction').value = amount;
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面子女教育 + 婴幼儿照护扣除比例变化
    document.getElementById('reverse-children-infant-deduction-rate').addEventListener('change', function() {
        const count = parseInt(document.getElementById('reverse-children-infant-count').value) || 0;
        const rate = parseInt(this.value) || 100;
        const amount = count * 2000 * (rate / 100); // 每个子女/婴幼儿每月2000元，考虑扣除比例（月度金额）
        document.getElementById('reverse-children-infant-deduction').value = amount;
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面赡养老人类型选择
    document.getElementById('reverse-elderly-type').addEventListener('change', function() {
        const type = this.value;
        const elderlyDeduction = document.getElementById('reverse-elderly-deduction');
        if (type === 'only') {
            elderlyDeduction.max = 3000;
            elderlyDeduction.value = 3000; // 独生子女每月3000元（月度金额）
        } else if (type === 'non-only') {
            elderlyDeduction.max = 1500;
            elderlyDeduction.value = 1500; // 非独生子女每月1500元（月度金额）
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
        // 更新子女教育扣除（保持月度金额，不随工作月数变化）
        const count = parseInt(document.getElementById('reverse-children-infant-count').value) || 0;
        const rate = parseInt(document.getElementById('reverse-children-infant-deduction-rate').value) || 100;
        const amount = count * 2000 * (rate / 100); // 月度金额
        document.getElementById('reverse-children-infant-deduction').value = amount;
        
        // 更新赡养老人扣除（保持月度金额，不随工作月数变化）
        const elderlyType = document.getElementById('reverse-elderly-type').value;
        const elderlyDeduction = document.getElementById('reverse-elderly-deduction');
        if (elderlyType === 'only') {
            elderlyDeduction.max = 3000;
            elderlyDeduction.value = 3000; // 月度金额
        } else if (elderlyType === 'non-only') {
            elderlyDeduction.max = 1500;
            elderlyDeduction.value = 1500; // 月度金额
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
        // 重置扣除项复选框状态
        document.getElementById('reverse-special-deduction-checkbox').checked = true;
        document.getElementById('reverse-special-additional-deduction-checkbox').checked = false;
        document.getElementById('reverse-other-deduction-checkbox').checked = false;
        
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
        document.getElementById('reverse-rent-deduction').value = 1500; // 月度金额
        document.getElementById('reverse-housing-loan-deduction').value = 1000; // 月度金额
        
        // 重置继续教育复选框
        document.getElementById('reverse-education-degree-checkbox').checked = false;
        document.getElementById('reverse-education-professional-checkbox').checked = false;
        document.getElementById('reverse-education-deduction').value = 0;
        
        // 重置大病医疗数据
        document.getElementById('reverse-medical-deduction').value = 0;
        
        // 重置其他扣除数据
        document.getElementById('reverse-pension-deduction').value = 0;
        document.getElementById('reverse-enterprise-annuity').value = 0;
        document.getElementById('reverse-insurance-other-deduction').value = 0;
        document.getElementById('reverse-charitable-donation').value = 0;
        
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
        updateBusinessCharts();
    });
    
    // 经营所得页面重置按钮
    document.getElementById('reset-business-btn').addEventListener('click', resetBusinessCalculation);
    
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
        exportToPDF('step-result', '个人年度个税预算表');
    });
    
    // 导出Word按钮
    document.getElementById('export-word-btn').addEventListener('click', function() {
        exportToWord('step-result', '个人年度个税预算表');
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
        exportToPDF('reverse-result', '个人年度个税预算表（反向倒算）');
    });
    
    // 反向倒算页面导出Word按钮
    document.getElementById('export-reverse-word-btn').addEventListener('click', function() {
        exportToWord('reverse-result', '个人年度个税预算表（反向倒算）');
    });
    
    // 经营所得页面导出PDF按钮
    document.getElementById('export-business-pdf-btn').addEventListener('click', function() {
        exportToPDF('business-result', '经营所得年度预算表');
    });
    
    // 经营所得页面导出Word按钮
    document.getElementById('export-business-word-btn').addEventListener('click', function() {
        exportToWord('business-result', '经营所得年度预算表');
    });
    
    // 分类所得页面导出PDF按钮
    document.getElementById('export-classification-pdf-btn').addEventListener('click', function() {
        exportToPDF('classification-result', '分类所得计税表');
    });
    
    // 分类所得页面导出Word按钮
    document.getElementById('export-classification-word-btn').addEventListener('click', function() {
        exportToWord('classification-result', '分类所得计税表');
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
    
    // 收入明细相关事件监听器
    document.getElementById('labor-income').addEventListener('input', updateIncomeCalculation);
    document.getElementById('author-income').addEventListener('input', updateIncomeCalculation);
    document.getElementById('royalty-income').addEventListener('input', updateIncomeCalculation);
    document.getElementById('salary-income').addEventListener('input', updateIncomeCalculation);
    document.getElementById('bonus-income').addEventListener('input', updateIncomeCalculation);
    document.getElementById('bonus-include').addEventListener('change', updateIncomeCalculation);
    
    // 扣除项明细相关事件监听器
    document.getElementById('basic-deduction').addEventListener('input', updateDeductionCalculation);
    // 社保缴费相关事件监听器
    document.getElementById('social-security-base').addEventListener('input', function() {
        calculateSocialSecurity();
        updateDeductionCalculation();
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
        calculateSocialSecurity();
        updateDeductionCalculation();
    });
    document.getElementById('housing-fund-rate').addEventListener('change', function() {
        calculateSocialSecurity();
        updateDeductionCalculation();
    });
    document.getElementById('elderly-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('children-infant-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('rent-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('housing-loan-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('education-deduction').addEventListener('input', updateDeductionCalculation);
    
    // 初始化
    loadHistoryRecords();
    
    // 初始化反向倒算页面
    resetReverseCalculation();
    
    // 初始化经营所得页面
    resetBusinessCalculation();
    
    // 初始化分类所得页面
    resetClassificationCalculation();
});