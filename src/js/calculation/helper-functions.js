

// 社保缴费基数最低标准（根据国家规定，各城市略有不同，这里使用全国平均值）
const MIN_SOCIAL_SECURITY_BASE = 4250;
const MIN_HOUSING_FUND_BASE = 4250;

// 验证社保缴费基数是否低于最低标准
function validateSocialSecurityBase(prefix = '') {
    const elementId = prefix ? `${prefix}-social-security-base` : 'social-security-base';
    const warningId = prefix ? `${prefix}-social-security-base-warning` : 'social-security-base-warning';
    
    const base = parseFloat(document.getElementById(elementId).value) || 0;
    const warningElement = document.getElementById(warningId);
    
    if (base > 0 && base < MIN_SOCIAL_SECURITY_BASE) {
        warningElement.textContent = `⚠️ 当前基数低于最低标准 ${MIN_SOCIAL_SECURITY_BASE} 元/月`;
        warningElement.classList.remove('hidden');
    } else {
        warningElement.textContent = '';
        warningElement.classList.add('hidden');
    }
}

// 验证住房公积金基数是否低于最低标准
function validateHousingFundBase(prefix = '') {
    const elementId = prefix ? `${prefix}-housing-fund-base` : 'housing-fund-base';
    const warningId = prefix ? `${prefix}-housing-fund-base-warning` : 'housing-fund-base-warning';
    
    const base = parseFloat(document.getElementById(elementId).value) || 0;
    const warningElement = document.getElementById(warningId);
    
    if (base > 0 && base < MIN_HOUSING_FUND_BASE) {
        warningElement.textContent = `⚠️ 当前基数低于最低标准 ${MIN_HOUSING_FUND_BASE} 元/月`;
        warningElement.classList.remove('hidden');
    } else {
        warningElement.textContent = '';
        warningElement.classList.add('hidden');
    }
}

// 计算社保费用（养老保险、医疗保险、失业保险）
function calculateSocialSecurity() {
    let base = parseFloat(document.getElementById('social-security-base').value) || 0;
    const pensionRate = parseFloat(document.getElementById('pension-rate').value) || 0;
    const medicalRate = parseFloat(document.getElementById('medical-rate').value) || 0;
    const unemploymentRate = parseFloat(document.getElementById('unemployment-rate').value) || 0;
    
    // 计算各项保险费用
    const pensionAmount = base * (pensionRate / 100);
    const medicalAmount = base * (medicalRate / 100);
    const unemploymentAmount = base * (unemploymentRate / 100);
    
    // 更新输入字段
    document.getElementById('pension-insurance').value = pensionAmount.toFixed(2);
    document.getElementById('medical-insurance').value = medicalAmount.toFixed(2);
    document.getElementById('unemployment-insurance').value = unemploymentAmount.toFixed(2);
}

// 计算住房公积金
function calculateHousingFund() {
    let housingFundBase = parseFloat(document.getElementById('housing-fund-base').value) || 0;
    const housingFundRate = parseFloat(document.getElementById('housing-fund-rate').value) || 0;
    
    // 计算住房公积金费用
    const housingFundAmount = housingFundBase * (housingFundRate / 100);
    
    // 更新输入字段
    document.getElementById('housing-fund').value = housingFundAmount.toFixed(2);
}

// 根据社保基数和保险金额计算缴费比例
function calculateSocialSecurityRate(type) {
    let base, amount, rateField;
    
    switch (type) {
        case 'pension':
        case 'medical':
        case 'unemployment':
            base = parseFloat(document.getElementById('social-security-base').value) || 0;
            break;
        case 'housing':
            base = parseFloat(document.getElementById('housing-fund-base').value) || 0;
            break;
        default:
            return;
    }
    
    if (base === 0) return;
    
    switch (type) {
        case 'pension':
            amount = parseFloat(document.getElementById('pension-insurance').value) || 0;
            rateField = 'pension-rate';
            break;
        case 'medical':
            amount = parseFloat(document.getElementById('medical-insurance').value) || 0;
            rateField = 'medical-rate';
            break;
        case 'unemployment':
            amount = parseFloat(document.getElementById('unemployment-insurance').value) || 0;
            rateField = 'unemployment-rate';
            break;
        case 'housing':
            amount = parseFloat(document.getElementById('housing-fund').value) || 0;
            rateField = 'housing-fund-rate';
            break;
        default:
            return;
    }
    
    const rate = (amount / base) * 100;
    // 对于住房公积金，只允许5%或7%
    if (type === 'housing') {
        if (rate < 6) {
            document.getElementById(rateField).value = 5;
        } else {
            document.getElementById(rateField).value = 7;
        }
    } else {
        document.getElementById(rateField).value = rate.toFixed(1);
    }
}

// 反向倒算页面的社保缴费计算（养老保险、医疗保险、失业保险）
function calculateReverseSocialSecurity() {
    let base = parseFloat(document.getElementById('reverse-social-security-base').value) || 0;
    const pensionRate = parseFloat(document.getElementById('reverse-pension-rate').value) || 0;
    const medicalRate = parseFloat(document.getElementById('reverse-medical-rate').value) || 0;
    const unemploymentRate = parseFloat(document.getElementById('reverse-unemployment-rate').value) || 0;
    
    // 计算各项保险费用（月度值）
    const pensionAmount = base * (pensionRate / 100);
    const medicalAmount = base * (medicalRate / 100);
    const unemploymentAmount = base * (unemploymentRate / 100);
    
    // 更新输入字段
    document.getElementById('reverse-pension-insurance').value = pensionAmount.toFixed(2);
    document.getElementById('reverse-medical-insurance').value = medicalAmount.toFixed(2);
    document.getElementById('reverse-unemployment-insurance').value = unemploymentAmount.toFixed(2);
    
    // 更新反向倒算扣除项计算
    updateReverseDeductionCalculation();
}

// 反向倒算页面的住房公积金计算
function calculateReverseHousingFund() {
    let housingFundBase = parseFloat(document.getElementById('reverse-housing-fund-base').value) || 0;
    const housingFundRate = parseFloat(document.getElementById('reverse-housing-fund-rate').value) || 0;
    
    // 计算住房公积金费用（月度值）
    const housingFundAmount = housingFundBase * (housingFundRate / 100);
    
    // 更新输入字段
    document.getElementById('reverse-housing-fund').value = housingFundAmount.toFixed(2);
    
    // 更新反向倒算扣除项计算
    updateReverseDeductionCalculation();
}

