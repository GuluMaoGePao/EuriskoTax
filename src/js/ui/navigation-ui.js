// 页面切换 - 委托给 auth-ui.js 中的 showPage（带历史记录）
// 确保全局只有一个 showPage 实现，保持页面历史一致性

// 交互日志工具
const InteractionLog = {
    enabled: true,
    log(type, action, details = {}) {
        if (!this.enabled) return;
        const time = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(
            `%c[EuriskoTax ${time}]`,
            'color: #1e40af; font-weight: bold;',
            `${type} → ${action}`,
            details
        );
    },
    step(pageId, step, totalSteps) {
        this.log('STEP', `${pageId} → 步骤 ${step}/${totalSteps}`, {
            page: pageId, step, total: totalSteps
        });
    },
    preview(pageId, values) {
        this.log('PREVIEW', `${pageId} 预览条更新`, values);
    },
    calc(action, input, output) {
        this.log('CALC', action, { input, output });
    },
    save(action, data) {
        this.log('SAVE', action, data);
    },
    error(action, error) {
        console.error(`[EuriskoTax ERROR] ${action}:`, error);
    }
};

// 通用步骤导航函数
function updateStepIndicator(pageId, step) {
    // 更新步骤指示器
    const steps = document.querySelectorAll(`#${pageId} .step-number`);
    const stepTitles = document.querySelectorAll(`#${pageId} .step-title`);
    const stepLines = document.querySelectorAll(`#${pageId} .step-line`);
    const totalSteps = steps.length;

    InteractionLog.step(pageId, step, totalSteps);

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

    // 结果步骤隐藏预览条
    const previewBar = document.querySelector(`#${pageId} .calc-preview-bar`);
    if (previewBar) {
        if (step === totalSteps) {
            previewBar.classList.add('is-result-step');
        } else {
            previewBar.classList.remove('is-result-step');
        }
    }

    // 触发预览条刷新
    if (typeof updateCalcPreview === 'function') {
        updateCalcPreview(pageId);
    }

    // 更新步骤进度文字（移动端显示 "1/4"）
    const indicator = document.querySelector(`#${pageId} .step-indicator`);
    if (indicator && totalSteps > 0) {
        let progressEl = indicator.querySelector('.step-progress-text');
        if (!progressEl) {
            progressEl = document.createElement('span');
            progressEl.className = 'step-progress-text';
            indicator.appendChild(progressEl);
        }
        progressEl.textContent = `${step}/${totalSteps}`;
    }
}

// === 预览条实时更新 ===
function formatPreviewNum(n) {
    const num = Math.max(0, Math.round(Number(n) || 0));
    return num.toLocaleString('zh-CN');
}

