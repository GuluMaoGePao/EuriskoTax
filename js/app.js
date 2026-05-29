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
        // 初始化时显示计算模式选择器
        const calcModeSection = document.getElementById('reverse-calc-mode-section');
        if (calcModeSection) {
            calcModeSection.classList.remove('hidden');
        }
        // 初始化时触发一次倒算方式变更事件，更新描述文案
        document.getElementById('reverse-type').dispatchEvent(new Event('change'));
    });
    
    // 反向倒算页面倒算方式选择
    document.getElementById('reverse-type').addEventListener('change', function() {
        const type = this.value;
        const descriptionEl = document.querySelector('#reverse-calculation-page .text-gray-600');
        
        // 更新描述文案
        if (descriptionEl) {
            if (type === 'rate') {
                descriptionEl.textContent = '输入目标税率，反推税前收入';
            } else if (type === 'monthly') {
                descriptionEl.textContent = '输入月度税后收入，反推税前收入';
            } else if (type === 'both') {
                descriptionEl.textContent = '输入目标税额，反推税前收入';
            }
        }
        
        // 显示/隐藏相应的输入区域
        document.getElementById('reverse-rate-input').classList.add('hidden');
        document.getElementById('reverse-monthly-input').classList.add('hidden');
        document.getElementById('reverse-both-input').classList.add('hidden');
        
        // 显示/隐藏计算模式选择器（所有倒算方式都支持）
        const calcModeSection = document.getElementById('reverse-calc-mode-section');
        if (calcModeSection) {
            calcModeSection.classList.remove('hidden');
        }
        
        if (type === 'rate') {
            document.getElementById('reverse-rate-input').classList.remove('hidden');
        } else if (type === 'monthly') {
            document.getElementById('reverse-monthly-input').classList.remove('hidden');
        } else if (type === 'both') {
            document.getElementById('reverse-both-input').classList.remove('hidden');
        }
    });
    
    // 反向倒算页面所得类型选择
    document.getElementById('reverse-income-type').addEventListener('change', function() {
        const incomeType = this.value;
        
        // 显示/隐藏经营所得特有扣除项
        const businessSection = document.getElementById('reverse-business-deduction-section');
        if (businessSection) {
            if (incomeType === 'business') {
                businessSection.classList.remove('hidden');
            } else {
                businessSection.classList.add('hidden');
            }
        }
        
        // 显示/隐藏经营所得提示和年终奖
        const bonusSection = document.getElementById('reverse-bonus-income').closest('.form-group');
        const businessHint = document.getElementById('business-rate-hint');
        const reverseWorkMonths = document.getElementById('reverse-work-months').closest('.form-group');
        
        if (incomeType === 'business') {
            // 隐藏年终奖和工作月数（经营所得不适用）
            if (bonusSection) bonusSection.classList.add('hidden');
            if (reverseWorkMonths) reverseWorkMonths.classList.add('hidden');
            if (businessHint) businessHint.classList.remove('hidden');
            
            // 更新税率选项为经营所得税率
            const rateSelect = document.getElementById('reverse-target-rate');
            rateSelect.innerHTML = `
                <option value="5">5%（经营所得第1级）</option>
                <option value="10">10%（经营所得第2级）</option>
                <option value="20">20%（经营所得第3级）</option>
                <option value="30">30%（经营所得第4级）</option>
                <option value="35">35%（经营所得第5级）</option>
            `;
            rateSelect.value = '10';
            
            // 隐藏综合所得特有扣除项，显示经营所得特有扣除项
            document.getElementById('reverse-special-deduction-checkbox').closest('.mt-4')?.classList.add('hidden');
            document.getElementById('reverse-basic-deduction').closest('.form-group')?.classList.add('hidden');
        } else {
            // 显示年终奖和工作月数（综合所得适用）
            if (bonusSection) bonusSection.classList.remove('hidden');
            if (reverseWorkMonths) reverseWorkMonths.classList.remove('hidden');
            if (businessHint) businessHint.classList.add('hidden');
            
            // 恢复综合所得税率选项
            const rateSelect = document.getElementById('reverse-target-rate');
            rateSelect.innerHTML = `
                <option value="3">3%（综合所得第1级）</option>
                <option value="10">10%（综合所得第2级）</option>
                <option value="20">20%（综合所得第3级）</option>
                <option value="25">25%（综合所得第4级）</option>
                <option value="30">30%（综合所得第5级）</option>
                <option value="35">35%（综合所得第6级/经营所得第5级）</option>
                <option value="45">45%（综合所得第7级）</option>
            `;
            rateSelect.value = '3';
            
            // 显示综合所得特有扣除项
            document.getElementById('reverse-special-deduction-checkbox').closest('.mt-4')?.classList.remove('hidden');
            document.getElementById('reverse-basic-deduction').closest('.form-group')?.classList.remove('hidden');
        }
    });
    
    // 反向倒算页面扣除项显示/隐藏控制
    setupReverseDeductionToggle('reverse-special-deduction-checkbox', 'reverse-special-deduction-content');
    setupReverseDeductionToggle('reverse-special-additional-deduction-checkbox', 'reverse-special-additional-deduction-content');
    setupReverseDeductionToggle('reverse-other-deduction-checkbox', 'reverse-other-deduction-content');
    setupReverseDeductionToggle('reverse-business-deduction-checkbox', 'reverse-business-deduction-content');
    
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
    
    // 反向倒算页面企业年金复选框
    document.getElementById('reverse-enterprise-annuity-checkbox').addEventListener('change', function() {
        const content = document.getElementById('reverse-enterprise-annuity-fields');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面企业年金输入（仅更新显示，不触发计算）
    document.getElementById('reverse-enterprise-annuity').addEventListener('input', updateReverseDeductionCalculation);
    
    // 反向倒算页面个人养老金复选框
    document.getElementById('reverse-pension-deduction-checkbox').addEventListener('change', function() {
        const content = document.getElementById('reverse-pension-deduction-fields');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面商业健康保险复选框
    document.getElementById('reverse-insurance-other-deduction-checkbox').addEventListener('change', function() {
        const content = document.getElementById('reverse-insurance-other-deduction-fields');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面税收递延型养老保险复选框
    document.getElementById('reverse-tax-deferred-pension-checkbox').addEventListener('change', function() {
        const content = document.getElementById('reverse-tax-deferred-pension-fields');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateReverseDeductionCalculation();
    });
    
    // 反向倒算页面公益捐赠支出复选框
    document.getElementById('reverse-charitable-donation-checkbox').addEventListener('change', function() {
        const content = document.getElementById('reverse-charitable-donation-fields');
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateReverseDeductionCalculation();
    });
    
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
        calculateReverseHousingFund();
    });
    document.getElementById('reverse-housing-fund-rate').addEventListener('change', function() {
        calculateReverseHousingFund();
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
    document.getElementById('reverse-tax-deferred-pension').addEventListener('input', updateReverseDeductionCalculation);
    document.getElementById('reverse-charitable-donation').addEventListener('input', updateReverseDeductionCalculation);
    
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
    
    // 反向倒算页面新输入字段事件监听
    document.getElementById('reverse-target-rate').addEventListener('change', calculateReverseTax);
    document.getElementById('reverse-calc-mode').addEventListener('change', calculateReverseTax);
    document.getElementById('reverse-monthly-net').addEventListener('input', calculateReverseTax);
    document.getElementById('reverse-fixed-tax').addEventListener('input', calculateReverseTax);
    document.getElementById('reverse-fixed-net').addEventListener('input', calculateReverseTax);
    
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
        document.getElementById('reverse-pension-deduction-checkbox').checked = false;
        document.getElementById('reverse-pension-deduction').value = 0;
        document.getElementById('reverse-pension-deduction-fields').classList.add('hidden');
        document.getElementById('reverse-enterprise-annuity-checkbox').checked = false;
        document.getElementById('reverse-enterprise-annuity').value = 0;
        document.getElementById('reverse-enterprise-annuity-fields').classList.add('hidden');
        document.getElementById('reverse-insurance-other-deduction-checkbox').checked = false;
        document.getElementById('reverse-insurance-other-deduction').value = 0;
        document.getElementById('reverse-insurance-other-deduction-fields').classList.add('hidden');
        document.getElementById('reverse-tax-deferred-pension-checkbox').checked = false;
        document.getElementById('reverse-tax-deferred-pension').value = 0;
        document.getElementById('reverse-tax-deferred-pension-fields').classList.add('hidden');
        document.getElementById('reverse-charitable-donation-checkbox').checked = false;
        document.getElementById('reverse-charitable-donation').value = 0;
        document.getElementById('reverse-charitable-donation-fields').classList.add('hidden');
        
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
        // 重置是否有综合所得
        document.getElementById('business-has-comprehensive-income').checked = true;

        // 重置专项附加扣除
        document.getElementById('business-special-additional-deduction').value = 0;

        // 重置其他扣除
        document.getElementById('business-other-deduction').value = 0;

        // 重置已预缴税额
        document.getElementById('business-prepaid-tax').value = 0;

        // 重新计算
        calculateBusinessTax();
    });
    
    document.getElementById('calculate-business-btn').addEventListener('click', function() {
        // 验证输入
        if (!validateBusinessInput()) {
            return;
        }
        calculateBusinessTax();
        showBusinessStep(3);
        updateBusinessBudgetTable();
        updateBusinessCharts();
    });

    // 经营所得实时计算（步骤1输入时）
    const businessIncomeInputs = ['business-income', 'business-cost', 'business-expenses', 'business-taxes', 'business-losses', 'business-other-expenses', 'business-previous-losses'];
    businessIncomeInputs.forEach(function(inputId) {
        const element = document.getElementById(inputId);
        if (element) {
            element.addEventListener('input', function() {
                validateBusinessInputValue(inputId);
                performRealTimeBusinessCalculation();
            });
        }
    });

    // 经营所得实时计算（步骤2输入时）
    const businessDeductionInputs = ['business-special-additional-deduction', 'business-other-deduction', 'business-prepaid-tax'];
    businessDeductionInputs.forEach(function(inputId) {
        const element = document.getElementById(inputId);
        if (element) {
            element.addEventListener('input', function() {
                validateBusinessInputValue(inputId);
                performRealTimeBusinessCalculation();
            });
        }
    });

    // 经营所得综合所得勾选变化时
    const hasComprehensiveCheckbox = document.getElementById('business-has-comprehensive-income');
    if (hasComprehensiveCheckbox) {
        hasComprehensiveCheckbox.addEventListener('change', function() {
            performRealTimeBusinessCalculation();
        });
    }

    // 经营所得输入验证函数
    function validateBusinessInputValue(inputId) {
        const element = document.getElementById(inputId);
        if (!element) return true;

        const value = parseFloat(element.value);
        const originalValue = element.value;

        // 清除之前的错误状态
        element.classList.remove('input-error');

        // 验证是否为负数
        if (!isNaN(value) && value < 0) {
            element.classList.add('input-error');
            showBusinessInputError(element, '输入值不能为负数');
            return false;
        }

        // 验证是否为有效数字
        if (originalValue !== '' && isNaN(value)) {
            element.classList.add('input-error');
            showBusinessInputError(element, '请输入有效数字');
            return false;
        }

        return true;
    }

    // 显示输入错误提示
    function showBusinessInputError(element, message) {
        // 移除已存在的错误提示
        const existingError = element.parentElement.querySelector('.input-error-message');
        if (existingError) {
            existingError.remove();
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'input-error-message text-danger text-sm mt-1';
        errorDiv.textContent = message;
        element.parentElement.appendChild(errorDiv);

        // 3秒后自动移除
        setTimeout(function() {
            errorDiv.remove();
            element.classList.remove('input-error');
        }, 3000);
    }

    // 验证所有经营所得输入
    function validateBusinessInput() {
        let isValid = true;

        const inputs = ['business-income', 'business-cost', 'business-expenses', 'business-taxes', 'business-losses', 'business-other-expenses', 'business-previous-losses', 'business-special-additional-deduction', 'business-other-deduction', 'business-prepaid-tax'];

        inputs.forEach(function(inputId) {
            if (!validateBusinessInputValue(inputId)) {
                isValid = false;
            }
        });

        // 验证已预缴税额不能超过合理范围
        const prepaidTax = parseFloat(document.getElementById('business-prepaid-tax').value) || 0;
        const businessIncome = parseFloat(document.getElementById('business-income').value) || 0;
        if (prepaidTax > businessIncome * 0.45) {
            isValid = false;
            const element = document.getElementById('business-prepaid-tax');
            element.classList.add('input-error');
            showBusinessInputError(element, '已预缴税额不能超过收入的45%（最高税率）');
        }

        return isValid;
    }

    // 执行实时经营所得计算
    function performRealTimeBusinessCalculation() {
        try {
            calculateBusinessTax();
            // 如果当前在结果步骤，同步更新预算表
            const resultStep = document.getElementById('business-step-result');
            if (resultStep && !resultStep.classList.contains('hidden')) {
                updateBusinessBudgetTable();
                updateBusinessCharts();
            }
        } catch (error) {
            console.error('实时计算出错:', error);
        }
    }
    
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
   // 关闭关于模态框
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

    // 反向倒算保存按钮
    document.getElementById('save-reverse-calculation-btn').addEventListener('click', function() {
        if (Object.keys(reverseCalculationResults).length === 0) {
            showAlert('请先完成计算后再保存');
            return;
        }
        saveReverseCalculation();
    });

    // 分类所得保存按钮
    document.getElementById('save-classification-calculation-btn').addEventListener('click', function() {
        if (Object.keys(classificationCalculationResults).length === 0) {
            showAlert('请先完成计算后再保存');
            return;
        }
        saveClassificationCalculation();
    });

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

    // 保存经营所得计算结果
    document.getElementById('save-business-result-btn').addEventListener('click', function() {
        if (Object.keys(businessCalculationResults).length === 0) {
            showAlert('请先完成计算后再保存');
            return;
        }
        saveBusinessCalculation();
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
    });
    document.getElementById('housing-fund-rate').addEventListener('change', function() {
        calculateHousingFund();
        updateDeductionCalculation();
    });
    document.getElementById('elderly-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('children-infant-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('rent-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('housing-loan-deduction').addEventListener('input', updateDeductionCalculation);
    document.getElementById('education-deduction').addEventListener('input', updateDeductionCalculation);
    
    // 初始化认证系统
    import('./auth-ui.js').then(({ initAuth }) => {
        initAuth();
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