// 计算社保费用
function calculateSocialSecurity() {
    let base = parseFloat(document.getElementById('social-security-base').value) || 0;
    let housingFundBase = parseFloat(document.getElementById('housing-fund-base').value) || 0;
    const pensionRate = parseFloat(document.getElementById('pension-rate').value) || 0;
    const medicalRate = parseFloat(document.getElementById('medical-rate').value) || 0;
    const unemploymentRate = parseFloat(document.getElementById('unemployment-rate').value) || 0;
    const housingFundRate = parseFloat(document.getElementById('housing-fund-rate').value) || 0;
    
    // 社保基数限制：最低7460，最高37302
    const minBase = 7460;
    const maxBase = 37302;
    base = Math.max(minBase, Math.min(maxBase, base));
    housingFundBase = Math.max(minBase, Math.min(maxBase, housingFundBase));
    
    // 计算各项保险费用
    const pensionAmount = base * (pensionRate / 100);
    const medicalAmount = base * (medicalRate / 100);
    const unemploymentAmount = base * (unemploymentRate / 100);
    const housingFundAmount = housingFundBase * (housingFundRate / 100);
    
    // 更新输入字段
    document.getElementById('pension-insurance').value = pensionAmount.toFixed(2);
    document.getElementById('medical-insurance').value = medicalAmount.toFixed(2);
    document.getElementById('unemployment-insurance').value = unemploymentAmount.toFixed(2);
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

// 反向倒算页面的社保缴费计算
function calculateReverseSocialSecurity() {
    let base = parseFloat(document.getElementById('reverse-social-security-base').value) || 0;
    let housingFundBase = parseFloat(document.getElementById('reverse-housing-fund-base').value) || 0;
    const pensionRate = parseFloat(document.getElementById('reverse-pension-rate').value) || 0;
    const medicalRate = parseFloat(document.getElementById('reverse-medical-rate').value) || 0;
    const unemploymentRate = parseFloat(document.getElementById('reverse-unemployment-rate').value) || 0;
    const housingFundRate = parseFloat(document.getElementById('reverse-housing-fund-rate').value) || 0;
    const workMonths = parseInt(document.getElementById('reverse-work-months').value) || 12;
    
    // 社保基数限制：最低7460，最高37302
    const minBase = 7460;
    const maxBase = 37302;
    base = Math.max(minBase, Math.min(maxBase, base));
    housingFundBase = Math.max(minBase, Math.min(maxBase, housingFundBase));
    
    // 计算各项保险费用（根据工作月数调整）
    const pensionAmount = base * (pensionRate / 100) * workMonths;
    const medicalAmount = base * (medicalRate / 100) * workMonths;
    const unemploymentAmount = base * (unemploymentRate / 100) * workMonths;
    const housingFundAmount = housingFundBase * (housingFundRate / 100) * workMonths;
    
    // 更新输入字段
    document.getElementById('reverse-pension-insurance').value = pensionAmount.toFixed(2);
    document.getElementById('reverse-medical-insurance').value = medicalAmount.toFixed(2);
    document.getElementById('reverse-unemployment-insurance').value = unemploymentAmount.toFixed(2);
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
    
    const workMonths = parseInt(document.getElementById('reverse-work-months').value) || 12;
    
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
    
    // 计算月度金额
    const monthlyAmount = amount / workMonths;
    const rate = (monthlyAmount / base) * 100;
    
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
    console.log('updateIncomeCalculation called');
    // 获取工作月数
    const workMonths = parseInt(document.getElementById('work-months').value) || 12;
    console.log('workMonths:', workMonths);
    
    const monthlySalaryIncome = parseFloat(document.getElementById('salary-income').value) || 0;
    const annualLaborIncome = parseFloat(document.getElementById('labor-income').value) || 0;
    const annualAuthorIncome = parseFloat(document.getElementById('author-income').value) || 0;
    const annualRoyaltyIncome = parseFloat(document.getElementById('royalty-income').value) || 0;
    const bonusIncome = parseFloat(document.getElementById('bonus-income').value) || 0;
    const bonusInclude = document.getElementById('bonus-include').checked;
    
    console.log('Inputs:', {
        monthlySalaryIncome,
        annualLaborIncome,
        annualAuthorIncome,
        annualRoyaltyIncome,
        bonusIncome,
        bonusInclude
    });
    
    // 计算各项收入计入综合所得的金额（年度）
        // 劳务报酬所得：不超过4000元的减除800元，超过4000元的减除20%，但不低于0
        const laborTaxableIncome = Math.max(0, annualLaborIncome <= 4000 ? (annualLaborIncome - 800) : (annualLaborIncome * 0.8));
        // 稿酬所得：不超过4000元的减除800元，超过4000元的减除20%，再减按70%，但不低于0
        const authorTaxableIncome = Math.max(0, annualAuthorIncome <= 4000 ? ((annualAuthorIncome - 800) * 0.7) : (annualAuthorIncome * 0.8 * 0.7));
        // 特许权使用费所得：不超过4000元的减除800元，超过4000元的减除20%，但不低于0
        const royaltyTaxableIncome = Math.max(0, annualRoyaltyIncome <= 4000 ? (annualRoyaltyIncome - 800) : (annualRoyaltyIncome * 0.8));
        
        // 计算劳务报酬所得的预扣税额（根据应纳税所得额的不同档次）
        let laborTax = 0;
        if (laborTaxableIncome <= 20000) {
            laborTax = laborTaxableIncome * 0.2;
        } else if (laborTaxableIncome <= 50000) {
            laborTax = laborTaxableIncome * 0.3 - 2000;
        } else {
            laborTax = laborTaxableIncome * 0.4 - 7000;
        }
        
        // 计算稿酬所得的预扣税额
        const authorTax = authorTaxableIncome * 0.2;
        
        // 计算特许权使用费所得的预扣税额
        const royaltyTax = royaltyTaxableIncome * 0.2;
        
        // 计算计入综合所得的金额（年度）
        const annualLaborIncomeCalculated = laborTaxableIncome;
        const annualAuthorIncomeCalculated = authorTaxableIncome;
        const annualRoyaltyIncomeCalculated = royaltyTaxableIncome;
    
    // 计算月度综合所得收入额合计（用于显示）
    const monthlySalaryIncomeCalculated = monthlySalaryIncome;
    const monthlyLaborIncomeCalculated = annualLaborIncomeCalculated / workMonths;
    const monthlyAuthorIncomeCalculated = annualAuthorIncomeCalculated / workMonths;
    const monthlyRoyaltyIncomeCalculated = annualRoyaltyIncomeCalculated / workMonths;
    const monthlyIncomeAmount = monthlySalaryIncomeCalculated;
    
    // 计算年度综合所得收入额合计（根据工作月数调整）
    let totalIncomeAmount = monthlySalaryIncome * workMonths + annualLaborIncomeCalculated + annualAuthorIncomeCalculated + annualRoyaltyIncomeCalculated;
    if (bonusInclude) {
        totalIncomeAmount += bonusIncome;
    }
    
    console.log('Calculations:', {
        annualLaborIncomeCalculated,
        annualAuthorIncomeCalculated,
        annualRoyaltyIncomeCalculated,
        monthlyIncomeAmount,
        totalIncomeAmount
    });
    
    // 更新显示
    document.getElementById('labor-income-calculated').textContent = annualLaborIncomeCalculated.toFixed(2);
    document.getElementById('author-income-calculated').textContent = annualAuthorIncomeCalculated.toFixed(2);
    document.getElementById('royalty-income-calculated').textContent = annualRoyaltyIncomeCalculated.toFixed(2);
    document.getElementById('monthly-income-amount').textContent = monthlyIncomeAmount.toFixed(2);
    document.getElementById('total-income-amount').textContent = totalIncomeAmount.toFixed(2);
    
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
    const pensionDeduction = isOtherDeductionVisible ? (parseFloat(document.getElementById('pension-deduction').value) || 0) : 0;
    const enterpriseAnnuity = isOtherDeductionVisible ? (parseFloat(document.getElementById('enterprise-annuity').value) || 0) : 0;
    const insuranceOtherDeduction = isOtherDeductionVisible ? (parseFloat(document.getElementById('insurance-other-deduction').value) || 0) : 0;
    const taxDeferredPension = isOtherDeductionVisible ? (parseFloat(document.getElementById('tax-deferred-pension').value) || 0) : 0;
    const charitableDonation = isOtherDeductionVisible ? (parseFloat(document.getElementById('charitable-donation').value) || 0) : 0;
    
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
    
    // 计算专项扣除（根据工作月数调整）
    let specialDeduction = 0;
    if (isSpecialDeductionVisible) {
        const monthlyPensionInsurance = parseFloat(document.getElementById('reverse-pension-insurance').value) || 0;
        const monthlyMedicalInsurance = parseFloat(document.getElementById('reverse-medical-insurance').value) || 0;
        const monthlyUnemploymentInsurance = parseFloat(document.getElementById('reverse-unemployment-insurance').value) || 0;
        const monthlyHousingFund = parseFloat(document.getElementById('reverse-housing-fund').value) || 0;
        const monthlySpecialDeduction = monthlyPensionInsurance + monthlyMedicalInsurance + monthlyUnemploymentInsurance + monthlyHousingFund;
        specialDeduction = monthlySpecialDeduction * workMonths;
    }
    
    // 计算专项附加扣除（根据工作月数调整）
    let specialAdditionalDeduction = 0;
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
        
        // 计算大病医疗实际可扣除额（大病医疗是年度金额，不需要根据工作月数调整）
        const medicalDeduction = parseFloat(document.getElementById('reverse-medical-deduction').value) || 0;
        const actualMedicalDeduction = medicalDeduction > 15000 ? Math.min(medicalDeduction - 15000, 80000) : 0;
        
        // 检查职业资格扣除
        let annualProfessionalDeduction = 0;
        if (document.getElementById('reverse-education-professional-checkbox') && document.getElementById('reverse-education-professional-checkbox').checked) {
            annualProfessionalDeduction = 3600; // 职业资格3600元/年
        }
        
        // 更新大病医疗实际可扣除额显示
        document.getElementById('reverse-actual-medical-deduction-display').textContent = `实际可扣除额：${actualMedicalDeduction.toFixed(2)} 元`;
        
        // 计算月度专项附加扣除合计（包含学历教育，不包含职业资格和大病医疗）
        // 学历教育扣除：从annualEducationDeduction中减去职业资格的3600元，只保留学历教育的金额
        const educationDegreeAmount = annualEducationDeduction - (annualProfessionalDeduction || 0);
        const monthlyEducationDeduction = educationDegreeAmount / workMonths;
        const monthlySpecialAdditionalTotal = monthlyChildrenInfantDeduction + monthlyElderlyDeduction + monthlyHousingDeduction + monthlyEducationDeduction;
        
        // 计算年度专项附加扣除合计 = 月度专项附加扣除合计 * 工作月数 + 职业资格 + 大病医疗
        specialAdditionalDeduction = monthlySpecialAdditionalTotal * workMonths + annualProfessionalDeduction + actualMedicalDeduction;
    } else {
        document.getElementById('reverse-actual-medical-deduction-display').textContent = '实际可扣除额：0 元';
    }
    
    // 计算其他扣除（根据工作月数调整）
    let otherDeduction = 0;
    let annualOtherDeductionTotal = 0;
    // 无论复选框是否勾选，都计算其他扣除，因为用户可能已经输入了金额
    const monthlyPensionDeduction = parseFloat(document.getElementById('reverse-pension-deduction').value) || 0;
    const monthlyEnterpriseAnnuity = parseFloat(document.getElementById('reverse-enterprise-annuity').value) || 0;
    const monthlyInsuranceOtherDeduction = parseFloat(document.getElementById('reverse-insurance-other-deduction').value) || 0;
    const monthlyTaxDeferredPension = parseFloat(document.getElementById('reverse-tax-deferred-pension').value) || 0;
    const annualCharitableDonation = parseFloat(document.getElementById('reverse-charitable-donation').value) || 0;
    const monthlyOtherDeductionTotal = monthlyPensionDeduction + monthlyEnterpriseAnnuity + monthlyInsuranceOtherDeduction + monthlyTaxDeferredPension;
    annualOtherDeductionTotal = monthlyOtherDeductionTotal * workMonths + annualCharitableDonation;
    otherDeduction = annualOtherDeductionTotal;
    
    // 计算年度专项扣除合计
    let annualSpecialDeductionTotal = specialDeduction;
    
    // 计算年度专项附加扣除合计
    let annualSpecialAdditionalDeductionTotal = specialAdditionalDeduction;
    
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
        let annualProfessionalDeduction = 0;
        if (document.getElementById('reverse-education-professional-checkbox') && document.getElementById('reverse-education-professional-checkbox').checked) {
            annualProfessionalDeduction = 3600; // 职业资格3600元/年
        }
        // 学历教育扣除：从annualEducationDeduction中减去职业资格的3600元，只保留学历教育的金额
        const educationDegreeAmount = annualEducationDeduction - (annualProfessionalDeduction || 0);
        const monthlyEducationDeduction = educationDegreeAmount / workMonths;
        monthlySpecialAdditionalTotal = monthlyChildrenInfantDeduction + monthlyElderlyDeduction + monthlyHousingDeduction + monthlyEducationDeduction;
    }
    
    // 月度其他扣除合计 = 个人养老金 + 企业年金 + 商业健康保险 + 税收递延型养老保险
    // 使用第444行已经计算的 monthlyOtherDeductionTotal
    
    // 月度扣除总额合计 = 基本减除费用 + 月度专项扣除 + 月度专项附加扣除 + 月度其他扣除
    const monthlyDeductionAmount = 5000 + monthlySpecialDeductionTotal + monthlySpecialAdditionalTotal + monthlyOtherDeductionTotal;
    
    const totalDeduction = basicDeduction + specialDeduction + specialAdditionalDeduction + otherDeduction;
    
    // 更新显示
    document.getElementById('reverse-monthly-special-deduction-total').textContent = monthlySpecialDeductionTotal.toFixed(2);
    document.getElementById('reverse-monthly-special-additional-total').textContent = monthlySpecialAdditionalTotal.toFixed(2);
    document.getElementById('reverse-monthly-other-deduction-total').textContent = monthlyOtherDeductionTotal.toFixed(2);
    document.getElementById('reverse-annual-special-deduction-total').textContent = annualSpecialDeductionTotal.toFixed(2);
    document.getElementById('reverse-annual-special-additional-total').textContent = annualSpecialAdditionalDeductionTotal.toFixed(2);
    document.getElementById('reverse-annual-other-deduction-total').textContent = annualOtherDeductionTotal.toFixed(2);
    document.getElementById('reverse-monthly-deduction-amount').textContent = monthlyDeductionAmount.toFixed(2);
    document.getElementById('reverse-total-deduction').textContent = totalDeduction.toFixed(2);
    
    // 触发反向倒算，实现实时计算
    calculateReverseTax();
}

