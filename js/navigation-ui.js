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
function exportToPDF(elementId, title) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    
    // 添加标题
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    
    let currentY = 30;
    const imgWidth = 210; // A4宽度，单位mm
    const pageHeight = 297; // A4高度，单位mm
    
    // 根据不同的页面定义不同的导出区域
    let sections = [];
    
    if (elementId === 'step-result') {
        // 正向计税页面
        sections = [
            { title: '年度总览', selector: '#step-result > div > div:first-child' },
            { title: '税率分布', selector: '#step-result > div > div:nth-child(2)' },
            { title: '月度个税明细', selector: '#step-result > div > div:nth-child(3)' },
            { title: '个人年度个税预算表', selector: '#step-result > div > div:nth-child(4)' }
        ];
    } else if (elementId === 'reverse-result') {
        // 反向倒算页面
        sections = [
            { title: '反向倒算结果', selector: '#reverse-result > div > div:first-child' },
            { title: '收入构成分析', selector: '#reverse-result > div > div:nth-child(2)' },
            { title: '个人年度个税预算表', selector: '#reverse-result > div > div:nth-child(3)' }
        ];
    } else if (elementId === 'business-result') {
        // 经营所得页面
        sections = [
            { title: '经营所得计算结果', selector: '#business-result > div > div:first-child' },
            { title: '经营所得年度预算表', selector: '#business-result > div > div:nth-child(2)' }
        ];
    } else if (elementId === 'classification-result') {
        // 分类所得页面
        sections = [
            { title: '分类所得计算结果', selector: '#classification-result > div > div:first-child' },
            { title: '分类所得计税表', selector: '#classification-result > div > div:nth-child(2)' }
        ];
    } else {
        // 默认情况，导出整个元素
        sections = [
            { title: title, selector: `#${elementId}` }
        ];
    }
    
    // 处理每个区域
    let processedSections = 0;
    
    sections.forEach((section, index) => {
        const element = document.querySelector(section.selector);
        if (!element) {
            console.error(`找不到区域: ${section.title}`);
            processedSections++;
            if (processedSections === sections.length) {
                doc.save(`${title}.pdf`);
            }
            return;
        }
        
        // 克隆元素以避免修改原始元素
        const clonedElement = element.cloneNode(true);
        
        // 确保克隆元素有足够的宽度和高度
        clonedElement.style.width = '1000px'; // 增加宽度以确保内容不被截断
        clonedElement.style.maxWidth = '100%';
        clonedElement.style.overflow = 'visible';
        clonedElement.style.height = 'auto';
        clonedElement.style.display = 'block';
        
        // 确保所有子元素也能正确显示
        const children = clonedElement.querySelectorAll('*');
        children.forEach(child => {
            child.style.maxWidth = '100%';
            child.style.overflow = 'visible';
        });
        
        // 特别处理表格，确保表格内容完整显示
        const tables = clonedElement.querySelectorAll('table');
        tables.forEach(table => {
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
        });
        
        // 特别处理图表容器，确保图表完整显示
        const chartContainers = clonedElement.querySelectorAll('canvas');
        chartContainers.forEach(canvas => {
            const container = canvas.parentElement;
            if (container) {
                container.style.width = '100%';
                container.style.height = 'auto';
            }
        });
        
        // 将克隆元素添加到页面临时容器
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'fixed';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = '1000px';
        tempContainer.style.height = 'auto';
        tempContainer.style.zIndex = '9999';
        tempContainer.appendChild(clonedElement);
        document.body.appendChild(tempContainer);
        
        // 强制计算元素尺寸
        clonedElement.style.visibility = 'hidden';
        clonedElement.offsetHeight; // 触发重排
        clonedElement.style.visibility = 'visible';
        
        // 计算元素的实际高度
        const elementHeight = clonedElement.scrollHeight;
        console.log(`区域 ${section.title} 高度: ${elementHeight}`);
        
        // 特别处理图表，确保图表已渲染完成
        chartContainers.forEach(canvas => {
            // 尝试重新绘制图表
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // 获取图表实例（如果存在）
                const chart = Chart.getChart(canvas);
                if (chart) {
                    chart.resize();
                    chart.update();
                }
            }
        });
        
        // 延迟一下，确保图表渲染完成
        setTimeout(() => {
            // 使用html2canvas生成图片
            html2canvas(clonedElement, {
                scale: 2, // 提高清晰度
                useCORS: true,
                logging: true, // 启用日志以便调试
                backgroundColor: '#ffffff',
                width: 1000,
                height: elementHeight,
                windowWidth: 1000,
                windowHeight: elementHeight + 100, // 增加额外空间
                allowTaint: true,
                removeContainer: true
            }).then(canvas => {
                // 移除临时容器
                if (tempContainer && tempContainer.parentNode) {
                    document.body.removeChild(tempContainer);
                }
                
                console.log(`生成的图片尺寸: ${canvas.width} x ${canvas.height}`);
                
                // 计算图片尺寸
                const imgHeight = (canvas.height * (imgWidth - 20)) / canvas.width;
                console.log(`PDF中的图片高度: ${imgHeight}`);
                
                // 如果当前页面空间不足，添加新页面
                if (currentY + imgHeight > pageHeight - 20) {
                    doc.addPage();
                    currentY = 20;
                }
                
                // 添加区域标题
                doc.setFontSize(14);
                doc.text(section.title, 14, currentY);
                currentY += 15;
                
                // 添加图片
                doc.addImage(canvas.toDataURL('image/png'), 'PNG', 10, currentY, imgWidth - 20, imgHeight);
                currentY += imgHeight + 20;
                
                // 增加处理计数
                processedSections++;
                console.log(`已处理区域: ${processedSections}/${sections.length}`);
                
                // 所有区域处理完成后保存PDF
                if (processedSections === sections.length) {
                    console.log('所有区域处理完成，保存PDF');
                    doc.save(`${title}.pdf`);
                }
            }).catch(error => {
                console.error(`导出${section.title}失败:`, error);
                
                // 确保移除临时容器
                if (tempContainer && tempContainer.parentNode) {
                    document.body.removeChild(tempContainer);
                }
                
                // 增加处理计数
                processedSections++;
                
                // 所有区域处理完成后保存PDF
                if (processedSections === sections.length) {
                    doc.save(`${title}.pdf`);
                }
            });
        }, 500); // 500ms延迟，确保图表渲染完成
    });
}

// 导出Word文档
function exportToWord(elementId, title) {
    const element = document.getElementById(elementId);
    
    // 创建一个包含HTML内容的Blob
    const htmlContent = `
        <html>
        <head>
            <meta charset="utf-8">
            <title>${title}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #1e40af; text-align: center; margin-bottom: 30px; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; font-weight: bold; }
                tr:nth-child(even) { background-color: #f9f9f9; }
                .highlight { font-weight: bold; color: #1e40af; }
                .negative { color: #ef4444; font-weight: medium; }
                .positive { color: #10b981; font-weight: medium; }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            ${element.innerHTML}
        </body>
        </html>
    `;
    
    // 创建Blob对象
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.doc`;
    
    // 触发下载
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 释放URL对象
    URL.revokeObjectURL(url);
}


