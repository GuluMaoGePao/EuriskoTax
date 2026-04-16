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

// 自定义提示模态框
function showAlert(message, callback) {
    const modal = document.getElementById('alert-modal');
    const messageElement = document.getElementById('alert-modal-message');
    const okButton = document.getElementById('alert-modal-ok');
    const closeButton = document.getElementById('close-alert-modal');

    messageElement.textContent = message;
    modal.classList.remove('hidden');

    function handleOk() {
        modal.classList.add('hidden');
        if (callback) callback();
        okButton.removeEventListener('click', handleOk);
        closeButton.removeEventListener('click', handleOk);
    }

    okButton.addEventListener('click', handleOk);
    closeButton.addEventListener('click', handleOk);
}

// 自定义确认模态框
function showConfirm(message, onConfirm, onCancel) {
    const modal = document.getElementById('confirm-modal');
    const messageElement = document.getElementById('confirm-modal-message');
    const confirmButton = document.getElementById('confirm-modal-confirm');
    const cancelButton = document.getElementById('confirm-modal-cancel');
    const closeButton = document.getElementById('close-confirm-modal');

    messageElement.textContent = message;
    modal.classList.remove('hidden');

    function handleConfirm() {
        modal.classList.add('hidden');
        if (onConfirm) onConfirm();
        cleanup();
    }

    function handleCancel() {
        modal.classList.add('hidden');
        if (onCancel) onCancel();
        cleanup();
    }

    function cleanup() {
        confirmButton.removeEventListener('click', handleConfirm);
        cancelButton.removeEventListener('click', handleCancel);
        closeButton.removeEventListener('click', handleCancel);
    }

    confirmButton.addEventListener('click', handleConfirm);
    cancelButton.addEventListener('click', handleCancel);
    closeButton.addEventListener('click', handleCancel);
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
                        <span class="font-medium">¥${item.type === 'business' ? item.results.incomeDetails.businessIncome.toFixed(2) : item.type === 'classification' ? item.results.totalIncome.toFixed(2) : item.type === 'reverse' ? item.results.incomeDetails.total.toFixed(2) : item.results.incomeDetails.total.toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">应纳税额：</span>
                        <span class="font-medium text-danger">¥${item.results.taxDetails.totalTax.toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">税后收入：</span>
                        <span class="font-medium text-primary">¥${item.type === 'business' ? item.results.taxDetails.netIncome.toFixed(2) : item.type === 'classification' ? (item.results.totalIncome - item.results.taxDetails.totalTax).toFixed(2) : item.results.taxDetails.netIncome.toFixed(2)}</span>
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
        document.getElementById('business-income').value = results.incomeDetails.businessIncome || 0;
        document.getElementById('business-cost').value = results.incomeDetails.businessCost || 0;
        document.getElementById('business-expenses').value = results.incomeDetails.businessExpenses || 0;
        document.getElementById('business-taxes').value = results.incomeDetails.businessTaxes || 0;
        document.getElementById('business-losses').value = results.incomeDetails.businessLosses || 0;
        document.getElementById('business-other-expenses').value = results.incomeDetails.businessOtherExpenses || 0;
        document.getElementById('business-previous-losses').value = results.incomeDetails.businessPreviousLosses || 0;
        
        // 扣除项
        document.getElementById('business-has-comprehensive-income').checked = results.deductionDetails.hasComprehensiveIncome ?? true;
        document.getElementById('business-special-additional-deduction').value = results.deductionDetails.specialAdditionalDeduction || 0;
        document.getElementById('business-other-deduction').value = results.deductionDetails.otherDeduction || 0;
        document.getElementById('business-prepaid-tax').value = results.taxDetails.prepaidTax || 0;
        
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
        
        // 清空现有条目
        classificationItems = [];
        
        // 填充条目
        if (results.items) {
            results.items.forEach(item => {
                addClassificationItem();
                const index = classificationItems.length - 1;
                document.getElementById(`classification-type-${index}`).value = item.type;
                document.getElementById(`classification-income-${index}`).value = item.income;
                document.getElementById(`classification-cost-${index}`).value = item.cost || 0;
            });
        }
        
        // 重新计算
        calculateClassificationTax();
        showClassificationStep(2);
        updateClassificationBudgetTable();
        updateClassificationCharts();
    } else if (record.type === 'reverse') {
        // 切换到反向倒算页面
        showPage('reverse-calculation-page');
        
        // 填充反向倒算数据
        const results = record.results;
        
        // 基本参数
        document.getElementById('reverse-type').value = results.reverseType || 'tax';
        document.getElementById('reverse-tax-input').value = results.taxInput || 0;
        document.getElementById('reverse-net-input').value = results.netInput || 0;
        document.getElementById('reverse-work-months').value = results.workMonths || 12;
        
        // 扣除项
        document.getElementById('reverse-basic-deduction').value = results.deductionDetails.basic || 0;
        document.getElementById('reverse-social-security-base').value = results.deductionDetails.socialSecurityBase || 0;
        document.getElementById('reverse-pension-insurance').value = results.deductionDetails.pensionInsurance || 0;
        document.getElementById('reverse-medical-insurance').value = results.deductionDetails.medicalInsurance || 0;
        document.getElementById('reverse-unemployment-insurance').value = results.deductionDetails.unemploymentInsurance || 0;
        document.getElementById('reverse-housing-fund').value = results.deductionDetails.housingFund || 0;
        document.getElementById('reverse-elderly-deduction').value = results.deductionDetails.elderly || 0;
        document.getElementById('reverse-children-infant-deduction').value = results.deductionDetails.childrenInfant || 0;
        document.getElementById('reverse-housing-deduction').value = results.deductionDetails.housing || 0;
        document.getElementById('reverse-education-deduction').value = results.deductionDetails.education || 0;
        document.getElementById('reverse-medical-deduction').value = results.deductionDetails.medical || 0;
        document.getElementById('reverse-other-deduction').value = results.deductionDetails.other || 0;
        
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
        document.getElementById('work-months').value = results.workMonths;
        document.getElementById('prepaid-tax').value = results.taxDetails.prepaidTax;
        
        // 收入明细
        document.getElementById('salary-income').value = results.incomeDetails.salary;
        document.getElementById('labor-income').value = results.incomeDetails.labor;
        document.getElementById('author-income').value = results.incomeDetails.author;
        document.getElementById('royalty-income').value = results.incomeDetails.royalty;
        document.getElementById('bonus-income').value = results.incomeDetails.bonus;
        document.getElementById('bonus-include').checked = results.incomeDetails.bonusInclude;
        
        // 扣除项明细
        document.getElementById('basic-deduction').value = results.deductionDetails.basic;
        
        // 专项扣除
        document.getElementById('social-security-base').value = results.deductionDetails.socialSecurityBase || 0;
        document.getElementById('pension-insurance').value = results.deductionDetails.pensionInsurance;
        document.getElementById('medical-insurance').value = results.deductionDetails.medicalInsurance;
        document.getElementById('unemployment-insurance').value = results.deductionDetails.unemploymentInsurance;
        document.getElementById('housing-fund').value = results.deductionDetails.housingFund;
        
        // 专项附加扣除
        document.getElementById('elderly-deduction').value = results.deductionDetails.elderly;
        document.getElementById('children-infant-deduction').value = results.deductionDetails.childrenInfant;
        
        // 住房类型
        const housingType = results.deductionDetails.housing > 1200 ? 'rent' : 'loan';
        document.getElementById('housing-type').value = housingType;
        
        // 住房贷款/租金扣除
        document.getElementById('housing-deduction').value = results.deductionDetails.housing;
        
        // 继续教育扣除
        document.getElementById('education-deduction').value = results.deductionDetails.education;
        
        // 大病医疗扣除
        document.getElementById('medical-deduction').value = results.deductionDetails.medical;
        
        // 其他扣除
        document.getElementById('other-deduction').value = results.deductionDetails.other;
        
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


