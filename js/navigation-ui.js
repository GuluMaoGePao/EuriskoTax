// 页面切换
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
    });
    document.getElementById(pageId).classList.remove('hidden');
}

// 步骤导航
function goToStep(step) {
    currentStep = step;
    
    // 更新步骤指示器
    document.querySelectorAll('#forward-calculation-page .step-number').forEach((el, index) => {
        const stepNum = index + 1;
        if (stepNum < step) {
            el.classList.remove('active');
            el.classList.add('completed');
            el.textContent = '✓';
        } else if (stepNum === step) {
            el.classList.add('active');
            el.classList.remove('completed');
            el.textContent = stepNum;
        } else {
            el.classList.remove('active', 'completed');
            el.textContent = stepNum;
        }
    });
    
    document.querySelectorAll('#forward-calculation-page .step-title').forEach((el, index) => {
        const stepNum = index + 1;
        if (stepNum < step) {
            el.classList.remove('active');
            el.classList.add('completed');
        } else if (stepNum === step) {
            el.classList.add('active');
            el.classList.remove('completed');
        } else {
            el.classList.remove('active', 'completed');
        }
    });
    
    document.querySelectorAll('#forward-calculation-page .step-line').forEach((el, index) => {
        const lineNum = index + 1;
        if (lineNum < step) {
            el.classList.add('completed');
            el.classList.remove('active');
        } else if (lineNum === step) {
            el.classList.add('active');
            el.classList.remove('completed');
        } else {
            el.classList.remove('active', 'completed');
        }
    });
    
    // 显示对应步骤内容
    document.querySelectorAll('#forward-calculation-page .step-pane').forEach(pane => {
        pane.classList.add('hidden');
    });
    
    if (step === 1) {
        document.getElementById('step-parameters').classList.remove('hidden');
    } else if (step === 2) {
        document.getElementById('step-income').classList.remove('hidden');
        // 当切换到收入明细步骤时，重新绑定事件监听器并触发一次计算
        document.getElementById('labor-income').addEventListener('input', updateIncomeCalculation);
        document.getElementById('author-income').addEventListener('input', updateIncomeCalculation);
        document.getElementById('royalty-income').addEventListener('input', updateIncomeCalculation);
        document.getElementById('salary-income').addEventListener('input', updateIncomeCalculation);
        document.getElementById('bonus-income').addEventListener('input', updateIncomeCalculation);
        document.getElementById('bonus-include').addEventListener('change', updateIncomeCalculation);
        updateIncomeCalculation();
    } else if (step === 3) {
        document.getElementById('step-deductions').classList.remove('hidden');
        // 当切换到扣除项明细步骤时，重新绑定事件监听器并触发一次计算
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
        // 专项附加扣除相关事件监听器
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
        document.getElementById('children-infant-deduction').addEventListener('input', updateDeductionCalculation);
        
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
        document.getElementById('elderly-deduction').addEventListener('input', updateDeductionCalculation);
        
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
        document.getElementById('rent-deduction').addEventListener('input', updateDeductionCalculation);
        document.getElementById('housing-loan-deduction').addEventListener('input', updateDeductionCalculation);
        
        // 继续教育复选框变化
        function updateEducationDeduction() {
            let amount = 0;
            if (document.getElementById('education-degree-checkbox').checked) {
                amount += 4800; // 学历教育400元/月 × 12个月
            }
            if (document.getElementById('education-professional-checkbox').checked) {
                amount += 3600; // 职业资格3600元/年
            }
            document.getElementById('education-deduction').value = amount;
            updateDeductionCalculation();
        }
        
        document.getElementById('education-degree-checkbox').addEventListener('change', updateEducationDeduction);
        document.getElementById('education-professional-checkbox').addEventListener('change', updateEducationDeduction);
        document.getElementById('education-deduction').addEventListener('input', updateDeductionCalculation);
        
        document.getElementById('medical-deduction').addEventListener('input', updateDeductionCalculation);
        document.getElementById('pension-deduction').addEventListener('input', updateDeductionCalculation);
        document.getElementById('insurance-other-deduction').addEventListener('input', updateDeductionCalculation);
        
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
        
        // 重新绑定扣除项显示/隐藏控制的事件监听器
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
    const steps = document.querySelectorAll('#reverse-calculation-page .step-number');
    const stepTitles = document.querySelectorAll('#reverse-calculation-page .step-title');
    const stepLines = document.querySelectorAll('#reverse-calculation-page .step-line');
    
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
    const steps = document.querySelectorAll('#business-calculation-page .step-number');
    const stepTitles = document.querySelectorAll('#business-calculation-page .step-title');
    const stepLines = document.querySelectorAll('#business-calculation-page .step-line');
    
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
    const steps = document.querySelectorAll('#classification-calculation-page .step-number');
    const stepTitles = document.querySelectorAll('#classification-calculation-page .step-title');
    const stepLines = document.querySelectorAll('#classification-calculation-page .step-line');
    
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