// 反向倒算页面根据社保基数和保险金额计算缴费比例
function calculateReverseSocialSecurityRate(type) {
    let base, amount, rateField;
    
    switch (type) {
        case 'pension':
        case 'medical':
        case 'unemployment':
            base = parseFloat(document.getElementById('reverse-social-security-base').value) || 0;
            break;
        case 'housing':
            base = parseFloat(document.getElementById('reverse-housing-fund-base').value) || 0;
            break;
        default:
            return;
    }
    
    if (base === 0) return;
    
    switch (type) {
        case 'pension':
            amount = parseFloat(document.getElementById('reverse-pension-insurance').value) || 0;
            rateField = 'reverse-pension-rate';
            break;
        case 'medical':
            amount = parseFloat(document.getElementById('reverse-medical-insurance').value) || 0;
            rateField = 'reverse-medical-rate';
            break;
        case 'unemployment':
            amount = parseFloat(document.getElementById('reverse-unemployment-insurance').value) || 0;
            rateField = 'reverse-unemployment-rate';
            break;
        case 'housing':
            amount = parseFloat(document.getElementById('reverse-housing-fund').value) || 0;
            rateField = 'reverse-housing-fund-rate';
            break;
        default:
            return;
    }
    
    // 计算费率（直接使用月度金额计算）
    const rate = (amount / base) * 100;
    
    // 对于住房公积金，只允许5%或7%
    if (type === 'housing') {
        if (rate < 6) {
            document.getElementById(rateField).value = 5;
        } else {
            document.getElementById(rateField).value = 7;
        }
    } else {
        document.getElementById(rateField).value = rate.toFixed(1);
    }
    
    // 注意：这里不调用calculateReverseSocialSecurity，避免循环计算
    // 更新反向倒算扣除项计算
    updateReverseDeductionCalculation();
}

// 更新收入计算
function updateIncomeCalculation() {
    const workMonths = parseInt(document.getElementById('work-months').value) || 12;
    
    const monthlySalaryIncome = parseFloat(document.getElementById('salary-income').value) || 0;
    const annualLaborIncome = parseFloat(document.getElementById('labor-income').value) || 0;
    const annualAuthorIncome = parseFloat(document.getElementById('author-income').value) || 0;
    const annualRoyaltyIncome = parseFloat(document.getElementById('royalty-income').value) || 0;
    const bonusIncome = parseFloat(document.getElementById('bonus-income').value) || 0;
    const bonusInclude = document.getElementById('bonus-include').checked;
    
    // 使用统一函数计算其他收入
    const otherIncome = calculateOtherIncome(annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome);
    
    // 计算月度综合所得收入额合计（用于显示）
    const monthlyLaborIncomeCalculated = otherIncome.laborTaxableIncome / workMonths;
    const monthlyAuthorIncomeCalculated = otherIncome.authorTaxableIncome / workMonths;
    const monthlyRoyaltyIncomeCalculated = otherIncome.royaltyTaxableIncome / workMonths;
    
    // 计算年度综合所得收入额合计（根据工作月数调整）
    let totalIncomeAmount = monthlySalaryIncome * workMonths + otherIncome.laborTaxableIncome + 
        otherIncome.authorTaxableIncome + otherIncome.royaltyTaxableIncome;
    if (bonusInclude) {
        totalIncomeAmount += bonusIncome;
    }
    
    // 计算税前收入合计（所有收入的总和）
    const preTaxIncomeAmount = monthlySalaryIncome * workMonths + annualLaborIncome + 
        annualAuthorIncome + annualRoyaltyIncome + bonusIncome;
    
    // 更新显示
    document.getElementById('labor-income-calculated').textContent = otherIncome.laborTaxableIncome.toFixed(2);
    document.getElementById('author-income-calculated').textContent = otherIncome.authorTaxableIncome.toFixed(2);
    document.getElementById('royalty-income-calculated').textContent = otherIncome.royaltyTaxableIncome.toFixed(2);
    document.getElementById('monthly-income-amount').textContent = monthlySalaryIncome.toFixed(2);
    document.getElementById('total-income-amount').textContent = totalIncomeAmount.toFixed(2);
    document.getElementById('pre-tax-income-amount').textContent = preTaxIncomeAmount.toFixed(2);
    
    // 更新预览数据
    updatePreviewData();
}

