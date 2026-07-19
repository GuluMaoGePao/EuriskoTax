// 全局变量
let calculationHistory = JSON.parse(localStorage.getItem('taxCalculationHistory') || '[]');

// 显示保存成功提示
function showSaveSuccessMessage() {
    // 创建提示元素
    const messageElement = document.createElement('div');
    messageElement.className = 'fixed top-6 right-6 bg-green-500 text-white px-5 py-3 rounded-lg shadow-xl z-50 transform transition-all duration-500 ease-out translate-x-full opacity-0';
    messageElement.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 10px 15px -3px rgba(0, 179, 89, 0.3)';
    
    // 添加内容
    messageElement.innerHTML = `
        <div class="flex items-center space-x-3">
            <div class="flex-shrink-0">
                <i class="fa fa-check-circle text-xl"></i>
            </div>
            <div>
                <p class="font-medium">保存成功</p>
                <p class="text-sm opacity-90">计算结果已保存到历史记录</p>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(messageElement);
    
    // 触发动画
    setTimeout(() => {
        messageElement.classList.remove('translate-x-full', 'opacity-0');
        messageElement.classList.add('translate-x-0', 'opacity-100');
    }, 10);
    
    // 3秒后自动消失
    setTimeout(() => {
        messageElement.classList.remove('translate-x-0', 'opacity-100');
        messageElement.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 500);
    }, 3000);
}

// 显示保存失败提示
function showSaveErrorMessage() {
    // 创建提示元素
    const messageElement = document.createElement('div');
    messageElement.className = 'fixed top-6 right-6 bg-red-500 text-white px-5 py-3 rounded-lg shadow-xl z-50 transform transition-all duration-500 ease-out translate-x-full opacity-0';
    messageElement.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 10px 15px -3px rgba(220, 38, 38, 0.3)';
    
    // 添加内容
    messageElement.innerHTML = `
        <div class="flex items-center space-x-3">
            <div class="flex-shrink-0">
                <i class="fa fa-exclamation-circle text-xl"></i>
            </div>
            <div>
                <p class="font-medium">保存失败</p>
                <p class="text-sm opacity-90">请检查网络连接后重试</p>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(messageElement);
    
    // 触发动画
    setTimeout(() => {
        messageElement.classList.remove('translate-x-full', 'opacity-0');
        messageElement.classList.add('translate-x-0', 'opacity-100');
    }, 10);
    
    // 3秒后自动消失
    setTimeout(() => {
        messageElement.classList.remove('translate-x-0', 'opacity-100');
        messageElement.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 500);
    }, 3000);
}



// 保存计算结果
function saveCalculationResult() {
    if (Object.keys(calculationResults).length === 0) {
        showAlert('请先进行计算，再保存结果');
        return;
    }
    
    try {
        // 生成唯一ID
        const id = Date.now().toString();
        
        // 构建保存的数据对象
        const savedData = {
            id: id,
            type: 'forward',
            title: `综合所得计税 - ${new Date().toLocaleDateString()}`,
            results: calculationResults,
            date: new Date().toISOString()
        };
        
        // 添加到历史记录
        calculationHistory.unshift(savedData);
        
        // 限制历史记录数量
        if (calculationHistory.length > 50) {
            calculationHistory = calculationHistory.slice(0, 50);
        }
        
        // 保存到本地存储
        localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));
        
        // 显示保存成功提示
        showSaveSuccessMessage();
        
    } catch (error) {
        console.error('保存计算结果失败:', error);
        showSaveErrorMessage();
    }
}

// 辅助函数：安全获取收入值
function getIncomeValue(item) {
    try {
        if (item.type === 'business') {
            return item.results?.incomeDetails?.businessIncome || 0;
        } else if (item.type === 'classification') {
            return item.results?.totalIncome || 0;
        } else if (item.type === 'reverse') {
            // 兼容新旧数据结构
            return item.results?.incomeDetails?.total || item.results?.totalIncome || 0;
        } else {
            return item.results?.incomeDetails?.total || 0;
        }
    } catch (e) {
        return 0;
    }
}

// 辅助函数：安全获取税额值
function getTaxValue(item) {
    try {
        return item.results?.taxDetails?.totalTax || item.results?.totalTax || 0;
    } catch (e) {
        return 0;
    }
}