function updateCalcPreview(pageId) {
    try {
        if (pageId === 'forward-calculation-page') {
            const income = parseFloat(document.getElementById('total-income-amount')?.textContent.replace(/,/g, '')) || 0;
            const deductionEl = document.getElementById('total-deduction-amount');
            const deduction = deductionEl ? (parseFloat(deductionEl.textContent.replace(/,/g, '')) || 0) : 0;
            const tax = (typeof calculationResults !== 'undefined' && calculationResults?.taxDetails?.totalTax) || 0;
            const incEl = document.getElementById('forward-preview-income');
            const dedEl = document.getElementById('forward-preview-deduction');
            const taxEl = document.getElementById('forward-preview-tax');
            if (incEl) incEl.textContent = formatPreviewNum(income);
            if (dedEl) dedEl.textContent = formatPreviewNum(deduction);
            if (taxEl) taxEl.textContent = formatPreviewNum(tax);
            InteractionLog.preview(pageId, { income, deduction, tax });
        } else if (pageId === 'reverse-calculation-page') {
            // 根据 reverse-type 取对应输入
            let target = 0;
            const reverseType = document.getElementById('reverse-type')?.value;
            if (reverseType === 'rate') {
                target = parseFloat(document.getElementById('reverse-target-rate')?.value) || 0;
            } else if (reverseType === 'monthly') {
                target = parseFloat(document.getElementById('reverse-monthly-net')?.value) || 0;
            } else if (reverseType === 'both') {
                const targetType = document.getElementById('reverse-target-type')?.value;
                target = parseFloat(document.getElementById(targetType === 'net' ? 'reverse-fixed-net' : 'reverse-fixed-tax')?.value) || 0;
            }
            const deduction = (typeof reverseDeductionAmount !== 'undefined' && reverseDeductionAmount) || 0;
            const income = (typeof reverseCalculationResults !== 'undefined' &&
                (reverseCalculationResults?.incomeDetails?.total || reverseCalculationResults?.totalIncome)) || 0;
            const tEl = document.getElementById('reverse-preview-target');
            const dEl = document.getElementById('reverse-preview-deduction');
            const iEl = document.getElementById('reverse-preview-income');
            if (tEl) tEl.textContent = formatPreviewNum(target);
            if (dEl) dEl.textContent = formatPreviewNum(deduction);
            if (iEl) iEl.textContent = formatPreviewNum(income);
            InteractionLog.preview(pageId, { target, deduction, income });
        } else if (pageId === 'business-calculation-page') {
            const taxable = (typeof businessCalculationResults !== 'undefined' && businessCalculationResults?.taxableIncome) || 0;
            const deduction = (typeof businessCalculationResults !== 'undefined' && businessCalculationResults?.deductionDetails?.totalDeduction) || 0;
            const tax = (typeof businessCalculationResults !== 'undefined' && businessCalculationResults?.taxDetails?.totalTax) || 0;
            const tEl = document.getElementById('business-preview-taxable');
            const dEl = document.getElementById('business-preview-deduction');
            const taxEl = document.getElementById('business-preview-tax');
            if (tEl) tEl.textContent = formatPreviewNum(taxable);
            if (dEl) dEl.textContent = formatPreviewNum(deduction);
            if (taxEl) taxEl.textContent = formatPreviewNum(tax);
            InteractionLog.preview(pageId, { taxable, deduction, tax });
        } else if (pageId === 'classification-calculation-page') {
            const income = parseFloat(document.getElementById('classification-income')?.value) || 0;
            // 分类所得无显式税率字段，按类型估算
            const type = document.getElementById('classification-type')?.value || 'interest';
            const rateMap = { interest: 20, rent: 20, transfer: 20, accidental: 20 };
            const rate = rateMap[type] || 20;
            const tax = (typeof classificationCalculationResults !== 'undefined' && classificationCalculationResults?.taxDetails?.totalTax) || (income * rate / 100);
            const iEl = document.getElementById('classification-preview-income');
            const rEl = document.getElementById('classification-preview-rate');
            const tEl = document.getElementById('classification-preview-tax');
            if (iEl) iEl.textContent = formatPreviewNum(income);
            if (rEl) rEl.textContent = rate;
            if (tEl) tEl.textContent = formatPreviewNum(tax);
            InteractionLog.preview(pageId, { income, rate, tax });
        }
    } catch (e) {
        // 预览条更新失败不应影响主流程
        InteractionLog.error('预览条更新', e);
    }
}

// 延迟刷新，确保在其他计算函数更新显示值之后再读取
function schedulePreviewUpdate(pageId) {
    if (window.requestAnimationFrame) {
        requestAnimationFrame(() => updateCalcPreview(pageId));
    } else {
        setTimeout(() => updateCalcPreview(pageId), 0);
    }
}

// 绑定输入实时刷新预览条
function bindPreviewLiveUpdate() {
    const forwardInputs = ['salary-income', 'labor-income', 'author-income', 'royalty-income', 'bonus-income',
        'social-security-base', 'pension-insurance', 'medical-insurance', 'unemployment-insurance', 'housing-fund'];
    forwardInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => schedulePreviewUpdate('forward-calculation-page'));
    });

    const reverseInputs = ['reverse-target-rate', 'reverse-monthly-net', 'reverse-fixed-tax', 'reverse-fixed-net',
        'reverse-social-security-base', 'reverse-pension-insurance', 'reverse-medical-insurance'];
    reverseInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => schedulePreviewUpdate('reverse-calculation-page'));
            el.addEventListener('change', () => schedulePreviewUpdate('reverse-calculation-page'));
        }
    });
    // reverse-type / reverse-target-type 改变时也刷新
    ['reverse-type', 'reverse-target-type'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => schedulePreviewUpdate('reverse-calculation-page'));
    });

    const businessInputs = ['business-income', 'business-cost', 'business-expenses', 'business-taxes',
        'business-losses', 'business-other-expenses', 'business-pension-insurance', 'business-medical-insurance'];
    businessInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => schedulePreviewUpdate('business-calculation-page'));
    });

    const classificationInputs = ['classification-income'];
    classificationInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => schedulePreviewUpdate('classification-calculation-page'));
    });
    // classification-type 改变时刷新税率显示
    const classificationTypeEl = document.getElementById('classification-type');
    if (classificationTypeEl) {
        classificationTypeEl.addEventListener('change', () => schedulePreviewUpdate('classification-calculation-page'));
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPreviewLiveUpdate);
} else {
    bindPreviewLiveUpdate();
}

