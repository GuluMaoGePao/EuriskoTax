// 页面切换
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
    });
    document.getElementById(pageId).classList.remove('hidden');
}

// 通用步骤导航函数
function updateStepIndicator(pageId, step) {
    // 更新步骤指示器
    const steps = document.querySelectorAll(`#${pageId} .step-number`);
    const stepTitles = document.querySelectorAll(`#${pageId} .step-title`);
    const stepLines = document.querySelectorAll(`#${pageId} .step-line`);
    
    steps.forEach((stepEl, index) => {
        const stepNum = index + 1;
        if (stepNum < step) {
            stepEl.classList.remove('active');
            stepEl.classList.add('completed');
            stepEl.textContent = '✓';
        } else if (stepNum === step) {
            stepEl.classList.add('active');
            stepEl.classList.remove('completed');
            stepEl.textContent = stepNum;
        } else {
            stepEl.classList.remove('active', 'completed');
            stepEl.textContent = stepNum;
        }
    });
    
    stepTitles.forEach((titleEl, index) => {
        const stepNum = index + 1;
        if (stepNum < step) {
            titleEl.classList.remove('active');
            titleEl.classList.add('completed');
        } else if (stepNum === step) {
            titleEl.classList.add('active');
            titleEl.classList.remove('completed');
        } else {
            titleEl.classList.remove('active', 'completed');
        }
    });
    
    stepLines.forEach((lineEl, index) => {
        const lineNum = index + 1;
        if (lineNum < step) {
            lineEl.classList.add('completed');
            lineEl.classList.remove('active');
        } else if (lineNum === step) {
            lineEl.classList.add('active');
            lineEl.classList.remove('completed');
        } else {
            lineEl.classList.remove('active', 'completed');
        }
    });
}

// 步骤导航
function goToStep(step) {
    currentStep = step;
    
    // 更新步骤指示器
    updateStepIndicator('forward-calculation-page', step);
    
    // 显示对应步骤内容
    document.querySelectorAll('#forward-calculation-page .step-pane').forEach(pane => {
        pane.classList.add('hidden');
    });
    
    if (step === 1) {
        document.getElementById('step-parameters').classList.remove('hidden');
    } else if (step === 2) {
        document.getElementById('step-income').classList.remove('hidden');
        // 触发一次计算
        updateIncomeCalculation();
    } else if (step === 3) {
        document.getElementById('step-deductions').classList.remove('hidden');
        // 检查并显示默认勾选的扣除项内容
        if (document.getElementById('special-deduction-checkbox').checked) {
            document.getElementById('special-deduction-content').classList.remove('hidden');
        }
        if (document.getElementById('special-additional-deduction-checkbox').checked) {
            document.getElementById('special-additional-deduction-content').classList.remove('hidden');
        }
        if (document.getElementById('other-deduction-checkbox').checked) {
            document.getElementById('other-deduction-content').classList.remove('hidden');
        }
        
        // 触发一次计算
        updateDeductionCalculation();
    } else if (step === 4) {
        document.getElementById('step-result').classList.remove('hidden');
    }
}

// 反向倒算步骤导航
function showReverseStep(step) {
    currentStep = step;
    
    // 隐藏所有步骤
    document.getElementById('reverse-step-parameters').classList.add('hidden');
    document.getElementById('reverse-step-deductions').classList.add('hidden');
    document.getElementById('reverse-step-result').classList.add('hidden');
    
    // 显示当前步骤
    if (step === 1) {
        document.getElementById('reverse-step-parameters').classList.remove('hidden');
    } else if (step === 2) {
        document.getElementById('reverse-step-deductions').classList.remove('hidden');
    } else if (step === 3) {
        document.getElementById('reverse-step-result').classList.remove('hidden');
    }
    
    // 更新步骤指示器
    updateStepIndicator('reverse-calculation-page', step);
}

// 经营所得步骤导航
function showBusinessStep(step) {
    currentStep = step;
    
    // 隐藏所有步骤
    document.getElementById('business-step-income-cost').classList.add('hidden');
    document.getElementById('business-step-deductions').classList.add('hidden');
    document.getElementById('business-step-result').classList.add('hidden');
    
    // 显示当前步骤
    if (step === 1) {
        document.getElementById('business-step-income-cost').classList.remove('hidden');
    } else if (step === 2) {
        document.getElementById('business-step-deductions').classList.remove('hidden');
    } else if (step === 3) {
        document.getElementById('business-step-result').classList.remove('hidden');
    }
    
    // 更新步骤指示器
    updateStepIndicator('business-calculation-page', step);
}

// 分类所得步骤导航
function showClassificationStep(step) {
    currentStep = step;
    
    // 隐藏所有步骤
    document.getElementById('classification-step-info').classList.add('hidden');
    document.getElementById('classification-step-result').classList.add('hidden');
    
    // 显示当前步骤
    if (step === 1) {
        document.getElementById('classification-step-info').classList.remove('hidden');
    } else if (step === 2) {
        document.getElementById('classification-step-result').classList.remove('hidden');
    }
    
    // 更新步骤指示器
    updateStepIndicator('classification-calculation-page', step);
}

// 反向倒算扣除项显示/隐藏控制
function setupReverseDeductionToggle(checkboxId, contentId) {
    const checkbox = document.getElementById(checkboxId);
    const content = document.getElementById(contentId);
    
    // 初始状态
    if (checkbox.checked) {
        content.classList.remove('hidden');
    } else {
        content.classList.add('hidden');
    }
    
    // 绑定事件
    checkbox.addEventListener('change', function() {
        if (this.checked) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
        updateReverseDeductionCalculation();
    });
}

// 导出PDF
function exportToPDF(tableId, title) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // 添加标题
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    
    // 添加表格
    const table = document.getElementById(tableId);
    const tableData = [];
    
    // 获取表头
    const headers = [];
    table.querySelectorAll('th').forEach(th => {
        headers.push(th.textContent);
    });
    tableData.push(headers);
    
    // 获取表格数据
    table.querySelectorAll('tbody tr').forEach(tr => {
        const rowData = [];
        tr.querySelectorAll('td').forEach(td => {
            rowData.push(td.textContent);
        });
        if (rowData.length > 0) {
            tableData.push(rowData);
        }
    });
    
    // 生成表格
    doc.autoTable({
        head: [headers],
        body: tableData.slice(1),
        startY: 30,
        margin: {
            top: 30,
            left: 14,
            right: 14,
            bottom: 14
        }
    });
    
    // 保存PDF
    doc.save(`${title}.pdf`);
}

// 打印元素
function printElement(elementId) {
    const element = document.getElementById(elementId);
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>打印</title>');
    printWindow.document.write('<style>table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; } th { background-color: #f2f2f2; }</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(element.outerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}