// 辅助函数：安全获取税后收入值
function getNetIncomeValue(item) {
    try {
        if (item.type === 'business') {
            return item.results?.taxDetails?.netIncome || 0;
        } else if (item.type === 'classification') {
            const totalIncome = item.results?.totalIncome || 0;
            const totalTax = item.results?.taxDetails?.totalTax || item.results?.totalTax || 0;
            return Math.max(0, totalIncome - totalTax);
        } else {
            // 兼容新旧数据结构
            return item.results?.taxDetails?.netIncome || item.results?.netIncome || 0;
        }
    } catch (e) {
        return 0;
    }
}

// 加载历史记录
function loadHistoryRecords() {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;
    
    // 清空历史记录列表
    historyList.innerHTML = '';
    
    if (calculationHistory.length === 0) {
        historyList.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fa fa-history text-4xl mb-2"></i>
                <p>暂无保存的计算记录</p>
            </div>
        `;
        return;
    }
    
    // 生成历史记录列表
    calculationHistory.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'card';
        
        const date = new Date(item.date);
        const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        
        // 安全获取值
        const incomeValue = getIncomeValue(item);
        const taxValue = getTaxValue(item);
        const netIncomeValue = getNetIncomeValue(item);
        
        historyItem.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-medium text-gray-800">${item.title}</h4>
                    <p class="text-sm text-gray-500 mt-1">${formattedDate}</p>
                </div>
                <div class="flex space-x-2">
                    <button class="btn bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm px-2 py-1" onclick="viewHistoryRecord('${item.id}')">
                        <i class="fa fa-eye mr-1"></i> 查看
                    </button>
                    <button class="btn bg-danger text-white hover:bg-danger/90 text-sm px-2 py-1" onclick="deleteHistoryRecord('${item.id}')">
                        <i class="fa fa-trash mr-1"></i> 删除
                    </button>
                </div>
            </div>
            <div class="mt-3 pt-3 border-t border-gray-100">
                <div class="grid grid-cols-3 gap-2 text-sm">
                    <div>
                        <span class="text-gray-500">收入：</span>
                        <span class="font-medium">¥${incomeValue.toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">应纳税额：</span>
                        <span class="font-medium text-danger">¥${taxValue.toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">税后收入：</span>
                        <span class="font-medium text-primary">¥${netIncomeValue.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
        
        historyList.appendChild(historyItem);
    });
}

// 查看历史记录
function viewHistoryRecord(id) {
    const record = calculationHistory.find(item => item.id === id);
    if (!record) return;
    
    // 根据记录类型切换到相应页面
    if (record.type === 'business') {
        // 切换到经营所得页面
        showPage('business-calculation-page');
        
        // 填充经营所得数据
        const results = record.results;
        
        // 基本信息
        document.getElementById('business-income').value = results?.incomeDetails?.businessIncome || 0;
        document.getElementById('business-cost').value = results?.incomeDetails?.businessCost || 0;
        document.getElementById('business-expenses').value = results?.incomeDetails?.businessExpenses || 0;
        document.getElementById('business-taxes').value = results?.incomeDetails?.businessTaxes || 0;
        document.getElementById('business-losses').value = results?.incomeDetails?.businessLosses || 0;
        document.getElementById('business-other-expenses').value = results?.incomeDetails?.businessOtherExpenses || 0;
        document.getElementById('business-previous-losses').value = results?.incomeDetails?.businessPreviousLosses || 0;
        
        // 扣除项
        const deductionDetails = results?.deductionDetails || {};
        document.getElementById('business-has-comprehensive-income').checked = deductionDetails.hasComprehensiveIncome ?? true;
        
        // 专项扣除 - 兼容新旧格式
        const specialDeduction = deductionDetails.specialDeduction || {};
        const hasSpecialDeduction = typeof specialDeduction === 'object' && specialDeduction.total > 0;
        document.getElementById('business-special-deduction-checkbox').checked = hasSpecialDeduction;
        if (hasSpecialDeduction) {
            document.getElementById('business-special-deduction-content').classList.remove('hidden');
            document.getElementById('business-pension-insurance').value = specialDeduction.pensionInsurance || 0;
            document.getElementById('business-medical-insurance').value = specialDeduction.medicalInsurance || 0;
            document.getElementById('business-unemployment-insurance').value = specialDeduction.unemploymentInsurance || 0;
            document.getElementById('business-housing-fund').value = specialDeduction.housingFund || 0;
        }
        
        // 专项附加扣除 - 兼容新旧格式（旧格式是数字，新格式是对象）
        const rawSpecialAdditional = deductionDetails.specialAdditionalDeduction || {};
        const specialAdditional = typeof rawSpecialAdditional === 'number' 
            ? { total: rawSpecialAdditional, childrenInfant: 0, elderly: 0, housing: 0, education: 0, medical: 0 }
            : rawSpecialAdditional;
        const hasSpecialAdditional = specialAdditional.total > 0;
        document.getElementById('business-special-additional-checkbox').checked = hasSpecialAdditional;
        if (hasSpecialAdditional) {
            document.getElementById('business-special-additional-content').classList.remove('hidden');
            document.getElementById('business-children-infant-deduction').value = specialAdditional.childrenInfant || 0;
            document.getElementById('business-elderly-deduction').value = specialAdditional.elderly || 0;
            document.getElementById('business-housing-deduction').value = specialAdditional.housing || 0;
            document.getElementById('business-education-deduction').value = specialAdditional.education || 0;
            document.getElementById('business-medical-deduction').value = specialAdditional.medical || 0;
        }
        
        // 其他扣除 - 兼容新旧格式（旧格式是数字，新格式是对象）
        const rawOtherDeduction = deductionDetails.otherDeduction || {};
        const otherDeduction = typeof rawOtherDeduction === 'number'
            ? { total: rawOtherDeduction, pension: 0, enterpriseAnnuity: 0, insurance: 0, charitableDonation: 0 }
            : rawOtherDeduction;
        const hasOtherDeduction = otherDeduction.total > 0;
        document.getElementById('business-other-deduction-checkbox').checked = hasOtherDeduction;
        if (hasOtherDeduction) {
            document.getElementById('business-other-deduction-content').classList.remove('hidden');
            
            if (otherDeduction.pension > 0) {
                document.getElementById('business-pension-checkbox').checked = true;
                document.getElementById('business-pension-fields').classList.remove('hidden');
                document.getElementById('business-pension-deduction').value = otherDeduction.pension || 0;
            }
            if (otherDeduction.enterpriseAnnuity > 0) {
                document.getElementById('business-enterprise-annuity-checkbox').checked = true;
                document.getElementById('business-enterprise-annuity-fields').classList.remove('hidden');
                document.getElementById('business-enterprise-annuity').value = otherDeduction.enterpriseAnnuity || 0;
            }
            if (otherDeduction.insurance > 0) {
                document.getElementById('business-insurance-checkbox').checked = true;
                document.getElementById('business-insurance-fields').classList.remove('hidden');
                document.getElementById('business-insurance-deduction').value = otherDeduction.insurance || 0;
            }
            if (otherDeduction.charitableDonation > 0) {
                document.getElementById('business-charitable-checkbox').checked = true;
                document.getElementById('business-charitable-fields').classList.remove('hidden');
                document.getElementById('business-charitable-donation').value = otherDeduction.charitableDonation || 0;
            }
        }
        
        document.getElementById('business-prepaid-tax').value = results?.taxDetails?.prepaidTax || 0;
        
        // 重新计算
        calculateBusinessTax();
        showBusinessStep(3);
        updateBusinessBudgetTable();
        updateBusinessCharts();
    } else if (record.type === 'classification') {
        // 切换到分类所得页面
        showPage('classification-calculation-page');
        
        // 填充分类所得数据
        const results = record.results;
        
        // 恢复数据
        classificationCalculationResults = results;
        if (results.items) {
            classificationItems = [...results.items];
        }
        
        // 重新计算和显示
        updateClassificationItemsList();
        updateClassificationResultDisplay();
        updateClassificationBudgetTable();
        updateClassificationCharts();
        
        // 更新日期
        const dateElement = document.getElementById('classification-budget-table-date');
        if (dateElement && results.calculationDate) {
            dateElement.textContent = new Date(results.calculationDate).toLocaleDateString();
        }
        
        showClassificationStep(2);
    } else if (record.type === 'reverse') {
        // 切换到反向倒算页面
        showPage('reverse-calculation-page');
        
        // 填充反向倒算数据
        const results = record.results;
        
        // 基本参数
        document.getElementById('reverse-type').value = results?.reverseType || 'rate';
        document.getElementById('reverse-work-months').value = results?.workMonths || 12;
        
        // 扣除项
        document.getElementById('reverse-basic-deduction').value = results?.deductionDetails?.basic || 0;
        document.getElementById('reverse-social-security-base').value = results?.deductionDetails?.socialSecurityBase || 0;
        document.getElementById('reverse-pension-insurance').value = results?.deductionDetails?.pensionInsurance || 0;
        document.getElementById('reverse-medical-insurance').value = results?.deductionDetails?.medicalInsurance || 0;
        document.getElementById('reverse-unemployment-insurance').value = results?.deductionDetails?.unemploymentInsurance || 0;
        document.getElementById('reverse-housing-fund').value = results?.deductionDetails?.housingFund || 0;
        document.getElementById('reverse-elderly-deduction').value = results?.deductionDetails?.elderly || 0;
        document.getElementById('reverse-children-infant-deduction').value = results?.deductionDetails?.childrenInfant || 0;
        document.getElementById('reverse-housing-deduction').value = results?.deductionDetails?.housing || 0;
        document.getElementById('reverse-education-deduction').value = results?.deductionDetails?.education || 0;
        document.getElementById('reverse-medical-deduction').value = results?.deductionDetails?.medical || 0;
        document.getElementById('reverse-other-deduction').value = results?.deductionDetails?.other || 0;
        
        // 重新计算
        calculateReverseTax();
        showReverseStep(3);
        updateReverseBudgetTable();
        updateReverseCharts();
    } else {
        // 切换到正向计税页面
        showPage('forward-calculation-page');
        
        // 填充数据到表单
        const results = record.results;
        
        // 基本参数
        document.getElementById('work-months').value = results?.workMonths || 12;
        document.getElementById('prepaid-tax').value = results?.taxDetails?.prepaidTax || 0;
        
        // 收入明细
        document.getElementById('salary-income').value = results?.incomeDetails?.salary || 0;
        document.getElementById('labor-income').value = results?.incomeDetails?.labor || 0;
        document.getElementById('author-income').value = results?.incomeDetails?.author || 0;
        document.getElementById('royalty-income').value = results?.incomeDetails?.royalty || 0;
        document.getElementById('bonus-income').value = results?.incomeDetails?.bonus || 0;
        document.getElementById('bonus-include').checked = results?.incomeDetails?.bonusInclude ?? false;
        
        // 扣除项明细
        document.getElementById('basic-deduction').value = results?.deductionDetails?.basic || 5000;
        
        // 专项扣除
        document.getElementById('social-security-base').value = results?.deductionDetails?.socialSecurityBase || 0;
        document.getElementById('pension-insurance').value = results?.deductionDetails?.pensionInsurance || 0;
        document.getElementById('medical-insurance').value = results?.deductionDetails?.medicalInsurance || 0;
        document.getElementById('unemployment-insurance').value = results?.deductionDetails?.unemploymentInsurance || 0;
        document.getElementById('housing-fund').value = results?.deductionDetails?.housingFund || 0;
        
        // 专项附加扣除
        document.getElementById('elderly-deduction').value = results?.deductionDetails?.elderly || 0;
        document.getElementById('children-infant-deduction').value = results?.deductionDetails?.childrenInfant || 0;
        
        // 住房类型
        const housingType = (results?.deductionDetails?.housing || 0) > 1200 ? 'rent' : 'loan';
        document.getElementById('housing-type').value = housingType;
        
        // 住房贷款/租金扣除
        document.getElementById('housing-deduction').value = results?.deductionDetails?.housing || 0;
        
        // 继续教育扣除
        document.getElementById('education-deduction').value = results?.deductionDetails?.education || 0;
        
        // 大病医疗扣除
        document.getElementById('medical-deduction').value = results?.deductionDetails?.medical || 0;
        
        // 其他扣除
        document.getElementById('other-deduction').value = results?.deductionDetails?.other || 0;
        
        // 重新计算
        calculateTax();
        goToStep(3);
        updateBudgetTable();
        updateCharts();
    }
}

// 删除历史记录
function deleteHistoryRecord(id) {
    showConfirm('确定要删除这条记录吗？', function() {
        calculationHistory = calculationHistory.filter(item => item.id !== id);
        localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));
        loadHistoryRecords();
    });
}
