let calculationResults = {};
// 17B-2（v1.48.0）：reverseCalculationResults 随反向倒算旧页面一起删了 —— 那份结果本来是
// collectReverseInputData 读 DOM 攒出来的，页面没了它也就不该再存在。留着这行，只会养出一批
//「读一个永远为空的对象」的分支（就是 export-utils / navigation-ui 里那几处）。
let classificationCalculationResults = {};

// 税法常量（综合所得/月度/经营所得/分类所得税率表）已抽离至 tax-constants.js
// 该文件必须先于本文件加载：index.html 脚本顺序与 tests/helpers/load-source 加载顺序均需保证

// 临界点提醒函数
function checkTaxBracketThreshold(taxableIncome) {
    for (let i = 0; i < comprehensiveTaxRates.length - 1; i++) {
        const currentBracket = comprehensiveTaxRates[i];
        const nextBracket = comprehensiveTaxRates[i + 1];
        
        const threshold = nextBracket.min - 10000;
        if (taxableIncome > threshold && taxableIncome < nextBracket.min) {
            return {
                warning: true,
                currentRate: currentBracket.rate,
                nextRate: nextBracket.rate,
                threshold: nextBracket.min,
                remaining: nextBracket.min - taxableIncome,
                message: `您的应纳税所得额接近${(nextBracket.rate * 100).toFixed(0)}%税率临界点，再增加${(nextBracket.min - taxableIncome).toFixed(2)}元将进入更高税率区间`
            };
        }
    }
    return { warning: false };
}

// 年终奖最优分配计算函数（优化版：基于税率表临界点）
function calculateOptimalBonusAllocation(totalIncome, totalDeduction) {
    const bonusCriticalPoints = [0, 36000, 144000, 300000, 420000, 660000, 960000];
    
    let minTax = Infinity;
    let optimalBonus = 0;
    
    for (const criticalPoint of bonusCriticalPoints) {
        const bonus = Math.min(criticalPoint, totalIncome);
        const salaryIncome = totalIncome - bonus;
        const salaryTaxable = Math.max(0, salaryIncome - totalDeduction);
        
        let salaryTax = 0;
        for (const bracket of comprehensiveTaxRates) {
            if (salaryTaxable <= bracket.max) {
                salaryTax = salaryTaxable * bracket.rate - bracket.deduction;
                break;
            }
        }
        
        let bonusTax = 0;
        if (bonus > 0) {
            const monthlyBonus = bonus / 12;
            for (const bracket of bonusMonthlyTaxRates) {
                if (monthlyBonus <= bracket.max) {
                    bonusTax = bonus * bracket.rate - bracket.deduction;
                    break;
                }
            }
        }
        
        const totalTax = Math.max(0, salaryTax) + Math.max(0, bonusTax);
        
        if (totalTax < minTax) {
            minTax = totalTax;
            optimalBonus = bonus;
        }
    }
    
    const allInTaxable = Math.max(0, totalIncome - totalDeduction);
    let allInTax = 0;
    for (const bracket of comprehensiveTaxRates) {
        if (allInTaxable <= bracket.max) {
            allInTax = allInTaxable * bracket.rate - bracket.deduction;
            break;
        }
    }
    allInTax = Math.max(0, allInTax);
    
    if (allInTax < minTax) {
        return {
            optimalBonus: 0,
            optimalSalary: totalIncome,
            minTax: allInTax,
            taxSavings: 0,
            allInTax: allInTax,
            optimalMethod: 'include'
        };
    }
    
    return {
        optimalBonus: optimalBonus,
        optimalSalary: totalIncome - optimalBonus,
        minTax: minTax,
        taxSavings: allInTax - minTax,
        allInTax: allInTax,
        optimalMethod: 'separate'
    };
}

// 公益捐赠限额校验函数
function validateCharitableDonation(donationAmount, taxableIncome) {
    const maxDeduction = taxableIncome * 0.3;
    const actualDeduction = Math.min(donationAmount, maxDeduction);
    const excessAmount = donationAmount - actualDeduction;
    
    return {
        actualDeduction: actualDeduction,
        excessAmount: excessAmount,
        maxDeduction: maxDeduction,
        isExcess: excessAmount > 0,
        message: excessAmount > 0 ? `捐赠额超过应纳税所得额30%的部分(${excessAmount.toFixed(2)}元)不能享受税前扣除` : '捐赠额在允许扣除范围内'
    };
}

