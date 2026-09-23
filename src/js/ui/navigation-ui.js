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
// 17B-4（v1.50.0）：最后一条常驻预览条也随分类所得页面删掉了 —— 页面式 deep 自此归零，
// 迁到 spec 的那六个税种都不需要这里代算预览：
// 向导自己就在步骤里逐步把数算给用户看，另起一套预览等于两个入口算同一个数，早晚不一致。
// （v1.47.0 经营所得 / v1.48.0 反向倒算 / v1.49.0 综合所得 / v1.50.0 分类所得，四次删完。)

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

// 17B-3（v1.49.0）：goToStep 随综合所得页面一起删了。它原先是「综合所得专用」的四分支
// 步骤导航（并且被 draft-store 按函数名字符串绑定），现在页面式只剩分类所得，统一走
// showStepByPanes —— 这正是 ui-design-spec §7 想要的「step 切换只有一处实现」。
function showStepByPanes(pageId, step, paneIds) {
    paneIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const currentPane = document.getElementById(paneIds[step - 1]);
    if (currentPane) currentPane.classList.remove('hidden');
    updateStepIndicator(pageId, step);
}



// 17B-4（v1.50.0）：分类所得的步骤导航随旧页面删掉了 —— 它是 showStepByPanes 的最后一个调用者。
// （另外三个页面式 deep 的调用者已先一步随各自的旧页面删掉：v1.47.0 经营所得 /
// v1.48.0 反向倒算 / v1.49.0 综合所得。函数本身留着 —— 页面式页还在用它切换 step-pane。）

// 导出PDF
// opts（可选，阶段10B 专业版汇算清缴报告复用）：
//   { contentBuilder, beforeCapture, filename, skipResultCheck }
//     contentBuilder  () => HTML 字符串，覆盖默认的 generateWordDocumentContent(title) 内容
//     beforeCapture   (container) => void，html2canvas 截图前回调（如绘制 Chart 图表后等待就绪）
//     filename        自定义保存文件名（不含扩展名差异，直接作为 doc.save 参数）
//     skipResultCheck 跳过「请先进行计算」守卫（阶段16：速算器结果不走深度流程的全局结果变量，
//                     它自带 tool / values / out，由 quick-report 直接给出文档内容）
function exportToPDF(elementId, title, opts) {
    opts = opts || {};
    // 获取计算结果数据
    // 17B-2（v1.48.0）：原先还多一个 reverseCalculationResults 的分支 —— 那个全局变量随旧页面删了，
    // 留着这半句是**必炸的**（未声明变量直接抛 ReferenceError），而删掉它不影响任何现役入口。
    if (!opts.skipResultCheck && Object.keys(calculationResults).length === 0) {
        showAlert('请先进行计算，再导出文档');
        return;
    }

    // 构建报告内容（支持自定义 contentBuilder）
    const docContent = (typeof opts.contentBuilder === 'function')
        ? opts.contentBuilder()
        : generateWordDocumentContent(title);
    
    // 阶段13D：截图收敛到公共层 Capture —— 与分享图共用同一套 html2canvas 配置
    // 与临时容器清理，避免「PDF 清晰但分享图糊」这类配置漂移问题。
    const capture = window.Capture;
    if (!capture || typeof capture.captureHtml !== 'function') {
        showAlert('导出组件未就绪，请刷新页面后重试');
        return;
    }

    // delayMs 500：报告含长表格与图片，需要时间完成布局（分享图内容更简单，用默认值即可）
    capture.captureHtml(docContent, {
        width: 800, // 调整宽度以适应纵向布局
        logging: true,
        delayMs: 500,
        beforeCapture: opts.beforeCapture
    })
        .then(canvas => {
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
            
            // 保存PDF（专业版报告可使用自定义文件名，如「汇算清缴报告_2026-09.pdf」）
            const fileName = (typeof opts.filename === 'string' && opts.filename.trim())
                ? opts.filename
                : `${title}_${new Date().toISOString().split('T')[0]}.pdf`;

            // Phase 1.5 交付兜底：微信 / App 内置浏览器里 doc.save() 会被拦或静默失败，
            // 用户表现为「点了导出没反应」—— 而微信正是当前唯一真实可达渠道，等于链路不闭环。
            // 降级链：下载 → 结果长图（长按保存）→ 复制结果文本，保证总有出路。
            const envLib = window.EuriskoEnv;
            const env = envLib && typeof envLib.currentEnv === 'function' ? envLib.currentEnv() : null;
            const delivery = env && typeof envLib.pickDelivery === 'function'
                ? envLib.pickDelivery(env, { image: true })
                : { way: 'download', fallbacks: [] };

            if (delivery.way !== 'download' && typeof envLib.openFallbackPanel === 'function') {
                envLib.openFallbackPanel({
                    imageDataUrl: canvas.toDataURL('image/png'),
                    text: envLib.htmlToPlainText(docContent),
                    hint: envLib.deliveryHint(env, delivery.way),
                    // 仍留一条手动尝试下载的口子：某些容器实际能下载，不该替用户判死刑
                    onRetryDownload: function () { doc.save(fileName); }
                });
                return;
            }

            doc.save(fileName);
        })
        .catch(error => {
            console.error('生成PDF时出错:', error);
            // 原来只打日志，用户那边表现为「点了导出没反应」；给出明确反馈
            showAlert('导出失败，请稍后重试');
        });
}