// === 参数提示系统：初始化 tooltip 交互 ===
// 将 data-hint 属性对应的文本注入 tooltip-text，并绑定点击展开/收起
function initTooltipHints() {
    const tooltips = document.querySelectorAll('.tooltip[data-hint]');
    if (!tooltips.length) return;

    // 从 FIELD_HINTS 数据注入文本
    tooltips.forEach(tip => {
        const key = tip.getAttribute('data-hint');
        const text = (window.FIELD_HINTS && window.FIELD_HINTS[key]) || '';
        const textEl = tip.querySelector('.tooltip-text');
        if (textEl && text) {
            textEl.innerHTML = text;
        }

        // 点击切换展开/收起
        tip.addEventListener('click', function(e) {
            e.preventDefault();   // 阻止 label 将点击转发到关联的 select/input
            e.stopPropagation();  // 阻止冒泡到 document
            const wasOpen = this.classList.contains('is-open');
            // 先关闭所有其他 tooltip
            document.querySelectorAll('.tooltip.is-open').forEach(t => {
                if (t !== this) t.classList.remove('is-open');
            });
            if (!wasOpen) {
                this.classList.add('is-open');
            } else {
                this.classList.remove('is-open');
            }
        });
    });

    // 点击页面其他区域关闭 tooltip
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.tooltip')) {
            document.querySelectorAll('.tooltip.is-open').forEach(t => {
                t.classList.remove('is-open');
            });
        }
    });

    // ESC 键关闭 tooltip
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.tooltip.is-open').forEach(t => {
                t.classList.remove('is-open');
            });
        }
    });
}

// 初始化 tooltip
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTooltipHints);
} else {
    initTooltipHints();
}

// 步骤导航
function goToStep(step) {
    InteractionLog.log('NAV', `goToStep(${step}) → 综合所得计税`);

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

// 通用步骤面板切换（用于反向/经营/分类所得）
function showStepByPanes(pageId, step, paneIds) {
    paneIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const currentPane = document.getElementById(paneIds[step - 1]);
    if (currentPane) currentPane.classList.remove('hidden');
    updateStepIndicator(pageId, step);
}

// 反向倒算步骤导航
function showReverseStep(step) {
    showStepByPanes('reverse-calculation-page', step, [
        'reverse-step-parameters', 'reverse-step-deductions', 'reverse-step-result'
    ]);
}

// 经营所得步骤导航
function showBusinessStep(step) {
    showStepByPanes('business-calculation-page', step, [
        'business-step-income-cost', 'business-step-deductions', 'business-step-result'
    ]);
}

// 分类所得步骤导航
function showClassificationStep(step) {
    showStepByPanes('classification-calculation-page', step, [
        'classification-step-info', 'classification-step-result'
    ]);
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
    if (Object.keys(calculationResults).length === 0 &&
        Object.keys(reverseCalculationResults).length === 0 &&
        Object.keys(businessCalculationResults).length === 0) {
        showAlert('请先进行计算，再导出文档');
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
                margin: { top: 10, right: 10, bottom: 10, left: 10 } // 底部边距与顶部边距一致
            });
            
            // 标准A4纵向尺寸：210mm × 297mm
            const A4_WIDTH = 210; // A4纵向宽度
            const A4_HEIGHT = 297; // A4纵向高度
            const TOP_MARGIN = 10; // 顶部边距
            const BOTTOM_MARGIN = 10; // 底部边距
            const SIDE_MARGIN = 10; // 侧边边距
            
            const imgWidth = A4_WIDTH - (SIDE_MARGIN * 2); // 可用宽度
            const pageHeight = A4_HEIGHT - (TOP_MARGIN + BOTTOM_MARGIN); // 可用高度
            let currentY = TOP_MARGIN; // 起始位置
            
            // 计算图片在PDF中的高度，保持宽高比
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            // 检查是否需要分页
            if (imgHeight > pageHeight) {
                // 计算需要的页数，使用实际页面高度
                const totalPages = Math.ceil(imgHeight / pageHeight);
                
                // 计算每页的高度，确保内容完全填充页面
                const pageImageHeight = pageHeight;
                const canvasPageHeight = (canvas.height * pageHeight) / imgHeight;
                
                for (let i = 0; i < totalPages; i++) {
                    if (i > 0) {
                        // 添加新页面，保持A4纵向尺寸
                        doc.addPage('a4', 'portrait');
                        currentY = TOP_MARGIN;
                    }
                    
                    // 计算当前页的图片区域
                    const pageCanvas = document.createElement('canvas');
                    pageCanvas.width = canvas.width;
                    pageCanvas.height = canvasPageHeight;
                    const ctx = pageCanvas.getContext('2d');
                    ctx.drawImage(
                        canvas,
                        0, i * canvasPageHeight,
                        canvas.width, canvasPageHeight,
                        0, 0,
                        canvas.width, canvasPageHeight
                    );
                    
                    // 添加图片到PDF，确保在A4页面内
                    doc.addImage(pageCanvas, 'PNG', SIDE_MARGIN, currentY, imgWidth, pageImageHeight);
                }
            } else {
                // 单页显示，调整图片高度以确保底部边距
                const adjustedImgHeight = imgHeight;
                doc.addImage(canvas, 'PNG', SIDE_MARGIN, currentY, imgWidth, adjustedImgHeight);
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