// 更新预览数据
function updatePreviewData() {
    // 获取工作月数
    const workMonths = parseInt(document.getElementById('work-months').value) || 12;
    
    // 获取收入数据
    const monthlySalaryIncome = parseFloat(document.getElementById('salary-income').value) || 0;
    const annualLaborIncome = parseFloat(document.getElementById('labor-income').value) || 0;
    const annualAuthorIncome = parseFloat(document.getElementById('author-income').value) || 0;
    const annualRoyaltyIncome = parseFloat(document.getElementById('royalty-income').value) || 0;
    const bonusIncome = parseFloat(document.getElementById('bonus-income').value) || 0;
    const bonusInclude = document.getElementById('bonus-include').checked;
    
    // 计算各项收入计入综合所得的金额（年度）
        // 劳务报酬所得：不超过4000元的减除800元，超过4000元的减除20%，但不低于0
        const laborTaxableIncome = Math.max(0, annualLaborIncome <= 4000 ? (annualLaborIncome - 800) : (annualLaborIncome * 0.8));
        // 稿酬所得：不超过4000元的减除800元，超过4000元的减除20%，再减按70%，但不低于0
        const authorTaxableIncome = Math.max(0, annualAuthorIncome <= 4000 ? ((annualAuthorIncome - 800) * 0.7) : (annualAuthorIncome * 0.8 * 0.7));
        // 特许权使用费所得：不超过4000元的减除800元，超过4000元的减除20%，但不低于0
        const royaltyTaxableIncome = Math.max(0, annualRoyaltyIncome <= 4000 ? (annualRoyaltyIncome - 800) : (annualRoyaltyIncome * 0.8));
        
        // 计算劳务报酬所得的预扣税额（根据应纳税所得额的不同档次）
        let laborTax = 0;
        if (laborTaxableIncome <= 20000) {
            laborTax = laborTaxableIncome * 0.2;
        } else if (laborTaxableIncome <= 50000) {
            laborTax = laborTaxableIncome * 0.3 - 2000;
        } else {
            laborTax = laborTaxableIncome * 0.4 - 7000;
        }
        
        // 计算稿酬所得的预扣税额
        const authorTax = authorTaxableIncome * 0.2;
        
        // 计算特许权使用费所得的预扣税额
        const royaltyTax = royaltyTaxableIncome * 0.2;
        
        // 计算计入综合所得的金额（年度）
        const annualLaborIncomeCalculated = laborTaxableIncome;
        const annualAuthorIncomeCalculated = authorTaxableIncome;
        const annualRoyaltyIncomeCalculated = royaltyTaxableIncome;
    
    // 计算年度综合所得收入额合计（根据工作月数调整）
    let totalIncome = monthlySalaryIncome * workMonths + annualLaborIncomeCalculated + annualAuthorIncomeCalculated + annualRoyaltyIncomeCalculated;
    if (bonusInclude) {
        totalIncome += bonusIncome;
    }
    
    // 检查各扣除项是否显示
    const isSpecialDeductionVisible = !document.getElementById('special-deduction-content').classList.contains('hidden');
    const isSpecialAdditionalDeductionVisible = !document.getElementById('special-additional-deduction-content').classList.contains('hidden');
    const isOtherDeductionVisible = !document.getElementById('other-deduction-content').classList.contains('hidden');
    
    // 获取扣除项数据（月度）
    const monthlyBasicDeduction = parseFloat(document.getElementById('basic-deduction').value) || 0;
    const monthlyPensionInsurance = isSpecialDeductionVisible ? (parseFloat(document.getElementById('pension-insurance').value) || 0) : 0;
    const monthlyMedicalInsurance = isSpecialDeductionVisible ? (parseFloat(document.getElementById('medical-insurance').value) || 0) : 0;
    const monthlyUnemploymentInsurance = isSpecialDeductionVisible ? (parseFloat(document.getElementById('unemployment-insurance').value) || 0) : 0;
    const monthlyHousingFund = isSpecialDeductionVisible ? (parseFloat(document.getElementById('housing-fund').value) || 0) : 0;
    const monthlyInsuranceDeduction = monthlyPensionInsurance + monthlyMedicalInsurance + monthlyUnemploymentInsurance + monthlyHousingFund;
    const monthlyElderlyDeduction = isSpecialAdditionalDeductionVisible ? (parseFloat(document.getElementById('elderly-deduction').value) || 0) : 0;
    const monthlyChildrenInfantDeduction = isSpecialAdditionalDeductionVisible ? (parseFloat(document.getElementById('children-infant-deduction').value) || 0) : 0;
    
    // 住房扣除（二选一）
    let monthlyHousingDeduction = 0;
    if (isSpecialAdditionalDeductionVisible) {
        const housingType = document.getElementById('housing-type').value;
        if (housingType === 'rent') {
            monthlyHousingDeduction = parseFloat(document.getElementById('rent-deduction').value) || 0;
        } else if (housingType === 'loan') {
            monthlyHousingDeduction = parseFloat(document.getElementById('housing-loan-deduction').value) || 0;
        }
    }
    
    const annualEducationDeduction = isSpecialAdditionalDeductionVisible ? (parseFloat(document.getElementById('education-deduction').value) || 0) : 0;
    const annualMedicalDeduction = isSpecialAdditionalDeductionVisible ? (parseFloat(document.getElementById('medical-deduction').value) || 0) : 0;
    const monthlyPensionDeduction = isOtherDeductionVisible ? (parseFloat(document.getElementById('pension-deduction').value) || 0) : 0;
    const monthlyEnterpriseAnnuity = isOtherDeductionVisible ? (parseFloat(document.getElementById('enterprise-annuity').value) || 0) : 0;
    const monthlyInsuranceOtherDeduction = isOtherDeductionVisible ? (parseFloat(document.getElementById('insurance-other-deduction').value) || 0) : 0;
    const monthlyTaxDeferredPension = isOtherDeductionVisible ? (parseFloat(document.getElementById('tax-deferred-pension').value) || 0) : 0;
    const annualCharitableDonation = isOtherDeductionVisible ? (parseFloat(document.getElementById('charitable-donation').value) || 0) : 0;
    
    // 检查职业资格扣除
    let annualProfessionalDeduction = 0;
    if (isSpecialAdditionalDeductionVisible && document.getElementById('education-professional-checkbox') && document.getElementById('education-professional-checkbox').checked) {
        annualProfessionalDeduction = 3600; // 职业资格3600元/年
    }
    
    // 计算年度大病医疗实际可扣除额
    const actualMedicalDeduction = annualMedicalDeduction > 15000 ? Math.min(annualMedicalDeduction - 15000, 80000) : 0;
    
    // 计算月度专项附加扣除合计（包含学历教育，不包含职业资格和大病医疗）
    // 学历教育扣除：从annualEducationDeduction中减去职业资格的3600元，只保留学历教育的金额
    const educationDegreeAmount = annualEducationDeduction - (annualProfessionalDeduction || 0);
    const monthlyEducationDeduction = educationDegreeAmount / workMonths;
    const monthlySpecialAdditionalTotal = monthlyElderlyDeduction + monthlyChildrenInfantDeduction + monthlyHousingDeduction + monthlyEducationDeduction;
    
    // 计算年度专项附加扣除合计 = 月度专项附加扣除合计 * 工作月数 + 职业资格 + 大病医疗
    const annualSpecialAdditionalTotal = monthlySpecialAdditionalTotal * workMonths + annualProfessionalDeduction + actualMedicalDeduction;
    
    // 计算年度其他扣除合计（根据工作月数调整）
    const annualOtherDeductionTotal = (monthlyPensionDeduction + monthlyEnterpriseAnnuity + monthlyInsuranceOtherDeduction + monthlyTaxDeferredPension) * workMonths + annualCharitableDonation;
    
    // 计算年度总扣除额（根据工作月数调整）
    const totalDeduction = monthlyBasicDeduction * workMonths + monthlyInsuranceDeduction * workMonths + annualSpecialAdditionalTotal + annualOtherDeductionTotal;
    
    const taxableIncome = totalIncome - totalDeduction;
    
    // 检查元素是否存在，避免错误
    const previewIncome = document.getElementById('preview-income');
    if (previewIncome) {
        previewIncome.textContent = totalIncome.toFixed(2);
    }
    const previewDeduction = document.getElementById('preview-deduction');
    if (previewDeduction) {
        previewDeduction.textContent = totalDeduction.toFixed(2);
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
    document.getElementById('social-security-base').value = 0;
    document.getElementById('pension-insurance').value = 0;
    document.getElementById('medical-insurance').value = 0;
    document.getElementById('unemployment-insurance').value = 0;
    document.getElementById('housing-fund').value = 0;
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
    document.getElementById('pension-deduction').value = 0;
    document.getElementById('enterprise-annuity').value = 0;
    document.getElementById('insurance-other-deduction').value = 0;
    document.getElementById('tax-deferred-pension').value = 0;
    document.getElementById('charitable-donation').value = 0;
    
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
        alert('重置过程中出现错误，请检查控制台输出。错误信息：' + error.message);
    }
}

