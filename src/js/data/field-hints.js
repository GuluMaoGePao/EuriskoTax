// === 字段提示数据（参数提示系统） ===
// 所有表单字段的提示文案统一在此维护，便于后续拓展和国际化
// 键名规则：{模块}_{字段标识}

const FIELD_HINTS = {
    // ===== 通用 =====
    'common_work_months': '一年中实际工作的月数，不满12个月时需要调整计算',
    'common_prepaid_tax': '个人全年已预缴的个税总额，用于计算年度应退/应补税额；留空则由系统按工资累计预缴 + 劳务/稿酬/特许权使用费预缴自动估算',

    // 17B-2（v1.48.0）：反向倒算的这一组键随旧页面删除 —— 它们对应的 `<reverse-*>`
    // 输入框不存在了，留着只是给「改字段提示的人」一份找不到主人的清单。
    // 17B-3（v1.49.0）：综合所得 `forward_*` 同样删掉。迁移后字段提示写在 **spec 自己的
    // `fields[].hint`** 里（tool-registry），跟着字段一起被渲染器画出来；
    // 这份按页面分组的清单只服务于手写页面。

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
    // 17B-4（v1.50.0）：classification_* 六个键随分类所得页面删掉了 ——
    // 承载它们的 tooltip 只写在那（现已不存在的）页面上。tooltip 机制本身还在：
    // 页面式 page 与向导共用同一套 data-hint → 这里查字典的方式，删掉这 6 条只是因为宿主没了。
};

// 暴露到全局
window.FIELD_HINTS = FIELD_HINTS;