// 更新扣除项计算
function updateDeductionCalculation() {
    // 获取工作月数
    const workMonths = parseInt(document.getElementById('work-months').value) || 12;
    
    const basicDeduction = parseFloat(document.getElementById('basic-deduction').value) || 0;
    
    // 检查各扣除项是否显示
    const isSpecialDeductionVisible = !document.getElementById('special-deduction-content').classList.contains('hidden');
    const isSpecialAdditionalDeductionVisible = !document.getElementById('special-additional-deduction-content').classList.contains('hidden');
    const isOtherDeductionVisible = !document.getElementById('other-deduction-content').classList.contains('hidden');
    
    // 获取各扣除项值，只有当对应的部分显示时才计算
    const pensionInsurance = isSpecialDeductionVisible ? (parseFloat(document.getElementById('pension-insurance').value) || 0) : 0;
    const medicalInsurance = isSpecialDeductionVisible ? (parseFloat(document.getElementById('medical-insurance').value) || 0) : 0;
    const unemploymentInsurance = isSpecialDeductionVisible ? (parseFloat(document.getElementById('unemployment-insurance').value) || 0) : 0;
    const housingFund = isSpecialDeductionVisible ? (parseFloat(document.getElementById('housing-fund').value) || 0) : 0;
    const insuranceDeduction = pensionInsurance + medicalInsurance + unemploymentInsurance + housingFund;
    
    // 专项附加扣除
    let elderlyDeduction = 0;
    let childrenInfantDeduction = 0;
    let rentDeduction = 0;
    let housingLoanDeduction = 0;
    let annualEducationDeduction = 0;
    let annualProfessionalDeduction = 0;
    let medicalDeduction = 0;
    
    if (isSpecialAdditionalDeductionVisible) {
        elderlyDeduction = parseFloat(document.getElementById('elderly-deduction').value) || 0;
        childrenInfantDeduction = parseFloat(document.getElementById('children-infant-deduction').value) || 0;
        
        // 住房扣除（二选一）
        const housingType = document.getElementById('housing-type').value;
        // 重置两种住房扣除为0，确保只计算一种
        rentDeduction = 0;
        housingLoanDeduction = 0;
        if (housingType === 'rent') {
            rentDeduction = parseFloat(document.getElementById('rent-deduction').value) || 0;
        } else if (housingType === 'loan') {
            housingLoanDeduction = parseFloat(document.getElementById('housing-loan-deduction').value) || 0;
        }
        
        annualEducationDeduction = parseFloat(document.getElementById('education-deduction').value) || 0;
        // 检查职业资格扣除
        if (document.getElementById('education-professional-checkbox') && document.getElementById('education-professional-checkbox').checked) {
            annualProfessionalDeduction = 3600; // 职业资格3600元/年
        }
        medicalDeduction = parseFloat(document.getElementById('medical-deduction').value) || 0;
    }
    
    // 其他扣除
    const isPensionDeductionChecked = isOtherDeductionVisible && document.getElementById('pension-deduction-checkbox').checked;
    const pensionDeduction = isPensionDeductionChecked ? (parseFloat(document.getElementById('pension-deduction').value) || 0) : 0;
    // 企业年金：用户手动输入
    const isEnterpriseAnnuityChecked = isOtherDeductionVisible && document.getElementById('enterprise-annuity-checkbox').checked;
    const enterpriseAnnuity = isEnterpriseAnnuityChecked ? (parseFloat(document.getElementById('enterprise-annuity').value) || 0) : 0;
    const isInsuranceOtherDeductionChecked = isOtherDeductionVisible && document.getElementById('insurance-other-deduction-checkbox').checked;
    const insuranceOtherDeduction = isInsuranceOtherDeductionChecked ? (parseFloat(document.getElementById('insurance-other-deduction').value) || 0) : 0;
    const isTaxDeferredPensionChecked = isOtherDeductionVisible && document.getElementById('tax-deferred-pension-checkbox').checked;
    const taxDeferredPension = isTaxDeferredPensionChecked ? (parseFloat(document.getElementById('tax-deferred-pension').value) || 0) : 0;
    const isCharitableDonationChecked = isOtherDeductionVisible && document.getElementById('charitable-donation-checkbox').checked;
    const charitableDonation = isCharitableDonationChecked ? (parseFloat(document.getElementById('charitable-donation').value) || 0) : 0;
    
    // 计算年度大病医疗实际可扣除额
    const actualMedicalDeduction = medicalDeduction > 15000 ? Math.min(medicalDeduction - 15000, 80000) : 0;
    
    // 更新大病医疗实际可扣除额显示
    if (isSpecialAdditionalDeductionVisible) {
        document.getElementById('actual-medical-deduction-display').textContent = `实际可扣除额：${actualMedicalDeduction.toFixed(2)} 元`;
    } else {
        document.getElementById('actual-medical-deduction-display').textContent = '实际可扣除额：0 元';
    }
    
    // 计算月度专项附加扣除合计（包含学历教育，不包含职业资格和大病医疗）
    // 学历教育扣除：从annualEducationDeduction中减去职业资格的3600元，只保留学历教育的金额
    const educationDegreeAmount = annualEducationDeduction - (annualProfessionalDeduction || 0);
    const monthlyEducationDeduction = educationDegreeAmount / workMonths;
    const monthlySpecialAdditionalTotal = elderlyDeduction + childrenInfantDeduction + rentDeduction + 
        housingLoanDeduction + monthlyEducationDeduction;
    
    // 计算月度其他扣除合计
    const monthlyOtherDeductionTotal = pensionDeduction + enterpriseAnnuity + insuranceOtherDeduction + taxDeferredPension;
    
    // 计算年度其他扣除合计（根据工作月数调整）
    const annualOtherDeductionTotal = monthlyOtherDeductionTotal * workMonths + charitableDonation;
    
    // 计算月度扣除总额合计
    const monthlyDeductionTotal = basicDeduction + insuranceDeduction + monthlySpecialAdditionalTotal + monthlyOtherDeductionTotal;
    
    // 计算年度专项附加扣除合计 = 月度专项附加扣除合计 * 工作月数 + 职业资格 + 大病医疗
    const annualSpecialAdditionalTotal = monthlySpecialAdditionalTotal * workMonths + annualProfessionalDeduction + actualMedicalDeduction;
    
    // 年度其他扣除合计已经在前面计算过，包含了公益捐赠支出
    
    // 计算年度专项扣除合计（根据工作月数调整）
    const annualSpecialDeductionTotal = insuranceDeduction * workMonths;
    
    // 计算年度扣除总额合计（根据工作月数调整）
    const annualDeductionTotal = basicDeduction * workMonths + annualSpecialDeductionTotal + annualSpecialAdditionalTotal + annualOtherDeductionTotal;
    
    // 更新显示
    document.getElementById('monthly-special-deduction-total').textContent = insuranceDeduction.toFixed(2);
    document.getElementById('monthly-special-additional-total').textContent = monthlySpecialAdditionalTotal.toFixed(2);
    document.getElementById('monthly-other-deduction-total').textContent = monthlyOtherDeductionTotal.toFixed(2);
    document.getElementById('annual-special-deduction-total').textContent = annualSpecialDeductionTotal.toFixed(2);
    document.getElementById('annual-special-additional-total').textContent = annualSpecialAdditionalTotal.toFixed(2);
    document.getElementById('annual-other-deduction-total').textContent = annualOtherDeductionTotal.toFixed(2);
    document.getElementById('monthly-deduction-amount').textContent = monthlyDeductionTotal.toFixed(2);
    document.getElementById('total-deduction-amount').textContent = annualDeductionTotal.toFixed(2);
    
    // 更新预览数据
    updatePreviewData();
}

