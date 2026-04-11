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
    // 获取计算结果数据
    if (Object.keys(calculationResults).length === 0 && Object.keys(reverseCalculationResults).length === 0) {
        alert('请先进行计算，再导出文档');
        return;
    }
    
    // 构建Word文档内容
    const docContent = generateWordDocumentContent(title);
    
    // 创建临时HTML文件
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.style.width = '800px'; // 调整宽度以适应纵向布局
    tempContainer.style.height = 'auto';
    tempContainer.style.zIndex = '9999';
    tempContainer.innerHTML = docContent;
    document.body.appendChild(tempContainer);
    
    // 等待内容加载完成
    setTimeout(() => {
        // 使用html2canvas生成图片
        html2canvas(tempContainer, {
            scale: 2, // 提高清晰度
            useCORS: true,
            logging: true,
            backgroundColor: '#ffffff',
            width: 800, // 调整宽度以适应纵向布局
            height: tempContainer.scrollHeight,
            windowWidth: 800,
            windowHeight: tempContainer.scrollHeight + 100,
            allowTaint: true,
            removeContainer: true
        }).then(canvas => {
            // 清理临时容器
            if (tempContainer.parentNode) {
                tempContainer.parentNode.removeChild(tempContainer);
            }
            
            // 创建PDF文档，使用标准A4尺寸
            const { jsPDF } = window.jspdf;
            
            // 标准A4尺寸：210mm × 297mm
            // 使用纵向布局
            const doc = new jsPDF({
                orientation: 'portrait', // 纵向布局
                unit: 'mm',
                format: 'a4', // 明确指定A4格式
                margin: { top: 10, right: 10, bottom: 10, left: 10 } // 适当边距
            });
            
            // 标准A4纵向尺寸：210mm × 297mm
            const A4_WIDTH = 210; // A4纵向宽度
            const A4_HEIGHT = 297; // A4纵向高度
            const MARGIN = 10; // 边距
            
            const imgWidth = A4_WIDTH - (MARGIN * 2); // 可用宽度
            const pageHeight = A4_HEIGHT - (MARGIN * 2); // 可用高度
            let currentY = MARGIN; // 起始位置
            
            // 计算图片在PDF中的高度，保持宽高比
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            // 检查是否需要分页
            if (imgHeight > pageHeight) {
                // 计算需要的页数
                const totalPages = Math.ceil(imgHeight / pageHeight);
                const pageImageHeight = (canvas.height / totalPages) * (imgWidth / canvas.width);
                
                for (let i = 0; i < totalPages; i++) {
                    if (i > 0) {
                        // 添加新页面，保持A4纵向尺寸
                        doc.addPage('a4', 'portrait');
                        currentY = MARGIN;
                    }
                    
                    // 计算当前页的图片区域
                    const pageCanvas = document.createElement('canvas');
                    pageCanvas.width = canvas.width;
                    pageCanvas.height = canvas.height / totalPages;
                    const ctx = pageCanvas.getContext('2d');
                    ctx.drawImage(
                        canvas,
                        0, i * (canvas.height / totalPages),
                        canvas.width, canvas.height / totalPages,
                        0, 0,
                        canvas.width, canvas.height / totalPages
                    );
                    
                    // 添加图片到PDF，确保在A4页面内
                    doc.addImage(pageCanvas, 'PNG', MARGIN, currentY, imgWidth, pageImageHeight);
                }
            } else {
                // 单页显示
                doc.addImage(canvas, 'PNG', MARGIN, currentY, imgWidth, imgHeight);
            }
            
            // 保存PDF
            doc.save(`${title}_${new Date().toISOString().split('T')[0]}.pdf`);
        }).catch(error => {
            console.error('生成PDF时出错:', error);
            
            // 清理临时容器
            if (tempContainer.parentNode) {
                tempContainer.parentNode.removeChild(tempContainer);
            }
        });
    }, 500); // 500ms延迟，确保内容加载完成
}




