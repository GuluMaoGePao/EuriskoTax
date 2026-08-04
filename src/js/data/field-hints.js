// === 字段提示数据（参数提示系统） ===
// 所有表单字段的提示文案统一在此维护，便于后续拓展和国际化
// 键名规则：{模块}_{字段标识}

const FIELD_HINTS = {
    // ===== 通用 =====
    'common_work_months': '一年中实际工作的月数，不满12个月时需要调整计算',
    'common_prepaid_tax': '个人全年已预缴的个税总额，用于计算年度应退/应补税额',

    // ===== 综合所得 - 基本参数 =====
    'forward_salary': '税前月工资薪金，全额计入综合所得收入额',
    'forward_labor': '劳务报酬所得，按80%折算计入综合所得收入额',
    'forward_author': '稿酬所得，按80%×70%折算计入综合所得收入额',
    'forward_royalty': '特许权使用费所得，按80%折算计入综合所得收入额',
    'forward_bonus': '全年一次性奖金收入，可选择并入综合所得计税或单独计税',
    'forward_basic_deduction': '每月固定5000元，不可修改',

    // ===== 综合所得 - 社保公积金 =====
    'forward_social_base': '社会保险缴费的基数，一般为本人上年度月平均工资',
    'forward_pension': '个人承担的养老保险部分',
    'forward_medical': '个人承担的医疗保险部分',
    'forward_unemployment': '个人承担的失业保险部分',
    'forward_housing': '个人承担的住房公积金部分',

    // ===== 综合所得 - 专项附加扣除 =====
    'forward_children': '每个子女/婴幼儿每月2000元的专项附加扣除',
    'forward_elderly': '独生子女每月3000元，非独生子女分摊每月3000元，最高1500元/月',
    'forward_house': '住房租金或住房贷款利息，二选一',
    'forward_education': '学历教育400元/月，职业资格3600元/年，可叠加享受',
    'forward_serious': '医保目录范围内自付部分超过15000元的部分，限额80000元',
    'forward_pension_insurance': '个人养老金月度扣除限额1000元',
    'forward_annuity': '请手动输入企业年金金额，一般为个人月工资的5%',
    'forward_health': '商业健康保险月度扣除限额200元',
    'forward_investment': '当月收入的6%与1000元中的较低者',
    'forward_donation': '符合标准的一般捐赠30%，特殊捐赠100%',

    // ===== 反向倒算 =====
    'reverse_mode': '选择倒算方式',
    'reverse_type': '选择需要反向倒算的所得类型',
    'reverse_basis': '选择应纳税所得额的计算基准，适配不同预算规划需求',
    'reverse_rate': '选择希望适用的税率级别',
    'reverse_monthly_income': '每月实际到手的税后收入',
    'reverse_target_type': '选择倒算的目标类型',
    'reverse_target_tax': '希望全年缴纳的个人所得税总额',
    'reverse_target_income': '希望全年实际到手的税后收入',
    'reverse_bonus': '全年一次性奖金收入',

    // ===== 经营所得 - 成本费用 =====
    'business_revenue': '包括主营业务收入和其他业务收入',
    'business_cost': '包括原材料、商品采购等直接成本',
    'business_expense': '包括房租、水电费、办公费等间接费用',
    'business_tax': '包括增值税、城建税、教育费附加等',
    'business_loss': '包括资产损失、坏账损失等',
    'business_other': '其他与经营活动相关的支出',
    'business_carry_loss': '允许弥补的以前年度亏损',
    'business_carry_loss_short': '可弥补的以前年度亏损（不超过5年）',

    // ===== 经营所得 - 扣除参数 =====
    'business_with_comp': '有综合所得：基本减除费用6万元及社保公积金已在综合所得中扣除，经营所得不再重复扣除<br>无综合所得：可享受每月5000元减除费用并扣除社保公积金',
    'business_with_comp_simple': '仅无综合所得时可扣除',
    'business_other_amount': '其他允许扣除的金额',
    'business_pension': '个人承担的养老保险部分（灵活就业人员缴纳）',
    'business_medical': '个人承担的医疗保险部分（灵活就业人员缴纳）',
    'business_unemployment': '个人承担的失业保险部分（灵活就业人员缴纳）',
    'business_housing': '个人承担的住房公积金部分',
    'business_pension_insurance': '年度扣除限额12000元',
    'business_health': '年度扣除限额2400元',
    'business_donation': '一般捐赠扣除限额为应纳税所得额的30%',
    'business_prepaid': '年度内已预缴的经营所得税额',

    // ===== 分类所得 =====
    'classification_type': '选择分类所得的具体类型',
    'classification_amount': '每次收入的金额',
    'classification_tax': '包括相关税费等',
    'classification_deduction': '每月最高扣除800元',
    'classification_original': '取得财产时的实际支出',
    'classification_fee': '转让过程中发生的相关费用'
};

// 暴露到全局
window.FIELD_HINTS = FIELD_HINTS;