// 更新反向倒算扣除项计算
function updateReverseDeductionCalculation() {
    // 获取工作月数
    const workMonths = parseInt(document.getElementById('reverse-work-months').value) || 12;
    
    // 基本减除费用（每月5000元，根据工作月数调整）
    const basicDeduction = 5000 * workMonths;
    // 更新基本减除费用输入字段
    document.getElementById('reverse-basic-deduction').value = basicDeduction;
    
    // 检查各扣除项是否显示
    const isSpecialDeductionVisible = document.getElementById('reverse-special-deduction-checkbox').checked;
    const isSpecialAdditionalDeductionVisible = document.getElementById('reverse-special-additional-deduction-checkbox').checked;
    const isOtherDeductionVisible = document.getElementById('reverse-other-deduction-checkbox').checked;
    
    // 计算专项扣除（与综合所得计税逻辑一致）
    let specialDeduction = 0;
    if (isSpecialDeductionVisible) {
        const monthlyPensionInsurance = parseFloat(document.getElementById('reverse-pension-insurance').value) || 0;
        const monthlyMedicalInsurance = parseFloat(document.getElementById('reverse-medical-insurance').value) || 0;
        const monthlyUnemploymentInsurance = parseFloat(document.getElementById('reverse-unemployment-insurance').value) || 0;
        const monthlyHousingFund = parseFloat(document.getElementById('reverse-housing-fund').value) || 0;
        specialDeduction = monthlyPensionInsurance + monthlyMedicalInsurance + monthlyUnemploymentInsurance + monthlyHousingFund;
    }
    
    // 计算专项附加扣除（与综合所得计税逻辑一致）
    let specialAdditionalDeduction = 0;
    let actualMedicalDeduction = 0;
    let annualProfessionalDeduction = 0;
    if (isSpecialAdditionalDeductionVisible) {
        const monthlyChildrenInfantDeduction = parseFloat(document.getElementById('reverse-children-infant-deduction').value) || 0;
        const monthlyElderlyDeduction = parseFloat(document.getElementById('reverse-elderly-deduction').value) || 0;
        
        // 住房扣除（二选一）
        let monthlyHousingDeduction = 0;
        const housingType = document.getElementById('reverse-housing-type').value;
        if (housingType === 'rent') {
            monthlyHousingDeduction = parseFloat(document.getElementById('reverse-rent-deduction').value) || 0;
        } else if (housingType === 'loan') {
            monthlyHousingDeduction = parseFloat(document.getElementById('reverse-housing-loan-deduction').value) || 0;
        }
        
        const annualEducationDeduction = parseFloat(document.getElementById('reverse-education-deduction').value) || 0;
        
        // 计算大病医疗实际可扣除额（大病医疗是年度金额）
        const medicalDeduction = parseFloat(document.getElementById('reverse-medical-deduction').value) || 0;
        actualMedicalDeduction = medicalDeduction > 15000 ? Math.min(medicalDeduction - 15000, 80000) : 0;
        
        // 检查职业资格扣除
        if (document.getElementById('reverse-education-professional-checkbox') && document.getElementById('reverse-education-professional-checkbox').checked) {
            annualProfessionalDeduction = 3600; // 职业资格3600元/年
        }
        
        // 更新大病医疗实际可扣除额显示
        document.getElementById('reverse-actual-medical-deduction-display').textContent = `实际可扣除额：${actualMedicalDeduction.toFixed(2)} 元`;
        
        // 计算月度专项附加扣除合计（包含学历教育，不包含职业资格和大病医疗）
        // 学历教育扣除：从annualEducationDeduction中减去职业资格的3600元，只保留学历教育的金额
        const educationDegreeAmount = annualEducationDeduction - (annualProfessionalDeduction || 0);
        const monthlyEducationDeduction = educationDegreeAmount / workMonths;
        specialAdditionalDeduction = monthlyChildrenInfantDeduction + monthlyElderlyDeduction + monthlyHousingDeduction + monthlyEducationDeduction;
    } else {
        document.getElementById('reverse-actual-medical-deduction-display').textContent = '实际可扣除额：0 元';
    }
    
    // 计算其他扣除（与综合所得计税逻辑一致）
    let otherDeduction = 0;
    const isPensionDeductionChecked = isOtherDeductionVisible && document.getElementById('reverse-pension-deduction-checkbox').checked;
    const monthlyPensionDeduction = isPensionDeductionChecked ? (parseFloat(document.getElementById('reverse-pension-deduction').value) || 0) : 0;
    // 企业年金：个人月工资的5%（反向倒算时根据计算出的月度收入）
    let monthlyEnterpriseAnnuity = 0;
    const isEnterpriseAnnuityChecked = isOtherDeductionVisible && document.getElementById('reverse-enterprise-annuity-checkbox').checked;
    if (isEnterpriseAnnuityChecked) {
        monthlyEnterpriseAnnuity = parseFloat(document.getElementById('reverse-enterprise-annuity').value) || 0;
    }
    const isInsuranceOtherDeductionChecked = isOtherDeductionVisible && document.getElementById('reverse-insurance-other-deduction-checkbox').checked;
    const monthlyInsuranceOtherDeduction = isInsuranceOtherDeductionChecked ? (parseFloat(document.getElementById('reverse-insurance-other-deduction').value) || 0) : 0;
    const isTaxDeferredPensionChecked = isOtherDeductionVisible && document.getElementById('reverse-tax-deferred-pension-checkbox').checked;
    const monthlyTaxDeferredPension = isTaxDeferredPensionChecked ? (parseFloat(document.getElementById('reverse-tax-deferred-pension').value) || 0) : 0;
    // 与综合所得计税一致，计算月度其他扣除合计
    otherDeduction = monthlyPensionDeduction + monthlyEnterpriseAnnuity + monthlyInsuranceOtherDeduction + monthlyTaxDeferredPension;
    
    // 计算年度扣除合计（与综合所得计税逻辑一致）
    let annualSpecialDeductionTotal = specialDeduction * workMonths;
    
    // 计算年度专项附加扣除合计
    let annualSpecialAdditionalDeductionTotal = specialAdditionalDeduction * workMonths + annualProfessionalDeduction + actualMedicalDeduction;
    
    // 计算年度其他扣除合计
    const isCharitableDonationChecked = isOtherDeductionVisible && document.getElementById('reverse-charitable-donation-checkbox').checked;
    const annualCharitableDonation = isCharitableDonationChecked ? (parseFloat(document.getElementById('reverse-charitable-donation').value) || 0) : 0;
    let annualOtherDeductionTotal = otherDeduction * workMonths + annualCharitableDonation;
    
    // 计算月度合计（与综合所得计税逻辑一致）
    // 月度专项扣除合计 = 养老保险 + 医疗保险 + 失业保险 + 住房公积金
    const monthlySpecialDeductionTotal = isSpecialDeductionVisible ? 
        (parseFloat(document.getElementById('reverse-pension-insurance').value) || 0) + 
        (parseFloat(document.getElementById('reverse-medical-insurance').value) || 0) + 
        (parseFloat(document.getElementById('reverse-unemployment-insurance').value) || 0) + 
        (parseFloat(document.getElementById('reverse-housing-fund').value) || 0) : 0;
    
    // 月度专项附加扣除合计
    let monthlySpecialAdditionalTotal = 0;
    if (isSpecialAdditionalDeductionVisible) {
        const monthlyChildrenInfantDeduction = parseFloat(document.getElementById('reverse-children-infant-deduction').value) || 0;
        const monthlyElderlyDeduction = parseFloat(document.getElementById('reverse-elderly-deduction').value) || 0;
        let monthlyHousingDeduction = 0;
        const housingType = document.getElementById('reverse-housing-type').value;
        if (housingType === 'rent') {
            monthlyHousingDeduction = parseFloat(document.getElementById('reverse-rent-deduction').value) || 0;
        } else if (housingType === 'loan') {
            monthlyHousingDeduction = parseFloat(document.getElementById('reverse-housing-loan-deduction').value) || 0;
        }
        const annualEducationDeduction = parseFloat(document.getElementById('reverse-education-deduction').value) || 0;
        // 检查职业资格扣除
        if (document.getElementById('reverse-education-professional-checkbox') && document.getElementById('reverse-education-professional-checkbox').checked) {
            annualProfessionalDeduction = 3600; // 职业资格3600元/年
        }
        // 学历教育扣除：从annualEducationDeduction中减去职业资格的3600元，只保留学历教育的金额
        const educationDegreeAmount = annualEducationDeduction - (annualProfessionalDeduction || 0);
        const monthlyEducationDeduction = educationDegreeAmount / workMonths;
        monthlySpecialAdditionalTotal = monthlyChildrenInfantDeduction + monthlyElderlyDeduction + monthlyHousingDeduction + monthlyEducationDeduction;
    }
    
    // 月度其他扣除合计 = 个人养老金 + 企业年金 + 商业健康保险 + 税收递延型养老保险
    const monthlyOtherDeductionTotal = otherDeduction;
    
    // 月度扣除总额合计 = 基本减除费用 + 月度专项扣除 + 月度专项附加扣除 + 月度其他扣除
    const monthlyDeductionAmount = 5000 + monthlySpecialDeductionTotal + monthlySpecialAdditionalTotal + monthlyOtherDeductionTotal;
    
    // 年度扣除总额合计 = 基本减除费用 + 年度专项扣除 + 年度专项附加扣除 + 年度其他扣除
    const totalDeduction = basicDeduction + annualSpecialDeductionTotal + annualSpecialAdditionalDeductionTotal + annualOtherDeductionTotal;
    
    // 更新显示
    document.getElementById('reverse-monthly-special-deduction-total').textContent = monthlySpecialDeductionTotal.toFixed(2);
    document.getElementById('reverse-monthly-special-additional-total').textContent = monthlySpecialAdditionalTotal.toFixed(2);
    document.getElementById('reverse-monthly-other-deduction-total').textContent = monthlyOtherDeductionTotal.toFixed(2);
    document.getElementById('reverse-annual-special-deduction-total').textContent = annualSpecialDeductionTotal.toFixed(2);
    document.getElementById('reverse-annual-special-additional-total').textContent = annualSpecialAdditionalDeductionTotal.toFixed(2);
    document.getElementById('reverse-annual-other-deduction-total').textContent = annualOtherDeductionTotal.toFixed(2);
    document.getElementById('reverse-monthly-deduction-amount').textContent = monthlyDeductionAmount.toFixed(2);
    document.getElementById('reverse-total-deduction').textContent = totalDeduction.toFixed(2);
}