// 安全设置元素文本内容
function safeSetTextContent(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// 安全设置元素class
function safeSetClass(id, className) {
    const element = document.getElementById(id);
    if (element) {
        element.className = className;
    }
}

// 计算劳务报酬、稿酬、特许权使用费所得（预扣预缴口径）
//
// 阶段15 15A-1：三档预扣率与费用扣除规则不再写在本函数里，改读 tax-constants.js 的
//   withholdingTaxRates / otherIncomeRules —— 与 /seo/labor-withholding.html 的
//   withholding-quick.js 同源（由 tests/withholding-quick.test.js 逐点对拍守护）。
//   算法本身未变：≤4000 减 800、>4000 减 20%；稿酬在费用扣除后再减按 70% 计算。
function calculateOtherIncome(annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome) {
    // 单一所得：费用扣除 →（稿酬再打七折）→ 查预扣率表
    function withholdOf(amount, type) {
        const rule = (typeof otherIncomeRules !== 'undefined' ? otherIncomeRules : {})[type];
        const threshold = rule ? rule.threshold : 4000;
        const flat = rule ? rule.flat : 800;
        const ratio = rule ? rule.ratio : 0.8;
        const postRatio = rule ? rule.postRatio : 1;
        const incomeRatio = rule ? rule.incomeRatio : 0.8;
        const income = Number(amount) || 0;
        if (income <= 0) return { incomeAmount: 0, taxableIncome: 0, tax: 0 };

        // 费用扣除（与常量同源：≤4000 减 800；>4000 减 20%）
        const afterExpense = income <= threshold ? Math.max(0, income - flat) : Math.max(0, income * ratio);
        const taxableIncome = Math.max(0, afterExpense * postRatio);
        // 预扣率表：劳务 20/30/40 三档，稿酬与特许权使用费固定 20%
        const rows = (typeof withholdingTaxRates !== 'undefined' ? withholdingTaxRates : {})[type] || [];
        let tax = 0;
        for (const bracket of rows) {
            if (taxableIncome <= bracket.max) {
                tax = taxableIncome * bracket.rate - bracket.deduction;
                break;
            }
        }
        return {
            incomeAmount: income * incomeRatio * postRatio,   // 年度汇算并入综合所得的收入额
            taxableIncome,
            tax: Math.max(0, tax)
        };
    }

    const labor = withholdOf(annualLaborIncome, 'labor');
    const author = withholdOf(annualAuthorIncome, 'author');
    const royalty = withholdOf(annualRoyaltyIncome, 'royalty');

    return {
        laborTaxableIncome: labor.taxableIncome,
        laborTax: labor.tax,
        authorTaxableIncome: author.taxableIncome,
        authorTax: author.tax,
        royaltyTaxableIncome: royalty.taxableIncome,
        royaltyTax: royalty.tax,
        // 并入综合所得的收入额（劳务 / 特许权 80%，稿酬 56%）—— 年度汇算与展示共用
        laborIncomeAmount: labor.incomeAmount,
        authorIncomeAmount: author.incomeAmount,
        royaltyIncomeAmount: royalty.incomeAmount
    };
}

// 从表单读取综合所得扣除项原始输入（DOM 适配器）
// 含条件的解析（住房租金/贷款分支、学历教育在职勾选）集中在此，
// 产出的对象即为 computeDeductions 的入参，便于纯函数部分独立测试与复用。
function collectDeductionInput() {
    const housingType = document.getElementById('housing-type').value;
    let monthlyHousingDeduction = 0;
    if (housingType === 'rent') {
        monthlyHousingDeduction = parseFloat(document.getElementById('rent-deduction').value) || 0;
    } else if (housingType === 'loan') {
        monthlyHousingDeduction = parseFloat(document.getElementById('housing-loan-deduction').value) || 0;
    }

    return {
        monthlyBasicDeduction: parseFloat(document.getElementById('basic-deduction').value) || 5000,
        monthlyPensionInsurance: parseFloat(document.getElementById('pension-insurance').value) || 0,
        monthlyMedicalInsurance: parseFloat(document.getElementById('medical-insurance').value) || 0,
        monthlyUnemploymentInsurance: parseFloat(document.getElementById('unemployment-insurance').value) || 0,
        monthlyHousingFund: parseFloat(document.getElementById('housing-fund').value) || 0,
        monthlyElderlyDeduction: parseFloat(document.getElementById('elderly-deduction').value) || 0,
        monthlyChildrenInfantDeduction: parseFloat(document.getElementById('children-infant-deduction').value) || 0,
        monthlyHousingDeduction: monthlyHousingDeduction,
        annualEducationDeduction: parseFloat(document.getElementById('education-deduction').value) || 0,
        annualMedicalDeduction: parseFloat(document.getElementById('medical-deduction').value) || 0,
        annualProfessionalDeduction: document.getElementById('education-professional-checkbox')?.checked ? 3600 : 0,
        monthlyPensionDeduction: parseFloat(document.getElementById('pension-deduction').value) || 0,
        monthlyEnterpriseAnnuity: parseFloat(document.getElementById('enterprise-annuity').value) || 0,
        monthlyInsuranceOtherDeduction: parseFloat(document.getElementById('insurance-other-deduction').value) || 0,
        monthlyTaxDeferredPension: parseFloat(document.getElementById('tax-deferred-pension').value) || 0,
        annualCharitableDonation: parseFloat(document.getElementById('charitable-donation').value) || 0
    };
}

// 计算综合所得扣除项（纯函数：不读取 DOM，仅依赖 input 与 workMonths）
function computeDeductions(input, workMonths) {
    const {
        monthlyBasicDeduction,
        monthlyPensionInsurance,
        monthlyMedicalInsurance,
        monthlyUnemploymentInsurance,
        monthlyHousingFund,
        monthlyElderlyDeduction,
        monthlyChildrenInfantDeduction,
        monthlyHousingDeduction,
        annualEducationDeduction,
        annualMedicalDeduction,
        annualProfessionalDeduction,
        monthlyPensionDeduction,
        monthlyEnterpriseAnnuity,
        monthlyInsuranceOtherDeduction,
        monthlyTaxDeferredPension,
        annualCharitableDonation
    } = input;

    // 计算年度大病医疗实际可扣除额
    const actualMedicalDeduction = annualMedicalDeduction > 15000 
        ? Math.min(annualMedicalDeduction - 15000, 80000) 
        : 0;

    // 计算学历教育扣除
    const educationDegreeAmount = annualEducationDeduction - annualProfessionalDeduction;

    // 计算月度专项附加扣除
    const monthlyEducationDeduction = educationDegreeAmount / workMonths;
    const monthlySpecialAdditionalTotal = monthlyElderlyDeduction + 
        monthlyChildrenInfantDeduction + monthlyHousingDeduction + monthlyEducationDeduction;

    // 计算年度专项附加扣除合计
    const annualSpecialAdditionalTotal = monthlySpecialAdditionalTotal * workMonths + 
        annualProfessionalDeduction + actualMedicalDeduction;

    // 计算年度其他扣除
    const annualOtherDeductionTotal = (monthlyPensionDeduction + monthlyEnterpriseAnnuity + 
        monthlyInsuranceOtherDeduction + monthlyTaxDeferredPension) * workMonths + 
        annualCharitableDonation;

    // 计算年度专项扣除
    const monthlyInsuranceDeduction = monthlyPensionInsurance + monthlyMedicalInsurance + 
        monthlyUnemploymentInsurance + monthlyHousingFund;
    const annualSpecialDeductionTotal = monthlyInsuranceDeduction * workMonths;

    // 计算年度总扣除额
    const totalDeduction = monthlyBasicDeduction * workMonths + 
        annualSpecialDeductionTotal + annualSpecialAdditionalTotal + 
        annualOtherDeductionTotal;

    return {
        monthlyBasicDeduction,
        monthlyPensionInsurance,
        monthlyMedicalInsurance,
        monthlyUnemploymentInsurance,
        monthlyHousingFund,
        monthlyElderlyDeduction,
        monthlyChildrenInfantDeduction,
        monthlyHousingDeduction,
        annualEducationDeduction,
        annualMedicalDeduction,
        annualProfessionalDeduction,
        actualMedicalDeduction,
        educationDegreeAmount,
        monthlyPensionDeduction,
        monthlyEnterpriseAnnuity,
        monthlyInsuranceOtherDeduction,
        monthlyTaxDeferredPension,
        annualCharitableDonation,
        monthlySpecialAdditionalTotal,
        annualSpecialAdditionalTotal,
        annualOtherDeductionTotal,
        monthlyInsuranceDeduction,
        annualSpecialDeductionTotal,
        totalDeduction
    };
}

// 兼容包装：保留原签名，表单主链路与 helper-functions.js 的调用点无需改动
function calculateComprehensiveDeductions(workMonths) {
    return computeDeductions(collectDeductionInput(), workMonths);
}

// 计算年终奖税额
function calculateBonusTax(bonusIncome, bonusInclude) {
    if (bonusIncome <= 0 || bonusInclude) return 0;
    
    const monthlyBonus = bonusIncome / 12;
    for (const bracket of bonusMonthlyTaxRates) {
        if (monthlyBonus <= bracket.max) {
            return bonusIncome * bracket.rate - bracket.deduction;
        }
    }
    return 0;
}

// 计算综合所得累计预缴税额
function calculateCumulativePrepaidTax(workMonths, monthlySalaryIncome, monthlyBasicDeduction, 
    monthlyInsuranceDeduction, monthlySpecialAdditionalTotal, monthlyPensionDeduction, 
    monthlyEnterpriseAnnuity, monthlyInsuranceOtherDeduction, monthlyTaxDeferredPension) {
    
    let cumulativeTaxableIncome = 0;
    
    for (let i = 1; i <= workMonths; i++) {
        const monthlyTaxable = monthlySalaryIncome - monthlyBasicDeduction - 
            monthlyInsuranceDeduction - monthlySpecialAdditionalTotal - monthlyPensionDeduction - 
            monthlyEnterpriseAnnuity - monthlyInsuranceOtherDeduction - monthlyTaxDeferredPension;
        cumulativeTaxableIncome += Math.max(0, monthlyTaxable);
    }
    
    for (const bracket of comprehensiveTaxRates) {
        if (cumulativeTaxableIncome <= bracket.max) {
            return cumulativeTaxableIncome * bracket.rate - bracket.deduction;
        }
    }
    
    const topBracket = comprehensiveTaxRates[comprehensiveTaxRates.length - 1];
    return cumulativeTaxableIncome * topBracket.rate - topBracket.deduction;
}

function collectTaxInputData() {
    const prepaidTaxElement = document.getElementById('prepaid-tax');
    // 留空（或填 0）表示不手动指定，交由系统按收入类型自动推演预缴税额
    const rawPrepaidTax = prepaidTaxElement ? prepaidTaxElement.value.trim() : '';
    const parsedPrepaidTax = rawPrepaidTax === '' ? NaN : parseFloat(rawPrepaidTax);
    const userInputPrepaidTax = (isNaN(parsedPrepaidTax) || parsedPrepaidTax === 0) ? undefined : parsedPrepaidTax;
    
    return {
        workMonths: parseInt(document.getElementById('work-months').value) || 12,
        monthlySalaryIncome: parseFloat(document.getElementById('salary-income').value) || 0,
        annualLaborIncome: parseFloat(document.getElementById('labor-income').value) || 0,
        annualAuthorIncome: parseFloat(document.getElementById('author-income').value) || 0,
        annualRoyaltyIncome: parseFloat(document.getElementById('royalty-income').value) || 0,
        bonusIncome: parseFloat(document.getElementById('bonus-income').value) || 0,
        bonusInclude: document.getElementById('bonus-include').checked,
        userInputPrepaidTax: userInputPrepaidTax
    };
}

function calculateTotalIncome(monthlySalaryIncome, workMonths, otherIncome, bonusIncome, bonusInclude) {
    let totalIncome = monthlySalaryIncome * workMonths + otherIncome.laborTaxableIncome + 
        otherIncome.authorTaxableIncome + otherIncome.royaltyTaxableIncome;
    
    if (bonusIncome > 0 && bonusInclude) {
        totalIncome += bonusIncome;
    }
    
    return totalIncome;
}

function calculateIncomeTax(taxableIncome) {
    for (const bracket of comprehensiveTaxRates) {
        if (taxableIncome <= bracket.max) {
            return {
                totalTax: taxableIncome * bracket.rate - bracket.deduction,
                applicableRate: bracket.rate,
                applicableDeduction: bracket.deduction
            };
        }
    }
    const topBracket = comprehensiveTaxRates[comprehensiveTaxRates.length - 1];
    return {
        totalTax: taxableIncome * topBracket.rate - topBracket.deduction,
        applicableRate: topBracket.rate,
        applicableDeduction: topBracket.deduction
    };
}

// 判定综合所得汇算所用的"已预缴税额"
// 用户手动填写时以其为准；未填写时按源泉扣缴规则自动推演：
// 工资薪金累计预缴 + 劳务报酬/稿酬/特许权使用费预缴（这三类所得必然产生预缴税）
// 注：年终奖单独计税的税额不属于综合所得预缴，故不计入
function determinePrepaidTax(userInputPrepaidTax, autoPrepaidTax) {
    if (userInputPrepaidTax !== undefined && !isNaN(userInputPrepaidTax)) {
        return userInputPrepaidTax;
    }
    return autoPrepaidTax;
}

function calculatePreTaxIncome(monthlySalaryIncome, workMonths, annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome, bonusIncome) {
    return monthlySalaryIncome * workMonths + annualLaborIncome + 
        annualAuthorIncome + annualRoyaltyIncome + bonusIncome;
}

function performTaxCalculation(inputData) {
    const { workMonths, monthlySalaryIncome, annualLaborIncome, annualAuthorIncome, 
            annualRoyaltyIncome, bonusIncome, bonusInclude, userInputPrepaidTax } = inputData;
    
    const otherIncome = calculateOtherIncome(annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome);
    // 扣除项支持注入：注入时全链路纯计算（供方案对比 / 单测 / 未来 B 端 API 复用）；
    // 未注入时回退读取表单，保持表单主链路行为完全不变
    const deductions = (inputData && inputData.deductions)
        ? inputData.deductions
        : calculateComprehensiveDeductions(workMonths);
    
    const totalIncome = calculateTotalIncome(
        monthlySalaryIncome, workMonths, otherIncome, bonusIncome, bonusInclude
    );
    
    const taxableIncome = Math.max(0, totalIncome - deductions.totalDeduction);
    const donationBeforeTaxableIncome = Math.max(0, totalIncome - (deductions.totalDeduction - deductions.annualCharitableDonation));
    
    const taxResult = calculateIncomeTax(taxableIncome);
    
    const cumulativeTax = calculateCumulativePrepaidTax(workMonths, monthlySalaryIncome, 
        deductions.monthlyBasicDeduction, deductions.monthlyInsuranceDeduction, 
        deductions.monthlySpecialAdditionalTotal, deductions.monthlyPensionDeduction, 
        deductions.monthlyEnterpriseAnnuity, deductions.monthlyInsuranceOtherDeduction, 
        deductions.monthlyTaxDeferredPension);
    
    const bonusTax = calculateBonusTax(bonusIncome, bonusInclude);
    // 综合所得自动预缴 = 工资累计预缴 + 劳务/稿酬/特许权使用费预缴
    const autoPrepaidTax = cumulativeTax + otherIncome.laborTax + otherIncome.authorTax + otherIncome.royaltyTax;
    const prepaidTax = determinePrepaidTax(userInputPrepaidTax, autoPrepaidTax);
    
    // 综合所得汇算应退/应补 = 综合所得应纳税额 - 综合所得已预缴税额
    const refundTax = taxResult.totalTax - prepaidTax;
    const preTaxIncome = calculatePreTaxIncome(monthlySalaryIncome, workMonths, annualLaborIncome, 
        annualAuthorIncome, annualRoyaltyIncome, bonusIncome);
    // 税后年收入 = 税前年收入 - 综合所得应纳税额 - 年终奖（单独计税）税额
    const netIncome = preTaxIncome - taxResult.totalTax - bonusTax;
    
    return {
        workMonths,
        incomeDetails: {
            salary: monthlySalaryIncome,
            labor: annualLaborIncome,
            laborCalculated: otherIncome.laborTaxableIncome,
            laborTax: otherIncome.laborTax,
            author: annualAuthorIncome,
            authorCalculated: otherIncome.authorTaxableIncome,
            authorTax: otherIncome.authorTax,
            royalty: annualRoyaltyIncome,
            royaltyCalculated: otherIncome.royaltyTaxableIncome,
            royaltyTax: otherIncome.royaltyTax,
            bonus: bonusIncome,
            bonusInclude: bonusInclude,
            bonusTax: bonusTax,
            total: totalIncome,
            preTaxTotal: preTaxIncome
        },
        deductionDetails: {
            basic: deductions.monthlyBasicDeduction,
            pensionInsurance: deductions.monthlyPensionInsurance,
            medicalInsurance: deductions.monthlyMedicalInsurance,
            unemploymentInsurance: deductions.monthlyUnemploymentInsurance,
            housingFund: deductions.monthlyHousingFund,
            elderly: deductions.monthlyElderlyDeduction,
            childrenInfant: deductions.monthlyChildrenInfantDeduction,
            housing: deductions.monthlyHousingDeduction,
            education: deductions.annualEducationDeduction,
            medical: deductions.annualMedicalDeduction,
            actualMedical: deductions.actualMedicalDeduction,
            professional: deductions.annualProfessionalDeduction,
            educationDegree: deductions.educationDegreeAmount / workMonths,
            pension: deductions.monthlyPensionDeduction,
            enterpriseAnnuity: deductions.monthlyEnterpriseAnnuity,
            insuranceOther: deductions.monthlyInsuranceOtherDeduction,
            taxDeferredPension: deductions.monthlyTaxDeferredPension,
            charitableDonation: deductions.annualCharitableDonation,
            specialAdditionalTotal: deductions.annualSpecialAdditionalTotal,
            specialDeductionTotal: deductions.annualSpecialDeductionTotal,
            otherTotal: deductions.annualOtherDeductionTotal,
            total: deductions.totalDeduction
        },
        taxDetails: {
            taxableIncome: taxableIncome,
            totalTax: taxResult.totalTax,
            applicableRate: taxResult.applicableRate,
            applicableDeduction: taxResult.applicableDeduction,
            prepaidTax: prepaidTax,
            refundTax: refundTax,
            netIncome: netIncome
        },
        donationBeforeTaxableIncome: donationBeforeTaxableIncome,
        calculationDate: new Date().toISOString()
    };
}

function updateBasicResults(results) {
    document.getElementById('result-total-income').textContent = '¥' + results.incomeDetails.preTaxTotal.toFixed(2);
    document.getElementById('result-total-deduction').textContent = '¥' + results.deductionDetails.total.toFixed(2);
    document.getElementById('result-taxable-income').textContent = '¥' + results.taxDetails.taxableIncome.toFixed(2);
    document.getElementById('result-tax-rate').textContent = (results.taxDetails.applicableRate * 100).toFixed(0) + '%';
    document.getElementById('result-deduction-amount').textContent = '¥' + results.taxDetails.applicableDeduction.toFixed(2);
    document.getElementById('result-total-tax').textContent = '¥' + results.taxDetails.totalTax.toFixed(2);
}

function updateBonusDisplay(results) {
    const bonusDisplay = document.getElementById('bonus-tax-display');
    if (!bonusDisplay) return;

    if (results.incomeDetails.bonus > 0) {
        bonusDisplay.classList.remove('hidden');
        const bonusTaxAmountElement = document.getElementById('bonus-tax-amount');
        const bonusMethodElement = document.getElementById('bonus-method');

        if (bonusTaxAmountElement) {
            bonusTaxAmountElement.textContent = '¥' + results.incomeDetails.bonusTax.toFixed(2);
        }
        if (bonusMethodElement) {
            bonusMethodElement.textContent = results.incomeDetails.bonusInclude ? '并入综合所得计税' : '单独计税';
        }
    } else {
        bonusDisplay.classList.add('hidden');
    }
}

function updateThresholdWarning(results) {
    const thresholdWarningDisplay = document.getElementById('threshold-warning-display');
    if (!thresholdWarningDisplay) return;

    const thresholdResult = checkTaxBracketThreshold(results.taxDetails.taxableIncome);

    if (thresholdResult.warning) {
        thresholdWarningDisplay.classList.remove('hidden');
        safeSetTextContent('threshold-warning-message', thresholdResult.message);
        safeSetTextContent('threshold-current-rate', (thresholdResult.currentRate * 100).toFixed(0) + '%');
        safeSetTextContent('threshold-next-rate', (thresholdResult.nextRate * 100).toFixed(0) + '%');
        safeSetTextContent('threshold-remaining', '¥' + thresholdResult.remaining.toFixed(2));
    } else {
        thresholdWarningDisplay.classList.add('hidden');
    }
}

function updateDonationWarning(results) {
    const donationWarningDisplay = document.getElementById('donation-warning-display');
    if (!donationWarningDisplay) return;

    const donationResult = validateCharitableDonation(
        results.deductionDetails.charitableDonation,
        results.donationBeforeTaxableIncome
    );

    if (donationResult.isExcess) {
        donationWarningDisplay.classList.remove('hidden');
        safeSetTextContent('donation-warning-message', donationResult.message);
        safeSetTextContent('donation-max-amount', '¥' + donationResult.maxDeduction.toFixed(2));
        safeSetTextContent('donation-actual-amount', '¥' + donationResult.actualDeduction.toFixed(2));
        safeSetTextContent('donation-excess-amount', '¥' + donationResult.excessAmount.toFixed(2));
    } else {
        donationWarningDisplay.classList.add('hidden');
    }
}

function updateOptimalBonusDisplay(results) {
    const optimalBonusDisplay = document.getElementById('optimal-bonus-display');
    if (!optimalBonusDisplay) return;

    const optimalResult = calculateOptimalBonusAllocation(
        results.incomeDetails.total,
        results.deductionDetails.total
    );

    if (optimalResult.taxSavings >= 0 && optimalResult.optimalMethod === 'include') {
        optimalBonusDisplay.classList.remove('hidden');
        safeSetTextContent('optimal-bonus-amount', '¥0（并入综合所得）');
        safeSetTextContent('optimal-salary-amount', '¥' + optimalResult.optimalSalary.toFixed(2));
        safeSetTextContent('optimal-tax-savings', '¥0（已是最佳方案）');
        safeSetTextContent('optimal-original-tax', '¥' + optimalResult.allInTax.toFixed(2));
        safeSetTextContent('optimal-new-tax', '¥' + optimalResult.minTax.toFixed(2));
    } else if (optimalResult.taxSavings > 0) {
        optimalBonusDisplay.classList.remove('hidden');
        safeSetTextContent('optimal-bonus-amount', '¥' + optimalResult.optimalBonus.toFixed(2));
        safeSetTextContent('optimal-salary-amount', '¥' + optimalResult.optimalSalary.toFixed(2));
        safeSetTextContent('optimal-tax-savings', '¥' + optimalResult.taxSavings.toFixed(2));
        safeSetTextContent('optimal-original-tax', '¥' + optimalResult.allInTax.toFixed(2));
        safeSetTextContent('optimal-new-tax', '¥' + optimalResult.minTax.toFixed(2));
    } else {
        optimalBonusDisplay.classList.add('hidden');
    }
}

function updatePrepaidAndRefundTax(results) {
    const resultPrepaidTaxElement = document.getElementById('result-prepaid-tax');
    if (resultPrepaidTaxElement) {
        resultPrepaidTaxElement.textContent = '¥' + results.taxDetails.prepaidTax.toFixed(2);
    }

    const refundTaxElement = document.getElementById('result-refund-tax');
    if (refundTaxElement) {
        const refundTax = results.taxDetails.refundTax;
        refundTaxElement.classList.remove('text-danger', 'text-success', 'text-primary');
        if (Math.abs(refundTax) < 0.005) {
            refundTaxElement.textContent = '不退不补 ¥0.00';
        } else if (refundTax > 0) {
            refundTaxElement.textContent = '应补 ¥' + refundTax.toFixed(2);
            refundTaxElement.classList.add('text-danger');
        } else {
            refundTaxElement.textContent = '应退 ¥' + Math.abs(refundTax).toFixed(2);
            refundTaxElement.classList.add('text-success');
        }
    }
}

function updateNetIncome(results) {
    const resultNetIncomeElement = document.getElementById('result-net-income');
    if (resultNetIncomeElement) {
        resultNetIncomeElement.textContent = '¥' + results.taxDetails.netIncome.toFixed(2);
    }
}

function updateTaxBarVisualization(results) {
    const start = performance.now();
    const totalIncome = results.incomeDetails.total;
    const totalTax = results.taxDetails.totalTax;
    const effectiveRate = totalIncome > 0 ? (totalTax / totalIncome * 100) : 0;

    const barFill = document.getElementById('result-tax-bar-fill');
    if (barFill) {
        barFill.style.width = Math.min(effectiveRate, 100) + '%';
    }
    const rateEl = document.getElementById('result-effective-rate');
    if (rateEl) {
        rateEl.textContent = effectiveRate.toFixed(1) + '%';
    }
    const duration = +(performance.now() - start).toFixed(3);
    if (typeof InteractionLog !== 'undefined') {
        InteractionLog.calc('税负条渲染', { totalIncome, totalTax, effectiveRate: effectiveRate.toFixed(2) + '%' }, { durationMs: duration });
    }
}

function updateTaxResultsUI(results) {
    updateBasicResults(results);
    updateBonusDisplay(results);
    updateThresholdWarning(results);
    updateDonationWarning(results);
    updateOptimalBonusDisplay(results);
    updatePrepaidAndRefundTax(results);
    updateNetIncome(results);
    updateTaxBarVisualization(results);
    // 计算过程面板由 utils.js 提供；未加载时跳过，保证计算层可独立加载与测试
    if (typeof updateFormulaSteps === 'function') {
        updateFormulaSteps(results);
    }
    // Phase 2：结论 / 一句话理由 / 注意点（只有 utils.js 已加载时才渲染，保证计算层可独立测试）
    if (typeof updateResultNarrative === 'function') {
        updateResultNarrative(results);
    }
}

function handleCalculationError(error) {
    console.error('计算过程中出现错误:', error);
    showAlert('计算过程中出现错误：' + error.message);
}

// 计算综合所得应纳税额
function calculateTax() {
    try {
        const inputData = collectTaxInputData();
        const calculationData = performTaxCalculation(inputData);
        calculationResults = calculationData;
        updateTaxResultsUI(calculationResults);
    } catch (error) {
        handleCalculationError(error);
    }
}

// 计算反向倒算扣除项
// 反向倒算「扣除项」涉及的字段 id（去掉 reverse- 前缀后的部分，页面与 spec 共用同一套键）
const REVERSE_DEDUCTION_KEYS = [
    'special-deduction-checkbox',
    'special-additional-deduction-checkbox',
    'other-deduction-checkbox',
    'pension-insurance',
    'medical-insurance',
    'unemployment-insurance',
    'housing-fund',
    'children-infant-deduction',
    'elderly-deduction',
    'housing-type',
    'rent-deduction',
    'housing-loan-deduction',
    'education-deduction',
    'medical-deduction',
    'education-professional-checkbox',
    'pension-deduction-checkbox',
    'pension-deduction',
    'enterprise-annuity-checkbox',
    'enterprise-annuity',
    'insurance-other-deduction-checkbox',
    'insurance-other-deduction',
    'tax-deferred-pension-checkbox',
    'tax-deferred-pension',
    'charitable-donation-checkbox',
    'charitable-donation'
];


// 综合所得的反向倒算扣除汇总（纯函数：不读 DOM，ded 为「去前缀 id → 值」字典）
function calculateReverseDeductions(ded, workMonths) {
    ded = ded || {};
    const basicDeduction = 5000;
    
    const isSpecialDeductionVisible = !!ded['special-deduction-checkbox'];
    const isSpecialAdditionalDeductionVisible = !!ded['special-additional-deduction-checkbox'];
    const isOtherDeductionVisible = !!ded['other-deduction-checkbox'];
    
    let monthlyPensionInsurance = 0;
    let monthlyMedicalInsurance = 0;
    let monthlyUnemploymentInsurance = 0;
    let monthlyHousingFund = 0;
    let specialDeduction = 0;
    if (isSpecialDeductionVisible) {
        monthlyPensionInsurance = ded['pension-insurance'] || 0;
        monthlyMedicalInsurance = ded['medical-insurance'] || 0;
        monthlyUnemploymentInsurance = ded['unemployment-insurance'] || 0;
        monthlyHousingFund = ded['housing-fund'] || 0;
        specialDeduction = monthlyPensionInsurance + monthlyMedicalInsurance + 
            monthlyUnemploymentInsurance + monthlyHousingFund;
    }
    
    let monthlyChildrenInfantDeduction = 0;
    let monthlyElderlyDeduction = 0;
    let monthlyHousingDeduction = 0;
    let annualEducationDeduction = 0;
    let medicalDeduction = 0;
    let actualMedicalDeduction = 0;
    let annualProfessionalDeduction = 0;
    let educationDegreeAmount = 0;
    let monthlyEducationDeduction = 0;
    let specialAdditionalDeduction = 0;
    if (isSpecialAdditionalDeductionVisible) {
        monthlyChildrenInfantDeduction = ded['children-infant-deduction'] || 0;
        monthlyElderlyDeduction = ded['elderly-deduction'] || 0;
        
        const housingType = ded['housing-type'];
        if (housingType === 'rent') {
            monthlyHousingDeduction = ded['rent-deduction'] || 0;
        } else if (housingType === 'loan') {
            monthlyHousingDeduction = ded['housing-loan-deduction'] || 0;
        }

        annualEducationDeduction = ded['education-deduction'] || 0;
        medicalDeduction = ded['medical-deduction'] || 0;
        actualMedicalDeduction = medicalDeduction > 15000 ? Math.min(medicalDeduction - 15000, 80000) : 0;
        
        if (ded['education-professional-checkbox']) {
            annualProfessionalDeduction = 3600;
        }
        
        educationDegreeAmount = annualEducationDeduction - annualProfessionalDeduction;
        monthlyEducationDeduction = educationDegreeAmount / workMonths;
        specialAdditionalDeduction = monthlyChildrenInfantDeduction + monthlyElderlyDeduction + 
            monthlyHousingDeduction + monthlyEducationDeduction;
    }
    
    let monthlyPensionDeduction = 0;
    let monthlyEnterpriseAnnuity = 0;
    let monthlyInsuranceOtherDeduction = 0;
    let monthlyTaxDeferredPension = 0;
    let otherDeduction = 0;
    const isPensionDeductionChecked = isOtherDeductionVisible && !!ded['pension-deduction-checkbox'];
    monthlyPensionDeduction = isPensionDeductionChecked ? (ded['pension-deduction'] || 0) : 0;
    const isEnterpriseAnnuityChecked = isOtherDeductionVisible && !!ded['enterprise-annuity-checkbox'];
    monthlyEnterpriseAnnuity = isEnterpriseAnnuityChecked ? (ded['enterprise-annuity'] || 0) : 0;
    const isInsuranceOtherDeductionChecked = isOtherDeductionVisible && !!ded['insurance-other-deduction-checkbox'];
    monthlyInsuranceOtherDeduction = isInsuranceOtherDeductionChecked ? (ded['insurance-other-deduction'] || 0) : 0;
    const isTaxDeferredPensionChecked = isOtherDeductionVisible && !!ded['tax-deferred-pension-checkbox'];
    monthlyTaxDeferredPension = isTaxDeferredPensionChecked ? (ded['tax-deferred-pension'] || 0) : 0;
    otherDeduction = monthlyPensionDeduction + monthlyEnterpriseAnnuity + 
        monthlyInsuranceOtherDeduction + monthlyTaxDeferredPension;
    
    const monthlyTotalDeduction = basicDeduction + specialDeduction + specialAdditionalDeduction + otherDeduction;
    
    const isCharitableDonationChecked = isOtherDeductionVisible && !!ded['charitable-donation-checkbox'];
    const annualCharitableDonation = isCharitableDonationChecked ? (ded['charitable-donation'] || 0) : 0;
    const totalDeduction = monthlyTotalDeduction * workMonths + annualProfessionalDeduction + 
        actualMedicalDeduction + annualCharitableDonation;
    
    return {
        monthlyBasicDeduction: basicDeduction,
        monthlyPensionInsurance,
        monthlyMedicalInsurance,
        monthlyUnemploymentInsurance,
        monthlyHousingFund,
        monthlyElderlyDeduction,
        monthlyChildrenInfantDeduction,
        monthlyHousingDeduction,
        annualEducationDeduction,
        annualMedicalDeduction: medicalDeduction,
        annualProfessionalDeduction,
        actualMedicalDeduction,
        educationDegreeAmount,
        monthlyEducationDeduction,
        monthlyPensionDeduction,
        monthlyEnterpriseAnnuity,
        monthlyInsuranceOtherDeduction,
        monthlyTaxDeferredPension,
        annualCharitableDonation,
        monthlySpecialAdditionalTotal: specialAdditionalDeduction,
        annualSpecialAdditionalTotal: specialAdditionalDeduction * workMonths + annualProfessionalDeduction + actualMedicalDeduction,
        annualOtherDeductionTotal: otherDeduction * workMonths + annualCharitableDonation,
        monthlyInsuranceDeduction: specialDeduction,
        annualSpecialDeductionTotal: specialDeduction * workMonths,
        basicDeduction,
        specialDeduction,
        specialAdditionalDeduction,
        otherDeduction,
        monthlyTotalDeduction,
        totalDeduction
    };
}



// 计算反向倒算年终奖税额
function calculateReverseBonusTax(inputData) {
    let bonusTax = 0;
    if (inputData.bonusIncome > 0 && !inputData.bonusInclude) {
        const monthlyBonus = inputData.bonusIncome / 12;
        for (const bracket of bonusMonthlyTaxRates) {
            if (monthlyBonus <= bracket.max) {
                bonusTax = inputData.bonusIncome * bracket.rate - bracket.deduction;
                break;
            }
        }
    }
    return bonusTax;
}

// 辅助函数：根据应纳税所得额计算税额
function calculateTaxByTaxableIncome(taxableIncome) {
    if (taxableIncome <= 0) return { tax: 0, rate: 0, deduction: 0 };
    
    for (const bracket of comprehensiveTaxRates) {
        if (taxableIncome <= bracket.max) {
            const tax = taxableIncome * bracket.rate - bracket.deduction;
            return {
                tax: Math.max(0, tax),
                rate: bracket.rate,
                deduction: bracket.deduction
            };
        }
    }
    return { tax: 0, rate: 0, deduction: 0 };
}

// 方式1：按目标税率倒算（给定税率，计算所需收入范围）
// 核心逻辑：
// 1. 根据目标税率找到对应的应纳税所得额范围 [min, max]
// 2. 税前收入 = 应纳税所得额 + 扣除总额
// 3. 总收入 = 综合所得税前收入 + 年终奖
function calculateFromTargetRate(inputData, deductionData, bonusTax, mode = 'conservative') {
    const targetRate = inputData.targetRate / 100;
    
    // 步骤1：找到目标税率对应的级距
    const targetBracket = comprehensiveTaxRates.find(
        bracket => Math.abs(bracket.rate - targetRate) < 0.001
    );
    
    if (!targetBracket) {
        throw new Error('找不到对应的税率级距');
    }
    
    // 步骤2：获取该税率对应的应纳税所得额范围
    // 数据来源：中国个人所得税法综合所得税率表
    const minTaxableIncome = targetBracket.min || 0;
    const maxTaxableIncome = targetBracket.max;
    
    // 步骤3：计算综合所得税前收入范围
    // 公式：综合所得税前收入 = 应纳税所得额 + 扣除总额
    const minPreTaxIncome = minTaxableIncome + deductionData.totalDeduction;
    const maxPreTaxIncome = maxTaxableIncome === Infinity 
        ? Infinity 
        : maxTaxableIncome + deductionData.totalDeduction;
    
    // 步骤4：计算总收入范围
    // 总收入 = 综合所得税前收入 + 年终奖（年终奖是否并入只影响税额，不影响收入范围）
    let minTotalIncome, maxTotalIncome;
    
    if (inputData.bonusIncome > 0) {
        // 有年终奖：总收入 = 综合所得 + 年终奖
        minTotalIncome = minPreTaxIncome + inputData.bonusIncome;
        maxTotalIncome = maxPreTaxIncome === Infinity 
            ? Infinity 
            : maxPreTaxIncome + inputData.bonusIncome;
    } else {
        // 无年终奖
        minTotalIncome = minPreTaxIncome;
        maxTotalIncome = maxPreTaxIncome;
    }
    
    // 步骤5：根据计算模式确定参考应纳税所得额
    // 保守模式（conservative）：最低值+1，确保达到目标税率（仅对最低档位设置小额最低值）
    // 均衡模式（balanced）：区间中间值，反映平均税负水平
    // 进取模式（aggressive）：最高值，接近上限的税负水平
    let middleTaxableIncome;
    // 仅对最低税率档位设置合理最低值，保持对所有收入群体的适用性
    // 3%档位允许应纳税所得额为 0 元（0-36000元均适用3%税率）
    // 其他档位使用原值+1，确保精确性和适用性
    const minimumTaxableIncome = minTaxableIncome === 0 ? 0 : minTaxableIncome + 1;
    
    if (maxTaxableIncome === Infinity) {
        // 最高档位：根据模式调整
        switch(mode) {
            case 'conservative':
                middleTaxableIncome = minimumTaxableIncome;
                break;
            case 'balanced':
                middleTaxableIncome = minTaxableIncome + 100000;
                break;
            case 'aggressive':
                middleTaxableIncome = minTaxableIncome + 200000;
                break;
            default:
                middleTaxableIncome = minTaxableIncome + 100000;
        }
    } else {
        switch(mode) {
            case 'conservative':
                middleTaxableIncome = minimumTaxableIncome;
                break;
            case 'balanced':
                middleTaxableIncome = (minTaxableIncome + maxTaxableIncome) / 2;
                break;
            case 'aggressive':
                middleTaxableIncome = maxTaxableIncome;
                break;
            default:
                middleTaxableIncome = minimumTaxableIncome;
        }
    }
    
    // 确保应纳税所得额非负
    middleTaxableIncome = Math.max(0, middleTaxableIncome);
    
    // 步骤6：计算中间值对应的税额和税后收入
    const middlePreTaxIncome = middleTaxableIncome + deductionData.totalDeduction;
    let middleTotalIncome;
    
    if (inputData.bonusIncome > 0) {
        middleTotalIncome = middlePreTaxIncome + inputData.bonusIncome;
    } else {
        middleTotalIncome = middlePreTaxIncome;
    }
    
    // 计算综合所得税额
    // 公式：应纳税额 = 应纳税所得额 × 税率 - 速算扣除数
    const middleComprehensiveTax = middleTaxableIncome * targetBracket.rate - targetBracket.deduction;
    // 总税额 = 综合所得税额 + 年终奖税额
    const middleTotalTax = middleComprehensiveTax + bonusTax;
    // 税后收入 = 税前收入 - 总税额
    const middleNetIncome = middleTotalIncome - middleTotalTax;
    
    return {
        totalIncome: middleTotalIncome,
        minTotalIncome: minTotalIncome,
        maxTotalIncome: maxTotalIncome,
        finalTotalTax: middleTotalTax,
        calculatedNetIncome: middleNetIncome,
        taxableIncome: middleTaxableIncome,
        taxableIncomeRange: {
            min: minTaxableIncome,
            max: maxTaxableIncome
        },
        applicableRate: targetBracket.rate,
        applicableDeduction: targetBracket.deduction,
        isRateMode: true,
        modeName: '税率倒算',
        calculationMode: mode,
        bracketInfo: {
            rate: targetBracket.rate,
            min: minTaxableIncome,
            max: maxTaxableIncome,
            deduction: targetBracket.deduction
        }
    };
}

// 方式2：按月度税后收入倒算（给定税后收入，计算税前收入）
// 核心逻辑：
// 已知：税后收入 = 税前收入 - 应纳税额 - 年终奖税额
// 使用二分法求解税前收入，支持三种计算模式
function calculateFromMonthlyNet(inputData, deductionData, bonusTax, mode = 'balanced') {
    const monthlyNet = inputData.monthlyNet;
    const workMonths = inputData.workMonths;
    
    // 步骤1：计算年度目标税后收入
    // 公式：年度税后收入 = 月度税后收入 × 工作月数
    const annualNetTarget = monthlyNet * workMonths;
    
    // 步骤2：二分求解基准应纳税所得额
    // Phase 2.5 ①：算法骨架改走通用求解器（见 solver.js）——本文件只保留**判据**：
    // 「到手还不够，要往前加钱」。求解器只负责怎么收敛，判断「该不该往上找」的还是这一句，
    //   这也是这里唯一可能有 bug 的一行。
    // 搜索区间 [扣除总额, 扣除总额 + 10000000] 与到分为止的精度沿用原实现，保证数值逐位不变。
    const solved = window.EuriskoSolver.solveMonotone({
        lo: deductionData.totalDeduction,
        hi: deductionData.totalDeduction + 10000000,
        increase: function (income) {
            const taxableIncome = income - deductionData.totalDeduction;
            if (taxableIncome <= 0) return true;
            const netIncome = income - calculateTaxByTaxableIncome(taxableIncome).tax - bonusTax;
            return netIncome < annualNetTarget;
        }
    });

    const baseTaxableIncome = Math.max(0, solved.value - deductionData.totalDeduction);
    
    // 步骤3：确定基准应纳税所得额所在的税率档位
    let targetBracket = null;
    for (const bracket of comprehensiveTaxRates) {
        if (baseTaxableIncome <= bracket.max) {
            targetBracket = bracket;
            break;
        }
    }
    if (!targetBracket) {
        targetBracket = comprehensiveTaxRates[comprehensiveTaxRates.length - 1];
    }
    
    // 步骤4：根据计算模式确定应纳税所得额
    // 保守模式：档位下限+1
    // 均衡模式：档位中间值
    // 进取模式：档位上限（或最大值）
    const minTaxableIncome = targetBracket.min || 0;
    const maxTaxableIncome = targetBracket.max === Infinity ? 10000000 : targetBracket.max;
    
    let modeTaxableIncome;
    // 3%档位允许应纳税所得额为 0 元（0-36000元均适用3%税率）
    const minimumTaxableIncome = minTaxableIncome === 0 ? 0 : minTaxableIncome + 1;
    
    if (maxTaxableIncome === Infinity) {
        switch(mode) {
            case 'conservative':
                modeTaxableIncome = minimumTaxableIncome;
                break;
            case 'balanced':
                modeTaxableIncome = baseTaxableIncome;
                break;
            case 'aggressive':
                modeTaxableIncome = Math.max(baseTaxableIncome, minTaxableIncome + 200000);
                break;
            default:
                modeTaxableIncome = baseTaxableIncome;
        }
    } else {
        switch(mode) {
            case 'conservative':
                modeTaxableIncome = minimumTaxableIncome;
                break;
            case 'balanced':
                modeTaxableIncome = baseTaxableIncome;
                break;
            case 'aggressive':
                modeTaxableIncome = maxTaxableIncome;
                break;
            default:
                modeTaxableIncome = baseTaxableIncome;
        }
    }
    
    // 确保应纳税所得额非负
    modeTaxableIncome = Math.max(0, modeTaxableIncome);
    
    // 步骤5：计算对应的税前收入
    const preTaxIncome = modeTaxableIncome + deductionData.totalDeduction;
    let totalIncome;
    
    if (inputData.bonusIncome > 0) {
        totalIncome = preTaxIncome + inputData.bonusIncome;
    } else {
        totalIncome = preTaxIncome;
    }
    
    // 步骤6：计算税额
    const taxResult = calculateTaxByTaxableIncome(modeTaxableIncome);
    const comprehensiveTax = taxResult.tax;
    const finalTotalTax = comprehensiveTax + bonusTax;
    const calculatedNetIncome = totalIncome - finalTotalTax;
    
    return {
        totalIncome: totalIncome,
        monthlyIncome: totalIncome / workMonths,
        finalTotalTax: finalTotalTax,
        calculatedNetIncome: calculatedNetIncome,
        monthlyNet: calculatedNetIncome / workMonths,
        taxableIncome: modeTaxableIncome,
        applicableRate: taxResult.rate,
        applicableDeduction: taxResult.deduction,
        isMonthlyMode: true,
        modeName: '月度税后倒算',
        calculationMode: mode,
        bracketInfo: {
            rate: targetBracket.rate,
            min: minTaxableIncome,
            max: maxTaxableIncome,
            deduction: targetBracket.deduction
        }
    };
}

// 方式3：按目标税额倒算（给定目标税额，计算所需税前收入）
// 核心逻辑：
// 已知：税额 = 应纳税所得额 × 税率 - 速算扣除数
// 使用二分法求解应纳税所得额，然后计算税前收入，支持三种计算模式
// 注意：税额和到手金额二选一，优先使用税额
function calculateFromTargetTax(inputData, deductionData, bonusTax, mode = 'balanced') {
    const targetTax = inputData.fixedTax;
    const targetNet = inputData.fixedNet;
    
    // 情况A：仅输入目标税额（或同时输入时优先使用税额），税额为0时也允许计算
    if (targetTax >= 0) {
        // 步骤1：二分求解基准应纳税所得额（通用求解器 + 本函数的判据：税额还不够）
        const solved = window.EuriskoSolver.solveMonotone({
            lo: deductionData.totalDeduction,
            hi: deductionData.totalDeduction + 10000000,
            increase: function (income) {
                const taxable = income - deductionData.totalDeduction;
                if (taxable <= 0) return true;
                return calculateTaxByTaxableIncome(taxable).tax + bonusTax < targetTax;
            }
        });

        const baseTaxableIncome = Math.max(0, solved.value - deductionData.totalDeduction);
        
        // 步骤2：确定基准应纳税所得额所在的税率档位
        let targetBracket = null;
        for (const bracket of comprehensiveTaxRates) {
            if (baseTaxableIncome <= bracket.max) {
                targetBracket = bracket;
                break;
            }
        }
        if (!targetBracket) {
            targetBracket = comprehensiveTaxRates[comprehensiveTaxRates.length - 1];
        }
        
        // 步骤3：根据计算模式确定应纳税所得额
        const minTaxableIncome = targetBracket.min || 0;
        const maxTaxableIncome = targetBracket.max === Infinity ? 10000000 : targetBracket.max;
        
        let modeTaxableIncome;
        // 3%档位允许应纳税所得额为 0 元（0-36000元均适用3%税率）
        const minimumTaxableIncome = minTaxableIncome === 0 ? 0 : minTaxableIncome + 1;
        
        if (maxTaxableIncome === Infinity) {
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = minimumTaxableIncome;
                    break;
                case 'balanced':
                    modeTaxableIncome = baseTaxableIncome;
                    break;
                case 'aggressive':
                    modeTaxableIncome = Math.max(baseTaxableIncome, minTaxableIncome + 200000);
                    break;
                default:
                    modeTaxableIncome = baseTaxableIncome;
            }
        } else {
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = minimumTaxableIncome;
                    break;
                case 'balanced':
                    modeTaxableIncome = baseTaxableIncome;
                    break;
                case 'aggressive':
                    modeTaxableIncome = maxTaxableIncome;
                    break;
                default:
                    modeTaxableIncome = baseTaxableIncome;
            }
        }
        
        modeTaxableIncome = Math.max(0, modeTaxableIncome);
        
        // 步骤4：计算对应的税前收入
        const preTaxIncome = modeTaxableIncome + deductionData.totalDeduction;
        let totalIncome;
        
        if (inputData.bonusIncome > 0) {
            totalIncome = preTaxIncome + inputData.bonusIncome;
        } else {
            totalIncome = preTaxIncome;
        }
        
        // 步骤5：计算实际税额
        const taxResult = calculateTaxByTaxableIncome(modeTaxableIncome);
        const actualTax = taxResult.tax + bonusTax;
        
        return {
            totalIncome: totalIncome,
            finalTotalTax: actualTax,
            calculatedNetIncome: totalIncome - actualTax,
            taxableIncome: modeTaxableIncome,
            applicableRate: taxResult.rate,
            applicableDeduction: taxResult.deduction,
            isTaxMode: true,
            modeName: '税额倒算',
            calculationMode: mode,
            bracketInfo: {
                rate: targetBracket.rate,
                min: minTaxableIncome,
                max: maxTaxableIncome,
                deduction: targetBracket.deduction
            },
            targetTax: targetTax,
            taxDifference: actualTax - targetTax
        };
    }
    
    // 情况B：仅输入到手金额（税额为0时），到手金额为0时也允许计算
    if (targetNet >= 0) {
        // 二分求解基准应纳税所得额（通用求解器 + 本函数的判据：到手还不够）
        const solved = window.EuriskoSolver.solveMonotone({
            lo: deductionData.totalDeduction,
            hi: deductionData.totalDeduction + 10000000,
            increase: function (income) {
                const taxable = income - deductionData.totalDeduction;
                if (taxable <= 0) return true;
                return income - (calculateTaxByTaxableIncome(taxable).tax + bonusTax) < targetNet;
            }
        });

        const baseTaxableIncome = Math.max(0, solved.value - deductionData.totalDeduction);
        
        // 确定基准应纳税所得额所在的税率档位
        let targetBracket = null;
        for (const bracket of comprehensiveTaxRates) {
            if (baseTaxableIncome <= bracket.max) {
                targetBracket = bracket;
                break;
            }
        }
        if (!targetBracket) {
            targetBracket = comprehensiveTaxRates[comprehensiveTaxRates.length - 1];
        }
        
        // 根据计算模式确定应纳税所得额
        const minTaxableIncome = targetBracket.min || 0;
        const maxTaxableIncome = targetBracket.max === Infinity ? 10000000 : targetBracket.max;
        
        let modeTaxableIncome;
        const minimumTaxableIncome = minTaxableIncome === 0 ? 0 : minTaxableIncome + 1;
        
        if (maxTaxableIncome === Infinity) {
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = minimumTaxableIncome;
                    break;
                case 'balanced':
                    modeTaxableIncome = baseTaxableIncome;
                    break;
                case 'aggressive':
                    modeTaxableIncome = Math.max(baseTaxableIncome, minTaxableIncome + 200000);
                    break;
                default:
                    modeTaxableIncome = baseTaxableIncome;
            }
        } else {
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = minimumTaxableIncome;
                    break;
                case 'balanced':
                    modeTaxableIncome = baseTaxableIncome;
                    break;
                case 'aggressive':
                    modeTaxableIncome = maxTaxableIncome;
                    break;
                default:
                    modeTaxableIncome = baseTaxableIncome;
            }
        }
        
        modeTaxableIncome = Math.max(0, modeTaxableIncome);
        
        // 计算对应的税前收入
        const preTaxIncome = modeTaxableIncome + deductionData.totalDeduction;
        let totalIncome;
        
        if (inputData.bonusIncome > 0) {
            totalIncome = preTaxIncome + inputData.bonusIncome;
        } else {
            totalIncome = preTaxIncome;
        }
        
        // 计算实际税额
        const taxResult = calculateTaxByTaxableIncome(modeTaxableIncome);
        const actualTax = taxResult.tax + bonusTax;
        
        return {
            totalIncome: totalIncome,
            finalTotalTax: actualTax,
            calculatedNetIncome: totalIncome - actualTax,
            taxableIncome: modeTaxableIncome,
            applicableRate: taxResult.rate,
            applicableDeduction: taxResult.deduction,
            isTaxMode: true,
            modeName: '到手金额倒算',
            calculationMode: mode,
            bracketInfo: {
                rate: targetBracket.rate,
                min: minTaxableIncome,
                max: maxTaxableIncome,
                deduction: targetBracket.deduction
            },
            targetNet: targetNet,
            taxDifference: (totalIncome - actualTax) - targetNet
        };
    }
}