// 重置反向倒算
function resetReverseCalculation() {
    // 1. 重置税额数据
    document.getElementById('reverse-total-tax').value = 0;
    
    // 2. 重置工作月数
    document.getElementById('reverse-work-months').value = 12;
    
    // 3. 重置基本减除费用
    document.getElementById('reverse-basic-deduction').value = 60000;
    
    // 4. 重置扣除项复选框状态
    document.getElementById('reverse-special-deduction-checkbox').checked = true;
    document.getElementById('reverse-special-additional-deduction-checkbox').checked = false;
    document.getElementById('reverse-other-deduction-checkbox').checked = false;
    
    // 5. 重置专项扣除数据
    document.getElementById('reverse-social-security-base').value = 0;
    document.getElementById('reverse-housing-fund-base').value = 0;
    document.getElementById('reverse-pension-insurance').value = 0;
    document.getElementById('reverse-medical-insurance').value = 0;
    document.getElementById('reverse-unemployment-insurance').value = 0;
    document.getElementById('reverse-housing-fund').value = 0;
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
    document.getElementById('reverse-rent-deduction').value = 18000;
    document.getElementById('reverse-housing-loan-deduction').value = 12000;
    
    // 7. 重置继续教育复选框
    document.getElementById('reverse-education-degree-checkbox').checked = false;
    document.getElementById('reverse-education-professional-checkbox').checked = false;
    document.getElementById('reverse-education-deduction').value = 0;
    
    // 8. 重置大病医疗数据
    document.getElementById('reverse-medical-deduction').value = 0;
    
    // 9. 重置其他扣除数据
    document.getElementById('reverse-pension-deduction').value = 0;
    document.getElementById('reverse-enterprise-annuity').value = 0;
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
    
    // 13. 重新计算并更新显示
    updateReverseDeductionCalculation();
    
    // 14. 再次确保所有显示状态正确
    setTimeout(() => {
        document.getElementById('reverse-special-deduction-content').classList.remove('hidden');
        document.getElementById('reverse-special-additional-deduction-content').classList.add('hidden');
        document.getElementById('reverse-other-deduction-content').classList.add('hidden');
        document.getElementById('reverse-rent-fields').classList.add('hidden');
        document.getElementById('reverse-loan-fields').classList.add('hidden');
        document.getElementById('reverse-actual-medical-deduction-display').textContent = '实际可扣除额：0 元';
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
    document.getElementById('business-investor-deduction').value = 60000;
    document.getElementById('business-other-deduction').value = 0;
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