// 更新扣除项并触发反向倒算计算
function updateReverseDeductionAndCalculate() {
    // 先更新扣除项显示
    updateReverseDeductionCalculation();
    
    // 触发反向倒算计算
    if (Object.keys(reverseCalculationResults).length > 0 || document.getElementById('reverse-target-rate').value) {
        calculateReverseTax();
    }
}

// 更新预览数据
function updatePreviewData() {
    const workMonths = parseInt(document.getElementById('work-months').value) || 12;
    
    // 获取收入数据
    const monthlySalaryIncome = parseFloat(document.getElementById('salary-income').value) || 0;
    const annualLaborIncome = parseFloat(document.getElementById('labor-income').value) || 0;
    const annualAuthorIncome = parseFloat(document.getElementById('author-income').value) || 0;
    const annualRoyaltyIncome = parseFloat(document.getElementById('royalty-income').value) || 0;
    const bonusIncome = parseFloat(document.getElementById('bonus-income').value) || 0;
    const bonusInclude = document.getElementById('bonus-include').checked;
    
    // 使用统一函数计算其他收入
    const otherIncome = calculateOtherIncome(annualLaborIncome, annualAuthorIncome, annualRoyaltyIncome);
    
    // 计算年度综合所得收入额合计
    let totalIncome = monthlySalaryIncome * workMonths + otherIncome.laborTaxableIncome + 
        otherIncome.authorTaxableIncome + otherIncome.royaltyTaxableIncome;
    if (bonusInclude) {
        totalIncome += bonusIncome;
    }
    
    // 使用统一函数计算扣除项
    const deductions = calculateComprehensiveDeductions(workMonths);
    
    const taxableIncome = totalIncome - deductions.totalDeduction;
    
    // 检查元素是否存在，避免错误
    const previewIncome = document.getElementById('preview-income');
    if (previewIncome) {
        previewIncome.textContent = totalIncome.toFixed(2);
    }
    const previewDeduction = document.getElementById('preview-deduction');
    if (previewDeduction) {
        previewDeduction.textContent = deductions.totalDeduction.toFixed(2);
    }
    const previewTaxable = document.getElementById('preview-taxable');
    if (previewTaxable) {
        previewTaxable.textContent = Math.max(0, taxableIncome).toFixed(2);
    }
}

// 反向计算页面的继续教育计算函数
function updateReverseEducationDeduction() {
    const workMonths = parseInt(document.getElementById('reverse-work-months').value) || 12;
    let amount = 0;
    if (document.getElementById('reverse-education-degree-checkbox') && document.getElementById('reverse-education-degree-checkbox').checked) {
        amount += 400 * workMonths; // 学历教育400元/月
    }
    if (document.getElementById('reverse-education-professional-checkbox') && document.getElementById('reverse-education-professional-checkbox').checked) {
        amount += 3600; // 职业资格3600元/年
    }
    if (document.getElementById('reverse-education-deduction')) {
        document.getElementById('reverse-education-deduction').value = amount;
        updateReverseDeductionCalculation();
    }
}