// 反向倒算内核：不读 DOM。inputData 的字段见 tests/reverse-migration.test.js 的用例；
// ded 是「去前缀的 DOM id → 值」字典（如 'pension-insurance'），原先由页面版的
// readReverseDeductionValues 对着表单攒出来；17B-2 起改由 spec 的 compute 把驼峰键转成短横线键拼。
// 三个逆推入口（目标税负率 / 月度到手 / 固定税额或到手）× 三种口径（保守/均衡/激进）都在这里分派。
// 注：incomeType==='business' 分支仍由旧的实际函数读表 —— spec 版不含经营所得，会随旧页面一并删除。
function calculateReverseTaxCore(inputData, ded) {
        const deductionData = inputData.incomeType === 'business'
            ? calculateBusinessReverseDeductions(inputData)
            : calculateReverseDeductions(ded, inputData.workMonths);
        
        let result;
        let allModeResults = {}; // 存储三种模式的结果
        let bonusTax = 0; // 初始化年终奖税额，经营所得不涉及年终奖
        
        if (inputData.incomeType === 'business') {
            if (inputData.reverseType === 'rate') {
                // 计算三种模式的结果
                allModeResults.conservative = calculateBusinessFromTargetRate(inputData, deductionData, 'conservative');
                allModeResults.balanced = calculateBusinessFromTargetRate(inputData, deductionData, 'balanced');
                allModeResults.aggressive = calculateBusinessFromTargetRate(inputData, deductionData, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    // 全部模式：使用均衡模式作为默认显示，但保存所有结果
                    result = allModeResults.balanced;
                } else {
                    // 使用用户选择的模式
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            } else if (inputData.reverseType === 'monthly') {
                // 计算三种模式的结果
                allModeResults.conservative = calculateBusinessFromMonthlyNet(inputData, deductionData, 'conservative');
                allModeResults.balanced = calculateBusinessFromMonthlyNet(inputData, deductionData, 'balanced');
                allModeResults.aggressive = calculateBusinessFromMonthlyNet(inputData, deductionData, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    result = allModeResults.balanced;
                } else {
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            } else {
                // 计算三种模式的结果
                allModeResults.conservative = calculateBusinessFromTargetTax(inputData, deductionData, 'conservative');
                allModeResults.balanced = calculateBusinessFromTargetTax(inputData, deductionData, 'balanced');
                allModeResults.aggressive = calculateBusinessFromTargetTax(inputData, deductionData, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    result = allModeResults.balanced;
                } else {
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            }
        } else {
            bonusTax = calculateReverseBonusTax(inputData);
            if (inputData.reverseType === 'rate') {
                // 计算三种模式的结果
                allModeResults.conservative = calculateFromTargetRate(inputData, deductionData, bonusTax, 'conservative');
                allModeResults.balanced = calculateFromTargetRate(inputData, deductionData, bonusTax, 'balanced');
                allModeResults.aggressive = calculateFromTargetRate(inputData, deductionData, bonusTax, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    // 全部模式：使用均衡模式作为默认显示，但保存所有结果
                    result = allModeResults.balanced;
                } else {
                    // 使用用户选择的模式
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            } else if (inputData.reverseType === 'monthly') {
                // 计算三种模式的结果
                allModeResults.conservative = calculateFromMonthlyNet(inputData, deductionData, bonusTax, 'conservative');
                allModeResults.balanced = calculateFromMonthlyNet(inputData, deductionData, bonusTax, 'balanced');
                allModeResults.aggressive = calculateFromMonthlyNet(inputData, deductionData, bonusTax, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    result = allModeResults.balanced;
                } else {
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            } else {
                // 计算三种模式的结果
                allModeResults.conservative = calculateFromTargetTax(inputData, deductionData, bonusTax, 'conservative');
                allModeResults.balanced = calculateFromTargetTax(inputData, deductionData, bonusTax, 'balanced');
                allModeResults.aggressive = calculateFromTargetTax(inputData, deductionData, bonusTax, 'aggressive');
                // 根据用户选择决定显示的结果
                if (inputData.calcMode === 'all') {
                    result = allModeResults.balanced;
                } else {
                    result = allModeResults[inputData.calcMode] || allModeResults.conservative;
                }
            }
        }
        
        return {
            result: result,
            deductionData: deductionData,
            bonusTax: bonusTax,
            allModeResults: allModeResults
        };
}



// 保存反向倒算计算结果
// 「结果明细账」：incomeDetails / deductionDetails / taxDetails 三段结构。
// 17B-2 抽出来是为了让页面版与 spec 版吃同一份形状 —— utils.js 的 buildReverseFormulaSteps
// 认的正是这三段，写第二份必然在字段名上漂移（推导链看着在，读出来的却是另一个口径）。
function buildReverseResultsRecord(result, inputData, deductionData, bonusTax, allModeResults) {
    return {
        incomeType: inputData.incomeType,
        reverseType: inputData.reverseType,
        workMonths: inputData.workMonths,
        calcMode: inputData.calcMode,
        totalIncome: result.totalIncome,
        totalDeduction: deductionData.totalDeduction,
        totalTax: result.finalTotalTax,
        allModeResults: allModeResults, // 保存所有模式的结果
        incomeDetails: {
            total: result.totalIncome,
            minTotal: result.minTotalIncome,
            maxTotal: result.maxTotalIncome,
            monthly: result.monthlyIncome
        },
        deductionDetails: {
            basic: deductionData.monthlyBasicDeduction,
            pensionInsurance: deductionData.monthlyPensionInsurance,
            medicalInsurance: deductionData.monthlyMedicalInsurance,
            unemploymentInsurance: deductionData.monthlyUnemploymentInsurance,
            housingFund: deductionData.monthlyHousingFund,
            elderly: deductionData.monthlyElderlyDeduction,
            childrenInfant: deductionData.monthlyChildrenInfantDeduction,
            housing: deductionData.monthlyHousingDeduction,
            education: deductionData.annualEducationDeduction,
            medical: deductionData.annualMedicalDeduction,
            professional: deductionData.annualProfessionalDeduction,
            actualMedical: deductionData.actualMedicalDeduction,
            educationDegree: deductionData.monthlyEducationDeduction,
            pension: deductionData.monthlyPensionDeduction,
            enterpriseAnnuity: deductionData.monthlyEnterpriseAnnuity,
            insuranceOther: deductionData.monthlyInsuranceOtherDeduction,
            taxDeferredPension: deductionData.monthlyTaxDeferredPension,
            charitableDonation: deductionData.annualCharitableDonation,
            specialAdditionalTotal: deductionData.annualSpecialAdditionalTotal,
            specialDeductionTotal: deductionData.annualSpecialDeductionTotal,
            otherTotal: deductionData.annualOtherDeductionTotal,
            total: deductionData.totalDeduction
        },
        taxDetails: {
            totalTax: result.finalTotalTax,
            netIncome: result.calculatedNetIncome,
            monthlyNet: result.monthlyNet,
            targetTax: result.targetTax,
            targetNet: result.targetNet,
            taxableIncome: result.taxableIncome,
            applicableRate: result.applicableRate,
            applicableDeduction: result.applicableDeduction
        },
        bonusIncome: inputData.bonusIncome,
        bonusTax: bonusTax,
        calculationDate: new Date().toISOString()
    };
}




// 辅助函数：根据应纳税所得额和税率表计算经营所得税额
function calculateBusinessTaxByTaxableIncome(taxableIncome) {
    if (taxableIncome <= 0) return { tax: 0, rate: 0, deduction: 0 };
    
    for (const bracket of businessTaxRates) {
        if (taxableIncome <= bracket.max) {
            const tax = taxableIncome * bracket.rate - bracket.deduction;
            return {
                tax: Math.max(0, tax),
                rate: bracket.rate,
                deduction: bracket.deduction
            };
        }
    }
    return { tax: 0, rate: 0, deduction: 0 };
}

// 经营所得反向倒算：按目标税率倒算
function calculateBusinessFromTargetRate(inputData, deductionData, mode = 'conservative') {
    const targetRate = inputData.targetRate / 100;
    
    const targetBracket = businessTaxRates.find(
        bracket => Math.abs(bracket.rate - targetRate) < 0.001
    );
    
    if (!targetBracket) {
        throw new Error('找不到对应的经营所得税率级距');
    }
    
    const minTaxableIncome = targetBracket.min || 0;
    const maxTaxableIncome = targetBracket.max;
    
    // 根据计算模式确定参考应纳税所得额
    // 保守模式（conservative）：最低值+1，确保达到目标税率（仅对最低档位设置小额最低值）
    // 均衡模式（balanced）：区间中间值，反映平均税负水平
    // 进取模式（aggressive）：最高值-1，接近上限的税负水平
    let middleTaxableIncome;
    // 仅对最低税率档位设置合理最低值，保持对所有收入群体的适用性
    // 5%档位设置12,000元（每月1,000元）作为最低基准，避免1元等不合理数值
    // 其他档位使用原值+1，确保精确性和适用性
    const minimumTaxableIncome = minTaxableIncome === 0 ? 12000 : minTaxableIncome + 1;
    
    if (maxTaxableIncome === Infinity) {
        // 最高档位：根据模式调整
        switch(mode) {
            case 'conservative':
                middleTaxableIncome = minimumTaxableIncome;
                break;
            case 'balanced':
                middleTaxableIncome = minTaxableIncome + 100000;
                break;
            case 'aggressive':
                middleTaxableIncome = minTaxableIncome + 200000;
                break;
            default:
                middleTaxableIncome = minTaxableIncome + 100000;
        }
    } else {
        switch(mode) {
            case 'conservative':
                middleTaxableIncome = minimumTaxableIncome;
                break;
            case 'balanced':
                middleTaxableIncome = (minTaxableIncome + maxTaxableIncome) / 2;
                break;
            case 'aggressive':
                middleTaxableIncome = maxTaxableIncome;
                break;
            default:
                middleTaxableIncome = minimumTaxableIncome;
        }
    }
    
    // 确保应纳税所得额非负
    middleTaxableIncome = Math.max(0, middleTaxableIncome);
    
    // 经营所得：应纳税额 = 应纳税所得额 × 税率 - 速算扣除数
    const taxResult = calculateBusinessTaxByTaxableIncome(middleTaxableIncome);
    
    // 计算减半征收
    const halvingThreshold = 2000000;
    const halvingTaxable = Math.min(middleTaxableIncome, halvingThreshold);
    const halvingTax = halvingTaxable > 0 ? (halvingTaxable * targetBracket.rate - targetBracket.deduction) * 0.5 : 0;
    
    // 实际税额（考虑减半征收）
    const actualTax = taxResult.tax > 0 ? Math.max(0, taxResult.tax - halvingTax) : 0;
    
    // 税前收入 = 应纳税所得额 + 扣除总额
    const preTaxIncome = middleTaxableIncome + deductionData.totalDeduction;
    const netIncome = preTaxIncome - actualTax;
    
    return {
        totalIncome: preTaxIncome,
        minTotalIncome: minTaxableIncome + deductionData.totalDeduction,
        maxTotalIncome: maxTaxableIncome === Infinity ? Infinity : maxTaxableIncome + deductionData.totalDeduction,
        finalTotalTax: actualTax,
        calculatedNetIncome: netIncome,
        taxableIncome: middleTaxableIncome,
        taxableIncomeRange: {
            min: minTaxableIncome,
            max: maxTaxableIncome
        },
        applicableRate: targetBracket.rate,
        applicableDeduction: targetBracket.deduction,
        isRateMode: true,
        modeName: '经营所得税率倒算',
        calculationMode: mode,
        bracketInfo: {
            rate: targetBracket.rate,
            min: minTaxableIncome,
            max: maxTaxableIncome,
            deduction: targetBracket.deduction
        },
        hasHalvingDiscount: halvingTax > 0,
        halvingTaxAmount: halvingTax
    };
}

// 经营所得：应纳税所得额 → 实际税额（含减半优惠）
//
// 政策口径：年应纳税所得额**不超过 200 万元的部分**减半征收 —— 是对「200 万那一段」减半，
//   不是对全额减半：先按同档税率把这 200 万算出税额再打五折，超出部分照征。
//
// 抽出来的直接原因：三条经营所得倒算链原来各抄一份这段，改政策时必须在同一句话里改三遍，
//   漏一处就是「看起来合理但算错」—— 这是典型的复制引起口径漂移。
//
// 遗留（本轮没动，不属于 Phase 2.5 ① 的范围）：结果展示与正向计算的路径里仍有 5 份同形实现
//   （经营所得税率倒算的结果段、两条月度倒算的结果段、经营所得正向计算）。
//   它们用的 guard 写法略有不同（`halvingTaxable > 0` vs `result.tax > 0`、税率取 targetBracket 还是 taxResult），
//   在实际税率结构下等价，但**没有测试证明这一点** —— 要统一得先补一组等价对拍用例，
//   否则「看起来一样」的重构一旦真有差别，是在改用户看到的税额数字。
function businessTaxOf(taxableIncome) {
    const result = calculateBusinessTaxByTaxableIncome(taxableIncome);
    const halvingThreshold = 2000000;
    const halvingTaxable = Math.min(taxableIncome, halvingThreshold);
    const halvingTax = result.tax > 0 ? (halvingTaxable * result.rate - result.deduction) * 0.5 : 0;
    return Math.max(0, result.tax - halvingTax);
}

// 经营所得反向倒算：按目标税后收入倒算，支持三种计算模式
function calculateBusinessFromMonthlyNet(inputData, deductionData, mode = 'balanced') {
    const monthlyNet = inputData.monthlyNet;
    const workMonths = inputData.workMonths;
    const annualNetTarget = monthlyNet * workMonths;
    
    // 步骤1：二分求解基准应纳税所得额（通用求解器 + 判据：经营所得到手还不够）
    const solved = window.EuriskoSolver.solveMonotone({
        lo: deductionData.totalDeduction,
        hi: deductionData.totalDeduction + 10000000,
        increase: function (income) {
            const taxableIncome = income - deductionData.totalDeduction;
            if (taxableIncome <= 0) return true;
            return income - businessTaxOf(taxableIncome) < annualNetTarget;
        }
    });

    const baseTaxableIncome = Math.max(0, solved.value - deductionData.totalDeduction);
    
    // 步骤2：确定基准应纳税所得额所在的税率档位
    let targetBracket = null;
    for (const bracket of businessTaxRates) {
        if (baseTaxableIncome <= bracket.max) {
            targetBracket = bracket;
            break;
        }
    }
    if (!targetBracket) {
        targetBracket = businessTaxRates[businessTaxRates.length - 1];
    }
    
    // 步骤3：根据计算模式确定应纳税所得额
    const minTaxableIncome = targetBracket.min || 0;
    const maxTaxableIncome = targetBracket.max === Infinity ? 10000000 : targetBracket.max;
    
    let modeTaxableIncome;
    const minimumTaxableIncome = minTaxableIncome === 0 ? 30000 : minTaxableIncome + 1;
    
    if (maxTaxableIncome === Infinity) {
        // 最高档位：基于基准应纳税所得额调整
        switch(mode) {
            case 'conservative':
                modeTaxableIncome = minimumTaxableIncome;
                break;
            case 'balanced':
                // 均衡模式：使用二分法算出的基准值
                modeTaxableIncome = baseTaxableIncome;
                break;
            case 'aggressive':
                // 进取模式：确保不低于基准值，且至少比下限高10万
                modeTaxableIncome = Math.max(baseTaxableIncome, minTaxableIncome + 100000);
                break;
            default:
                modeTaxableIncome = baseTaxableIncome;
        }
    } else {
        switch(mode) {
            case 'conservative':
                modeTaxableIncome = minimumTaxableIncome;
                break;
            case 'balanced':
                modeTaxableIncome = baseTaxableIncome;
                break;
            case 'aggressive':
                modeTaxableIncome = maxTaxableIncome;
                break;
            default:
                modeTaxableIncome = baseTaxableIncome;
        }
    }
    
    modeTaxableIncome = Math.max(0, modeTaxableIncome);
    
    // 步骤4：计算对应的收入
    const totalIncome = modeTaxableIncome + deductionData.totalDeduction;
    
    // 步骤5：计算税额
    const taxResult = calculateBusinessTaxByTaxableIncome(modeTaxableIncome);
    const halvingThreshold = 2000000;
    const halvingTaxable = Math.min(modeTaxableIncome, halvingThreshold);
    const halvingTax = taxResult.tax > 0 ? (halvingTaxable * taxResult.rate - taxResult.deduction) * 0.5 : 0;
    const actualTax = Math.max(0, taxResult.tax - halvingTax);
    const calculatedNetIncome = totalIncome - actualTax;
    
    return {
        totalIncome: totalIncome,
        monthlyIncome: totalIncome / workMonths,
        finalTotalTax: actualTax,
        calculatedNetIncome: calculatedNetIncome,
        monthlyNet: calculatedNetIncome / workMonths,
        taxableIncome: modeTaxableIncome,
        applicableRate: taxResult.rate,
        applicableDeduction: taxResult.deduction,
        isMonthlyMode: true,
        modeName: '经营所得月度税后倒算',
        calculationMode: mode,
        bracketInfo: {
            rate: targetBracket.rate,
            min: minTaxableIncome,
            max: maxTaxableIncome,
            deduction: targetBracket.deduction
        },
        hasHalvingDiscount: halvingTax > 0,
        halvingTaxAmount: halvingTax
    };
}

// 经营所得反向倒算：按目标税额倒算，支持三种计算模式
// 注意：税额和到手金额二选一，优先使用税额
function calculateBusinessFromTargetTax(inputData, deductionData, mode = 'balanced') {
    const targetTax = inputData.fixedTax;
    const targetNet = inputData.fixedNet;
    
    if (targetTax >= 0) {
        // 步骤1：二分求解基准应纳税所得额，税额为0时也允许计算
        // （通用求解器 + 判据：经营所得实缴税额还不够；减半优惠在 businessTaxOf 里算）
        const solved = window.EuriskoSolver.solveMonotone({
            lo: deductionData.totalDeduction,
            hi: deductionData.totalDeduction + 10000000,
            increase: function (income) {
                const taxable = income - deductionData.totalDeduction;
                if (taxable <= 0) return true;
                return businessTaxOf(taxable) < targetTax;
            }
        });

        const baseTaxableIncome = Math.max(0, solved.value - deductionData.totalDeduction);
        
        // 步骤2：确定基准应纳税所得额所在的税率档位
        let targetBracket = null;
        for (const bracket of businessTaxRates) {
            if (baseTaxableIncome <= bracket.max) {
                targetBracket = bracket;
                break;
            }
        }
        if (!targetBracket) {
            targetBracket = businessTaxRates[businessTaxRates.length - 1];
        }
        
        // 步骤3：根据计算模式确定应纳税所得额
        const minTaxableIncome = targetBracket.min || 0;
        const maxTaxableIncome = targetBracket.max === Infinity ? 10000000 : targetBracket.max;
        
        let modeTaxableIncome;
        const minimumTaxableIncome = minTaxableIncome === 0 ? 30000 : minTaxableIncome + 1;
        
        if (maxTaxableIncome === Infinity) {
            // 最高档位：基于基准应纳税所得额调整
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = minimumTaxableIncome;
                    break;
                case 'balanced':
                    // 均衡模式：使用二分法算出的基准值
                    modeTaxableIncome = baseTaxableIncome;
                    break;
                case 'aggressive':
                    // 进取模式：确保不低于基准值，且至少比下限高10万
                    modeTaxableIncome = Math.max(baseTaxableIncome, minTaxableIncome + 100000);
                    break;
                default:
                    modeTaxableIncome = baseTaxableIncome;
            }
        } else {
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = minimumTaxableIncome;
                    break;
                case 'balanced':
                    modeTaxableIncome = baseTaxableIncome;
                    break;
                case 'aggressive':
                    modeTaxableIncome = maxTaxableIncome;
                    break;
                default:
                    modeTaxableIncome = baseTaxableIncome;
            }
        }
        
        modeTaxableIncome = Math.max(0, modeTaxableIncome);
        
        // 步骤4：计算对应的收入
        const totalIncome = modeTaxableIncome + deductionData.totalDeduction;
        
        // 步骤5：计算税额
        const taxResult = calculateBusinessTaxByTaxableIncome(modeTaxableIncome);
        const halvingThreshold = 2000000;
        const halvingTaxable = Math.min(modeTaxableIncome, halvingThreshold);
        const halvingTax = taxResult.tax > 0 ? (halvingTaxable * taxResult.rate - taxResult.deduction) * 0.5 : 0;
        const actualTax = Math.max(0, taxResult.tax - halvingTax);
        
        return {
            totalIncome: totalIncome,
            finalTotalTax: actualTax,
            calculatedNetIncome: totalIncome - actualTax,
            taxableIncome: modeTaxableIncome,
            applicableRate: taxResult.rate,
            applicableDeduction: taxResult.deduction,
            isTaxMode: true,
            modeName: '经营所得税额倒算',
            calculationMode: mode,
            bracketInfo: {
                rate: targetBracket.rate,
                min: minTaxableIncome,
                max: maxTaxableIncome,
                deduction: targetBracket.deduction
            },
            targetTax: targetTax,
            taxDifference: actualTax - targetTax,
            hasHalvingDiscount: halvingTax > 0,
            halvingTaxAmount: halvingTax
        };
    }
    
    if (targetNet >= 0) {
        // 到手金额为0时也允许计算
        // （通用求解器 + 判据：经营所得扣除实缴税额后的到手还不够）
        const solved = window.EuriskoSolver.solveMonotone({
            lo: deductionData.totalDeduction,
            hi: deductionData.totalDeduction + 10000000,
            increase: function (income) {
                const taxable = income - deductionData.totalDeduction;
                if (taxable <= 0) return true;
                return income - businessTaxOf(taxable) < targetNet;
            }
        });

        const baseTaxableIncome = Math.max(0, solved.value - deductionData.totalDeduction);
        
        let targetBracket = null;
        for (const bracket of businessTaxRates) {
            if (baseTaxableIncome <= bracket.max) {
                targetBracket = bracket;
                break;
            }
        }
        if (!targetBracket) {
            targetBracket = businessTaxRates[businessTaxRates.length - 1];
        }
        
        const minTaxableIncome = targetBracket.min || 0;
        const maxTaxableIncome = targetBracket.max === Infinity ? 10000000 : targetBracket.max;
        
        let modeTaxableIncome;
        const minimumTaxableIncome = minTaxableIncome === 0 ? 30000 : minTaxableIncome + 1;
        
        if (maxTaxableIncome === Infinity) {
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = minimumTaxableIncome;
                    break;
                case 'balanced':
                    modeTaxableIncome = baseTaxableIncome;
                    break;
                case 'aggressive':
                    modeTaxableIncome = Math.max(baseTaxableIncome, minTaxableIncome + 100000);
                    break;
                default:
                    modeTaxableIncome = baseTaxableIncome;
            }
        } else {
            switch(mode) {
                case 'conservative':
                    modeTaxableIncome = minimumTaxableIncome;
                    break;
                case 'balanced':
                    modeTaxableIncome = baseTaxableIncome;
                    break;
                case 'aggressive':
                    modeTaxableIncome = maxTaxableIncome;
                    break;
                default:
                    modeTaxableIncome = baseTaxableIncome;
            }
        }
        
        modeTaxableIncome = Math.max(0, modeTaxableIncome);
        
        const totalIncome = modeTaxableIncome + deductionData.totalDeduction;
        
        const taxResult = calculateBusinessTaxByTaxableIncome(modeTaxableIncome);
        const halvingThreshold = 2000000;
        const halvingTaxable = Math.min(modeTaxableIncome, halvingThreshold);
        const halvingTax = taxResult.tax > 0 ? (halvingTaxable * taxResult.rate - taxResult.deduction) * 0.5 : 0;
        const actualTax = Math.max(0, taxResult.tax - halvingTax);
        
        return {
            totalIncome: totalIncome,
            finalTotalTax: actualTax,
            calculatedNetIncome: totalIncome - actualTax,
            taxableIncome: modeTaxableIncome,
            applicableRate: taxResult.rate,
            applicableDeduction: taxResult.deduction,
            isTaxMode: true,
            modeName: '经营所得到手金额倒算',
            calculationMode: mode,
            bracketInfo: {
                rate: targetBracket.rate,
                min: minTaxableIncome,
                max: maxTaxableIncome,
                deduction: targetBracket.deduction
            },
            targetNet: targetNet,
            taxDifference: (totalIncome - actualTax) - targetNet,
            hasHalvingDiscount: halvingTax > 0,
            halvingTaxAmount: halvingTax
        };
    }
}

// 计算经营所得
// 阶段17 17B-1：经营所得的**纯内核**（values → 结果）。
// 为什么要抽：spec 驱动的向导需要一个「输入对象 → 结果」的纯函数，而原实现是
// 「读 23 个 DOM → 算 → 写全局 + 写 DOM」。若不抽而照抄一份算法，经营所得就会多出
// 第 6 份同形实现（此前减半优惠公式已有 5 份）—— 那正是口径漂移的源头。
// 页面版与向导版从此共用这一份，并由 tests/business-migration.test.js 逐点对拍。
function calculateBusinessTaxCore(v) {
    const businessIncome = Number(v.income) || 0;
    const businessCost = Number(v.cost) || 0;
    const businessExpenses = Number(v.expenses) || 0;
    const businessTaxes = Number(v.taxes) || 0;
    const businessLosses = Number(v.losses) || 0;
    const businessOtherExpenses = Number(v.otherExpenses) || 0;
    const businessPreviousLosses = Number(v.previousLosses) || 0;
    const hasComprehensiveIncome = v.hasComprehensiveIncome !== false && !!v.hasComprehensiveIncome;
    const workMonths = parseInt(v.workMonths, 10) || 12;

    // 专项扣除（社保/公积金）- 月度金额，需乘以工作月数转换为年度
    const monthlyPensionInsurance = Number(v.pensionInsurance) || 0;
    const monthlyMedicalInsurance = Number(v.medicalInsurance) || 0;
    const monthlyUnemploymentInsurance = Number(v.unemploymentInsurance) || 0;
    const monthlyHousingFund = Number(v.housingFund) || 0;
    const pensionInsurance = monthlyPensionInsurance * workMonths;
    const medicalInsurance = monthlyMedicalInsurance * workMonths;
    const unemploymentInsurance = monthlyUnemploymentInsurance * workMonths;
    const housingFund = monthlyHousingFund * workMonths;
    const specialDeductionTotal = pensionInsurance + medicalInsurance + unemploymentInsurance + housingFund;

    // 专项附加扣除明细
    const childrenInfantDeduction = Number(v.childrenInfantDeduction) || 0;
    const elderlyDeduction = Number(v.elderlyDeduction) || 0;
    const housingDeduction = Number(v.housingDeduction) || 0;
    const educationDeduction = Number(v.educationDeduction) || 0;
    const medicalDeduction = Number(v.medicalDeduction) || 0;
    const actualMedicalDeduction = medicalDeduction > 15000 ? Math.min(medicalDeduction - 15000, 80000) : 0;
    const specialAdditionalDeductionTotal = childrenInfantDeduction + elderlyDeduction + housingDeduction + educationDeduction + actualMedicalDeduction;

    // 其他扣除明细
    const pensionDeduction = Number(v.pensionDeduction) || 0;
    const enterpriseAnnuity = Number(v.enterpriseAnnuity) || 0;
    const insuranceDeduction = Number(v.insuranceDeduction) || 0;
    const charitableDonation = Number(v.charitableDonation) || 0;
    const otherDeductionTotalBeforeDonation = pensionDeduction + enterpriseAnnuity + insuranceDeduction;

    const prepaidTax = Number(v.prepaidTax) || 0;

    // 计算经营利润
    const businessProfit = Math.max(0, businessIncome - businessCost - businessExpenses -
        businessTaxes - businessLosses - businessOtherExpenses);

    // 扣除以前年度亏损
    const netIncomeAfterLoss = Math.max(0, businessProfit - businessPreviousLosses);

    // 计算投资者减除费用（5000元/月，按实际工作月数计算）
    const investorDeduction = hasComprehensiveIncome ? 0 : 5000 * workMonths;

    // 计算公益性捐赠前的应纳税所得额
    const taxableIncomeBeforeDonation = Math.max(0, netIncomeAfterLoss - investorDeduction -
        (hasComprehensiveIncome ? 0 : specialDeductionTotal) - specialAdditionalDeductionTotal - otherDeductionTotalBeforeDonation);

    // 公益性捐赠扣除限额为应纳税所得额的30%
    const charitableDonationLimit = taxableIncomeBeforeDonation * 0.3;
    const actualCharitableDonation = Math.min(charitableDonation, charitableDonationLimit);
    const otherDeductionTotal = otherDeductionTotalBeforeDonation + actualCharitableDonation;

    // 计算应纳税所得额
    const taxableIncome = Math.max(0, taxableIncomeBeforeDonation - actualCharitableDonation);

    // 计算应纳税额（未减半）
    let totalTaxBeforeHalving = 0;
    let applicableRate = 0;
    let applicableDeduction = 0;

    for (const bracket of businessTaxRates) {
        if (taxableIncome <= bracket.max) {
            totalTaxBeforeHalving = taxableIncome * bracket.rate - bracket.deduction;
            applicableRate = bracket.rate;
            applicableDeduction = bracket.deduction;
            break;
        }
    }

    // 计算减半征收减免税额（年应纳税所得额不超过200万元的部分减半征收）
    const halvingThreshold = 2000000;
    const halvingTaxable = Math.min(taxableIncome, halvingThreshold);
    const taxReduction = totalTaxBeforeHalving > 0 ? (halvingTaxable * applicableRate - applicableDeduction) * 0.5 : 0;

    // 计算实际应纳税额
    const totalTax = Math.max(0, totalTaxBeforeHalving - taxReduction);

    // 计算应退/应补税额
    const refundTax = totalTax - prepaidTax;

    // 计算税后经营所得
    const netIncomeAfterTax = netIncomeAfterLoss - totalTax;

    // 计算可扣除的专项扣除（无综合所得时才允许扣除）
    const deductibleSpecialDeduction = hasComprehensiveIncome ? 0 : specialDeductionTotal;

    // 计算总扣除额
    const totalDeduction = investorDeduction + deductibleSpecialDeduction + specialAdditionalDeductionTotal + otherDeductionTotal;

    return {
        incomeDetails: {
            businessIncome,
            businessCost,
            businessExpenses,
            businessTaxes,
            businessLosses,
            businessOtherExpenses,
            businessPreviousLosses,
            businessProfit
        },
        deductionDetails: {
            hasComprehensiveIncome,
            investorDeduction,
            specialDeduction: {
                pensionInsurance,
                medicalInsurance,
                unemploymentInsurance,
                housingFund,
                total: specialDeductionTotal,
                deductible: deductibleSpecialDeduction
            },
            specialAdditionalDeduction: {
                childrenInfant: childrenInfantDeduction,
                elderly: elderlyDeduction,
                housing: housingDeduction,
                education: educationDeduction,
                medical: medicalDeduction,
                actualMedical: actualMedicalDeduction,
                total: specialAdditionalDeductionTotal
            },
            otherDeduction: {
                pension: pensionDeduction,
                enterpriseAnnuity,
                insurance: insuranceDeduction,
                charitableDonation,
                actualCharitableDonation,
                charitableDonationLimit,
                total: otherDeductionTotal
            },
            total: totalDeduction
        },
        taxDetails: {
            netIncome: netIncomeAfterLoss,
            taxableIncome,
            applicableRate,
            applicableDeduction,
            totalTaxBeforeHalving,
            taxReduction,
            totalTax,
            prepaidTax,
            refundTax,
            netIncomeAfterTax
        },
        calculationDate: new Date().toISOString()
    };
}


// 保存经营所得计算结果到历史记录
// 通用保存到历史记录
function saveToHistory(results, type, titlePrefix) {
    if (!results || Object.keys(results).length === 0) {
        showAlert('请先完成计算后再保存');
        return false;
    }
    try {
        const savedData = {
            id: Date.now().toString(),
            type: type,
            title: titlePrefix + ' - ' + new Date().toLocaleDateString(),
            results: results,
            date: new Date().toISOString(),
            updatedAt: new Date().toISOString()  // 阶段10：云同步冲突判定时间戳（旧数据缺省时回退 date）
        };
        calculationHistory.unshift(savedData);
        if (calculationHistory.length > 50) {
            calculationHistory = calculationHistory.slice(0, 50);
        }
        localStorage.setItem('taxCalculationHistory', JSON.stringify(calculationHistory));
        // 阶段8：匿名埋点信号（仅计算类型，不含任何输入数据），由 index.html 监听器统一上报
        try {
            if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
                document.dispatchEvent(new CustomEvent('euriskotax:calc-saved', { detail: { type } }));
            }
        } catch (e) { /* 埋点失败静默 */ }
        // 阶段10：通知云同步引擎（登录+PRO 时自动上传本端增量）
        try {
            if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
                document.dispatchEvent(new CustomEvent('euriskotax:history-mutated', { detail: { at: Date.now() } }));
            }
        } catch (e) { /* 同步信号失败静默 */ }
        showSaveSuccessMessage();
        return true;
    } catch (error) {
        console.error('保存计算结果失败:', error);
        showSaveErrorMessage();
        return false;
    }
}

