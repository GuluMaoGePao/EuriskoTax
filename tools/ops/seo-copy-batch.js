#!/usr/bin/env node
/**
 * SEO 落地页（seo/*.html）文案批量对齐 —— CP-3 术语统一 / CP-4 免责统一 / CP-5 备案位
 *
 * 为什么需要脚本而不是手改 21 个文件：
 *   落地页是**静态 HTML**，引用不了 src/js/copy/copy-standard.js 的常量，
 *   一致性只能靠「每次改规范就跑一遍这个脚本」+ tests/copy-standard.test.js 的守护断言兜住。
 *
 * 用法：
 *   node tools/ops/seo-copy-batch.js          写入（默认）
 *   node tools/ops/seo-copy-batch.js --check  只检查不写入（CI / 人工核对用，有差异则 exit 1）
 *
 * 改文案的正确顺序（与 docs/guides/user-facing-copy-standard.md §1.3 一致）：
 *   ① 改规范文档 → ② 改 src/js/copy/copy-standard.js → ③ 在下面加/改规则 → ④ 跑本脚本 → ⑤ 跑 npm test
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SEO_DIR = path.join(ROOT, 'seo');
const CHECK_ONLY = process.argv.includes('--check');

// ===== 全局规则：所有落地页一视同仁（术语 / 极限词 / CTA）=====
const GLOBAL_RULES = [
    // —— CP-3 术语统一 ——
    ['税务部门核算为准', '主管税务机关认定为准', '术语：税务部门→主管税务机关、核算→认定'],
    ['税务部门核定为准', '主管税务机关认定为准', '同上'],
    ['税务部门', '主管税务机关', '术语：法定表述为「主管税务机关」'],
    ['核算为准', '认定为准', '术语：本站不做「核算」（核算属税务机关职能）'],
    ['本页按公开政策口径做测算', '本页与 App 均按公开政策口径做测算', 'E-02：FAQ 前缀统一'],
    ['完整计算器', '完整测算', 'E-03：术语统一（站内只有速算器与完整测算）'],
    ['免费计算器', '税费测算', 'E-08：落地页 title/description 不带营销词「免费」'],
    ['完整版计算器', '完整测算工具', 'E-03：术语统一'],
    ['个人所得税预算规划工具', '税费测算工具', 'C-01：品牌名统一为「EuriskoTax 税费计算器」（覆盖 20 个税种，不窄化为个税）'],
    ['免费使用，不采集收入金额。', '免注册使用 · 不采集收入金额。', "E-04 / §8-5：「免费」是营销语，改事实描述"],
    ['由客服协助', '由顾问协助', '术语：客服→顾问'],
    // —— CP-1 广告法 ——
    ['最值钱', '更值得优先算', 'E-05：主观最高级'],
    ['性价比最高', '性价比更高', 'E-05：主观最高级'],
    ['最优拆分建议', '拆分测算', 'E-05：主观最高级'],
    ['最准', '更贴近实报口径', 'E-05：主观最高级'],
    ['最容易踩的口径', '常见易错口径', 'E-06：描述性「最」统一为「常见」'],
    ['最容易填错', '常见易错', 'E-06'],
    ['最常被多缴的一处', '常见多缴点', 'E-06'],
    // —— E-07 附加建议句（C 型三选一，措辞与 copy-standard.js 的 EXTRA 逐字一致）——
    ['本页不构成购买建议', '本页不构成保险产品购买建议', 'E-07：C 型 insurance 追加句'],
    ['不构成是否参加的建议', '不构成是否参加企业年金的建议', 'E-07：C 型 annuity 追加句']
];

// ===== 页级规则：免责后缀按页面归属 5 选 1（§2.3 B 型 + C 型追加句）=====
const PAGE_RULES = {
    'enterprise-annuity.html': [
        // 追加句的规则必须带 `</p>` 收尾：只写「…认定为准。」会命中自己追加后的结果，
        // 于是每跑一次就多挂一句（幂等性只有靠锚点才守得住）
        ['实际纳税请以主管税务机关与年金计划受托人认定为准。</p>',
            '实际纳税请以主管税务机关与年金计划受托人认定为准。本页不构成是否参加企业年金的建议。</p>',
            'B 型 annuity 后缀 + C 型追加句（E-07）']
    ],
    'disability-fund.html': [
        ['实际应缴金额请以当地税务机关、残联与工会组织的认定为准。',
            '实际应缴金额请以主管税务机关、残联与工会组织认定为准。', 'B 型 disability 后缀']
    ],
    'private-pension.html': [
        ['本测算结果仅供参考，不构成税务建议或投资建议；实际纳税请以主管税务机关与商业银行认定为准。',
            '本测算结果仅供参考，不构成税务建议；实际纳税请以主管税务机关与商业银行认定为准。本页不构成投资建议。',
            'B 型 pension 后缀 + C 型追加句']
    ],
    'health-insurance.html': [
        ['本测算结果仅供参考，不构成税务建议或保险产品推荐；实际纳税与扣除请以主管税务机关认定为准。',
            '本测算结果仅供参考，不构成税务建议；实际纳税请以主管税务机关与商业银行认定为准。本页不构成保险产品购买建议。',
            'B 型 pension 后缀 + C 型追加句']
    ],
    'business-income.html': [
        ['本测算结果仅供参考，不构成税务建议；应税所得率与征收方式以主管税务机关核定为准。',
            '本测算结果仅供参考，不构成税务建议；实际纳税请以主管税务机关认定为准。', 'B 型默认后缀']
    ],
    'index.html': [
        ['实际缴费与纳税请以当地社保、公积金经办机构与主管税务机关认定为准。',
            '实际纳税请以主管税务机关认定为准。', '目录页走默认后缀（它不是社保页）']
    ]
};

// ===== CP-5 备案位：与主站同构容器 + 同一份渲染脚本 =====
const FILING_ID = 'site-filing';
const FILING_HTML = '    <div id="site-filing" class="site-filing"></div>\n';
const FILING_SCRIPT = '<script src="/src/js/ui/site-filing-ui.js" defer></script>';

function applyRules(html, rules, stats, file) {
    let out = html;
    rules.forEach(function (rule) {
        const [from, to, why] = rule;
        if (from === to) return;
        const hits = out.split(from).length - 1;
        if (!hits) return;
        out = out.split(from).join(to);
        stats.push({ file, from, to, why, hits });
    });
    return out;
}

function ensureFiling(html, file, stats) {
    let out = html;
    if (out.indexOf('id="' + FILING_ID + '"') === -1) {
        const idx = out.lastIndexOf('</footer>');
        if (idx === -1) {
            stats.push({ file, from: '(缺 </footer>)', to: '#site-filing', why: 'CP-5 备案位', hits: 0 });
            return out;
        }
        out = out.slice(0, idx) + FILING_HTML + out.slice(idx);
        stats.push({ file, from: '(插入)', to: '#site-filing 容器', why: 'CP-5 备案位', hits: 1 });
    }
    if (out.indexOf('/src/js/ui/site-filing-ui.js') === -1) {
        const bodyIdx = out.lastIndexOf('</body>');
        if (bodyIdx === -1) return out;
        out = out.slice(0, bodyIdx) + FILING_SCRIPT + '\n' + out.slice(bodyIdx);
        stats.push({ file, from: '(插入)', to: 'site-filing-ui.js', why: 'CP-5 渲染脚本', hits: 1 });
    }
    return out;
}

function main() {
    const files = fs.readdirSync(SEO_DIR).filter((f) => f.endsWith('.html'));
    const stats = [];
    let changed = 0;

    files.forEach(function (file) {
        const full = path.join(SEO_DIR, file);
        let html = fs.readFileSync(full, 'utf8');
        const before = html;

        html = applyRules(html, GLOBAL_RULES, stats, file);
        if (PAGE_RULES[file]) html = applyRules(html, PAGE_RULES[file], stats, file);
        html = ensureFiling(html, file, stats);

        if (html !== before) {
            changed += 1;
            if (!CHECK_ONLY) fs.writeFileSync(full, html, 'utf8');
        }
    });

    if (!stats.length) {
        console.log('[seo-copy-batch] 21 个落地页文案已全部对齐规范，无需改动。');
        return 0;
    }

    console.log('[seo-copy-batch] 共 ' + stats.length + ' 类替换，涉及 ' + changed + ' 个文件' + (CHECK_ONLY ? '（--check：未写入）' : ''));
    stats.forEach(function (s) {
        console.log('  · ' + s.file + '：' + s.from + ' → ' + s.to + '（×' + s.hits + '）[' + s.why + ']');
    });
    return CHECK_ONLY ? 1 : 0;
}

process.exit(main());