// 重置收入数据
function resetIncomeData() {
    document.getElementById('salary-income').value = 0;
    document.getElementById('labor-income').value = 0;
    document.getElementById('author-income').value = 0;
    document.getElementById('royalty-income').value = 0;
    document.getElementById('bonus-income').value = 0;
    document.getElementById('bonus-include').checked = false;
    
    // 更新显示
    updateIncomeCalculation();
}

// 重置扣除项数据
function resetDeductionData() {
    // 基本减除费用
    document.getElementById('basic-deduction').value = 5000;
    
    // 专项扣除
    document.getElementById('social-security-base').value = 4250;
    document.getElementById('pension-insurance').value = 340;
    document.getElementById('medical-insurance').value = 85;
    document.getElementById('unemployment-insurance').value = 21.25;
    document.getElementById('housing-fund').value = 212.5;
    document.getElementById('housing-fund-base').value = 4250;
    document.getElementById('pension-rate').value = 8;
    document.getElementById('medical-rate').value = 2;
    document.getElementById('unemployment-rate').value = 0.5;
    document.getElementById('housing-fund-rate').value = 5;
    
    // 专项附加扣除
    document.getElementById('elderly-type').value = 'none';
    document.getElementById('elderly-deduction').value = 0;
    document.getElementById('children-infant-count').value = 0;
    document.getElementById('children-infant-deduction-rate').value = 100;
    document.getElementById('children-infant-deduction').value = 0;
    document.getElementById('housing-type').value = 'none';
    document.getElementById('rent-deduction').value = 1500;
    document.getElementById('housing-loan-deduction').value = 1000;
    document.getElementById('education-degree-checkbox').checked = false;
    document.getElementById('education-professional-checkbox').checked = false;
    document.getElementById('education-deduction').value = 0;
    document.getElementById('medical-deduction').value = 0;
    
    // 其他扣除
    document.getElementById('pension-deduction-checkbox').checked = false;
    document.getElementById('pension-deduction').value = 0;
    document.getElementById('pension-deduction-fields').classList.add('hidden');
    document.getElementById('enterprise-annuity-checkbox').checked = false;
    document.getElementById('enterprise-annuity').value = 0;
    document.getElementById('enterprise-annuity-fields').classList.add('hidden');
    document.getElementById('insurance-other-deduction-checkbox').checked = false;
    document.getElementById('insurance-other-deduction').value = 0;
    document.getElementById('insurance-other-deduction-fields').classList.add('hidden');
    document.getElementById('tax-deferred-pension-checkbox').checked = false;
    document.getElementById('tax-deferred-pension').value = 0;
    document.getElementById('tax-deferred-pension-fields').classList.add('hidden');
    document.getElementById('charitable-donation-checkbox').checked = false;
    document.getElementById('charitable-donation').value = 0;
    document.getElementById('charitable-donation-fields').classList.add('hidden');
    
    // 重置复选框状态
    document.getElementById('special-deduction-checkbox').checked = false;
    document.getElementById('special-additional-deduction-checkbox').checked = false;
    document.getElementById('other-deduction-checkbox').checked = false;
    
    // 重置显示状态
    document.getElementById('special-deduction-content').classList.add('hidden');
    document.getElementById('special-additional-deduction-content').classList.add('hidden');
    document.getElementById('other-deduction-content').classList.add('hidden');
    document.getElementById('rent-fields').classList.add('hidden');
    document.getElementById('loan-fields').classList.add('hidden');
    
    // 重置大病医疗实际可扣除额显示
    document.getElementById('actual-medical-deduction-display').textContent = '实际可扣除额：0 元';
    
    // 更新显示
    updateDeductionCalculation();
}

// 重置正向计税
function resetForwardCalculation() {
    console.log('开始执行resetForwardCalculation函数');
    
    try {
        // 1. 重置基本参数
        console.log('重置基本参数');
        document.getElementById('work-months').value = 12;
        document.getElementById('prepaid-tax').value = 0;
        
        // 2. 重置收入明细
        console.log('重置收入明细');
        resetIncomeData();
        
        // 3. 重置扣除项明细
        console.log('重置扣除项明细');
        resetDeductionData();
        
        // 4. 清空计算结果
        console.log('清空计算结果');
        calculationResults = {};
        
        // 5. 重置步骤
        console.log('重置步骤');
        goToStep(1);
        
        console.log('resetForwardCalculation函数执行完成');
    } catch (error) {
        console.error('resetForwardCalculation函数执行出错:', error);
        showAlert('重置过程中出现错误，请检查控制台输出。错误信息：' + error.message);
    }
}