// 保存分类所得计算结果到历史记录
function saveClassificationCalculation() {
    saveToHistory(classificationCalculationResults, 'classification', '分类所得计税');
}


// 分类所得类型名称（阶段17 17B-4）
// 原先有两份：helper-functions.js（页面列表用）与 utils.js（推导链标题用）。17B 迁移时若各留一份，
// 「同一个所得类型、两处名称不一致」迟早出现 —— 界面写「利息、股息、红利所得」、导出写「利息所得」。
// 统一到内核这一个常量，页面版 / 推导链 / spec 三处都读它。
var CLASSIFICATION_TYPE_NAMES = {
    interest: '利息、股息、红利所得',
    rent: '财产租赁所得',
    transfer: '财产转让所得',
    accidental: '偶然所得'
};

// 计算单个分类所得条目
function calculateSingleClassificationTax(type, income, deduction = 0) {
    const taxRate = classificationTaxRates[type]?.rate || 0.20;
    let taxableIncome = 0;
    
    if (type === 'interest' || type === 'accidental') {
        taxableIncome = income;
    } else if (type === 'rent') {
        taxableIncome = income <= 4000 
            ? Math.max(0, income - 800 - deduction)
            : Math.max(0, income * 0.8 - deduction);
    } else if (type === 'transfer') {
        taxableIncome = Math.max(0, income - deduction);
    }
    
    const totalTax = taxableIncome * taxRate;
    
    return {
        type: type,
        typeName: CLASSIFICATION_TYPE_NAMES[type] || '分类所得',
        income: income,
        deduction: deduction,
        taxableIncome: taxableIncome,
        totalTax: totalTax,
        taxRate: taxRate
    };
}

// 计算分类所得税汇总
function calculateClassificationTaxTotal(items) {
    let totalIncome = 0;
    let totalTaxableIncome = 0;
    let totalTax = 0;
    
    items.forEach(item => {
        totalIncome += item.income;
        totalTaxableIncome += item.taxableIncome;
        totalTax += item.totalTax;
    });
    
    classificationCalculationResults = {
        items: [...items],
        totalIncome: totalIncome,
        totalTaxableIncome: totalTaxableIncome,
        totalTax: totalTax,
        calculationDate: new Date().toISOString()
    };
    
    return classificationCalculationResults;
}