// 重置反向倒算
function resetReverseCalculation() {
    // 1. 重置倒算方式为按目标税率
    document.getElementById('reverse-type').value = 'rate';
    document.getElementById('reverse-type').dispatchEvent(new Event('change'));
    
    // 2. 重置新输入字段
    document.getElementById('reverse-target-rate').value = '3';
    document.getElementById('reverse-monthly-net').value = 0;
    document.getElementById('reverse-fixed-tax').value = 0;
    document.getElementById('reverse-fixed-net').value = 0;
    
    // 2.1 重置年终奖
    document.getElementById('reverse-bonus-income').value = 0;
    document.getElementById('reverse-bonus-include').checked = false;
    
    // 3. 重置工作月数
    document.getElementById('reverse-work-months').value = 12;
    
    // 3. 重置基本减除费用
    document.getElementById('reverse-basic-deduction').value = 60000;
    
    // 4. 重置扣除项复选框状态
    document.getElementById('reverse-special-deduction-checkbox').checked = true;
    document.getElementById('reverse-special-additional-deduction-checkbox').checked = false;
    document.getElementById('reverse-other-deduction-checkbox').checked = false;
    
    // 5. 重置专项扣除数据
    document.getElementById('reverse-social-security-base').value = 4250;
    document.getElementById('reverse-housing-fund-base').value = 4250;
    document.getElementById('reverse-pension-rate').value = 8;
    document.getElementById('reverse-medical-rate').value = 2;
    document.getElementById('reverse-unemployment-rate').value = 0.5;
    document.getElementById('reverse-housing-fund-rate').value = 5;
    
    // 6. 重置专项附加扣除数据
    document.getElementById('reverse-children-infant-count').value = 0;
    document.getElementById('reverse-children-infant-deduction').value = 0;
    document.getElementById('reverse-elderly-type').value = 'none';
    document.getElementById('reverse-elderly-deduction').value = 0;
    document.getElementById('reverse-housing-type').value = 'none';
    document.getElementById('reverse-rent-deduction').value = 1500; // 月度金额
    document.getElementById('reverse-housing-loan-deduction').value = 1000; // 月度金额
    
    // 7. 重置继续教育复选框
    document.getElementById('reverse-education-degree-checkbox').checked = false;
    document.getElementById('reverse-education-professional-checkbox').checked = false;
    document.getElementById('reverse-education-deduction').value = 0;
    
    // 8. 重置大病医疗数据
    document.getElementById('reverse-medical-deduction').value = 0;
    
    // 9. 重置其他扣除数据
    document.getElementById('reverse-pension-deduction').value = 0;
    document.getElementById('reverse-enterprise-annuity-checkbox').checked = false;
    document.getElementById('reverse-enterprise-annuity').value = 0;
    document.getElementById('reverse-enterprise-annuity-fields').classList.add('hidden');
    document.getElementById('reverse-insurance-other-deduction').value = 0;
    document.getElementById('reverse-charitable-donation').value = 0;
    
    // 10. 重置显示状态
    document.getElementById('reverse-special-deduction-content').classList.remove('hidden');
    document.getElementById('reverse-special-additional-deduction-content').classList.add('hidden');
    document.getElementById('reverse-other-deduction-content').classList.add('hidden');
    document.getElementById('reverse-rent-fields').classList.add('hidden');
    document.getElementById('reverse-loan-fields').classList.add('hidden');
    
    // 11. 重置大病医疗实际可扣除额显示
    document.getElementById('reverse-actual-medical-deduction-display').textContent = '实际可扣除额：0 元';
    
    // 12. 清空计算结果
    reverseCalculationResults = {};
    
    // 13. 重置扣除项显示（不触发计算和页面跳转）
    document.getElementById('reverse-monthly-special-deduction-total').textContent = '0.00';
    document.getElementById('reverse-monthly-special-additional-total').textContent = '0.00';
    document.getElementById('reverse-monthly-other-deduction-total').textContent = '0.00';
    document.getElementById('reverse-annual-special-deduction-total').textContent = '0.00';
    document.getElementById('reverse-annual-special-additional-total').textContent = '0.00';
    document.getElementById('reverse-annual-other-deduction-total').textContent = '0.00';
    document.getElementById('reverse-monthly-deduction-amount').textContent = '6000.00';
    document.getElementById('reverse-total-deduction').textContent = '60000.00';
    
    // 14. 再次确保所有显示状态正确
    setTimeout(() => {
        document.getElementById('reverse-special-deduction-content').classList.remove('hidden');
        document.getElementById('reverse-special-additional-deduction-content').classList.add('hidden');
        document.getElementById('reverse-other-deduction-content').classList.add('hidden');
        document.getElementById('reverse-rent-fields').classList.add('hidden');
        document.getElementById('reverse-loan-fields').classList.add('hidden');
        document.getElementById('reverse-actual-medical-deduction-display').textContent = '实际可扣除额：0 元';
        
        calculateReverseSocialSecurity();
        calculateReverseHousingFund();
        updateReverseDeductionCalculation();
    }, 100);
}

// 重置经营所得计算
function resetBusinessCalculation() {
    // 1. 重置经营收入与成本
    document.getElementById('business-income').value = 0;
    document.getElementById('business-cost').value = 0;
    document.getElementById('business-expenses').value = 0;
    document.getElementById('business-taxes').value = 0;
    document.getElementById('business-losses').value = 0;
    document.getElementById('business-other-expenses').value = 0;
    document.getElementById('business-previous-losses').value = 0;
    
    // 2. 重置扣除项
    document.getElementById('business-has-comprehensive-income').checked = true;
    
    // 重置专项扣除
    document.getElementById('business-special-deduction-checkbox').checked = false;
    document.getElementById('business-special-deduction-content').classList.add('hidden');
    document.getElementById('business-pension-insurance').value = 0;
    document.getElementById('business-medical-insurance').value = 0;
    document.getElementById('business-unemployment-insurance').value = 0;
    document.getElementById('business-housing-fund').value = 0;

    // 重置专项附加扣除
    document.getElementById('business-special-additional-checkbox').checked = false;
    document.getElementById('business-special-additional-content').classList.add('hidden');
    document.getElementById('business-children-infant-count').value = 0;
    document.getElementById('business-children-infant-rate').value = '100';
    document.getElementById('business-children-infant-deduction').value = 0;
    document.getElementById('business-elderly-type').value = 'none';
    document.getElementById('business-elderly-deduction').value = 0;
    document.getElementById('business-housing-type').value = 'none';
    document.getElementById('business-housing-deduction').value = 0;
    document.getElementById('business-education-deduction').value = 0;
    document.getElementById('business-medical-deduction').value = 0;

    // 重置其他扣除
    document.getElementById('business-other-deduction-checkbox').checked = false;
    document.getElementById('business-other-deduction-content').classList.add('hidden');
    document.getElementById('business-pension-checkbox').checked = false;
    document.getElementById('business-pension-fields').classList.add('hidden');
    document.getElementById('business-pension-deduction').value = 0;
    document.getElementById('business-enterprise-annuity-checkbox').checked = false;
    document.getElementById('business-enterprise-annuity-fields').classList.add('hidden');
    document.getElementById('business-enterprise-annuity').value = 0;
    document.getElementById('business-insurance-checkbox').checked = false;
    document.getElementById('business-insurance-fields').classList.add('hidden');
    document.getElementById('business-insurance-deduction').value = 0;
    document.getElementById('business-charitable-checkbox').checked = false;
    document.getElementById('business-charitable-fields').classList.add('hidden');
    document.getElementById('business-charitable-donation').value = 0;
    
    document.getElementById('business-prepaid-tax').value = 0;
    
    // 3. 重置步骤
    showBusinessStep(1);
}

// 重置分类所得计算
function resetClassificationCalculation() {
    // 1. 重置所得类型
    document.getElementById('classification-type').value = 'interest';
    
    // 2. 重置收入金额
    document.getElementById('classification-income').value = 0;
    
    // 3. 重置特有字段
    document.getElementById('rent-deductions').value = 0;
    document.getElementById('rent-repair').value = 0;
    document.getElementById('transfer-original').value = 0;
    document.getElementById('transfer-expenses').value = 0;
    
    // 4. 重置显示状态
    document.getElementById('rent-fields').classList.add('hidden');
    document.getElementById('transfer-fields').classList.add('hidden');
    document.getElementById('accidental-hint').classList.add('hidden');
    
    // 5. 重置步骤
    showClassificationStep(1);
}

// 全局变量：分类所得条目列表
let classificationItems = [];

// 分类所得类型名称映射
const classificationTypeNames = {
    interest: '利息、股息、红利所得',
    rent: '财产租赁所得',
    transfer: '财产转让所得',
    accidental: '偶然所得'
};

// 添加分类所得条目
function addClassificationItem() {
    const type = document.getElementById('classification-type').value;
    const income = parseFloat(document.getElementById('classification-income').value) || 0;
    
    if (income <= 0) {
        showAlert('请输入有效的收入金额');
        return;
    }
    
    // 确保类型名称存在，如果不存在使用默认值
    const typeName = classificationTypeNames[type] || '分类所得';
    
    const item = {
        type: type,
        typeName: typeName,
        income: income,
        deduction: 0,
        taxableIncome: 0,
        totalTax: 0
    };
    
    // 获取特定类型的额外参数
    if (type === 'rent') {
        const rentDeductions = parseFloat(document.getElementById('rent-deductions').value) || 0;
        const rentRepair = parseFloat(document.getElementById('rent-repair').value) || 0;
        item.deduction = rentDeductions + Math.min(rentRepair, 800);
    } else if (type === 'transfer') {
        const transferOriginal = parseFloat(document.getElementById('transfer-original').value) || 0;
        const transferExpenses = parseFloat(document.getElementById('transfer-expenses').value) || 0;
        item.deduction = transferOriginal + transferExpenses;
    }
    
    // 计算应纳税所得额
    if (type === 'interest' || type === 'accidental') {
        // 利息、股息、红利所得，偶然所得以每次收入额为应纳税所得额
        item.taxableIncome = income;
    } else if (type === 'rent') {
        // 财产租赁所得
        if (income <= 4000) {
            item.taxableIncome = Math.max(0, income - 800 - item.deduction);
        } else {
            item.taxableIncome = Math.max(0, income * 0.8 - item.deduction);
        }
    } else if (type === 'transfer') {
        // 财产转让所得
        item.taxableIncome = Math.max(0, income - item.deduction);
    }
    
    // 计算应纳税额
    // 分类所得适用20%的比例税率
    item.totalTax = item.taxableIncome * 0.2;
    
    classificationItems.push(item);
    updateClassificationItemsList();
    
    // 重置表单
    resetClassificationCalculation();
}

// 更新分类所得条目列表显示
function updateClassificationItemsList() {
    const listElement = document.getElementById('classification-items-list');
    if (!listElement) return;
    
    listElement.innerHTML = '';
    
    classificationItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'bg-gray-50 rounded-lg p-4 flex justify-between items-center';
        
        itemDiv.innerHTML = `
            <div class="flex-1">
                <div class="font-medium text-gray-800">${item.typeName}</div>
                <div class="text-sm text-gray-600">
                    收入: ¥${item.income.toFixed(2)} 
                    ${item.deduction > 0 ? `| 扣除: ¥${item.deduction.toFixed(2)}` : ''} 
                    | 税额: ¥${item.totalTax.toFixed(2)}
                </div>
            </div>
            <button class="btn bg-red-100 text-red-600 hover:bg-red-200 px-3 py-1 text-sm" onclick="removeClassificationItem(${index})">
                <i class="fa fa-trash"></i>
            </button>
        `;
        
        listElement.appendChild(itemDiv);
    });
}

// 移除分类所得条目
function removeClassificationItem(index) {
    classificationItems.splice(index, 1);
    updateClassificationItemsList();
}

// 更新分类所得结果显示
function updateClassificationResultDisplay() {
    if (classificationItems.length === 0) return;
    
    let totalIncome = 0;
    let totalTaxableIncome = 0;
    let totalTax = 0;
    
    classificationItems.forEach(item => {
        totalIncome += item.income;
        totalTaxableIncome += item.taxableIncome;
        totalTax += item.totalTax;
    });
    
    // 更新显示 - 安全检查元素是否存在
    const resultTypeElement = document.getElementById('classification-result-type');
    if (resultTypeElement) {
        resultTypeElement.textContent = 
            classificationItems.length > 1 ? '多项分类所得' : (classificationItems[0].typeName || '分类所得');
    }
    
    const resultIncomeElement = document.getElementById('classification-result-income');
    if (resultIncomeElement) {
        resultIncomeElement.textContent = '¥' + totalIncome.toFixed(2);
    }
    
    const resultTotalTaxElement = document.getElementById('classification-result-total-tax');
    if (resultTotalTaxElement) {
        resultTotalTaxElement.textContent = '¥' + totalTax.toFixed(2);
    }
    
    const deductionsElement = document.getElementById('classification-result-deductions');
    if (deductionsElement) {
        if (totalTaxableIncome < totalIncome) {
            deductionsElement.classList.remove('hidden');
            const deductionAmountElement = document.getElementById('classification-result-deduction-amount');
            if (deductionAmountElement) {
                deductionAmountElement.textContent = '¥' + (totalIncome - totalTaxableIncome).toFixed(2);
            }
        } else {
            deductionsElement.classList.add('hidden');
        }
    }
    
    const resultTaxableIncomeElement = document.getElementById('classification-result-taxable-income');
    if (resultTaxableIncomeElement) {
        resultTaxableIncomeElement.textContent = '¥' + totalTaxableIncome.toFixed(2);
    }
}

// 计算分类所得税
function calculateClassificationTax() {
    if (classificationItems.length === 0) {
        showAlert('请至少添加一个所得条目');
        return;
    }
    
    let totalIncome = 0;
    let totalTaxableIncome = 0;
    let totalTax = 0;
    
    classificationItems.forEach(item => {
        totalIncome += item.income;
        totalTaxableIncome += item.taxableIncome;
        totalTax += item.totalTax;
    });
    
    classificationCalculationResults = {
        items: [...classificationItems],
        totalIncome: totalIncome,
        totalTaxableIncome: totalTaxableIncome,
        totalTax: totalTax,
        calculationDate: new Date().toISOString()
    };
    
    updateClassificationResultDisplay();
    updateClassificationBudgetTable();
    updateClassificationCharts();
    
    // 更新日期显示
    const dateElement = document.getElementById('classification-budget-table-date');
    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString();
    }
}