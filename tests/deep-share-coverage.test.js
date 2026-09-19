/**
 * 完整测算的分享图出口守护（阶段18-3）
 *
 * 分享图是「用户即分发节点」的转化出口（阶段13D）：算完之后结果区挂出「生成分享图」按钮，
 * 点它按配置表里那份取数规则从**已渲染的结果卡**上读数、截图、生成一张带二维码的长图。
 *
 * 入口是通用的（TRIGGERS 里那颗 dw-next 是 21 个完整测算共用的「下一步」），所以**每个
 * 完整测算算完都会挂出这个按钮**；但取数配置 SOURCES 只写了 4 份 —— business / reverse /
 * forward / classification，即阶段17 每次把页面式 deep 迁到 spec 驱动时就地补的那 4 个。
 * 于是其余 17 个的取数会落到裸键 'dw-result-card'（business 那一份），而它的 selector 写死了
 * `[data-tool-id="business"]` —— 卡上挂着的是增值税，读的自然是空，用户看到的是
 * 「暂无可分享的结果…请先完成一次测算」：**明明刚算完，却被告知没算**。
 *
 * 更危险的是这 4 份配置的回落顺序本身：sourceKey() 认不出就退到裸键，而裸键的 selector
 * 指向另一个工具。所以这里的断言分两层：
 *   ① 取数规则必须**属于当前这个工具**（selector 里带自己的 data-tool-id）；
 *   ② 真的能从卡上取到数（hero 有效，且与结果区那个数是同一个）。
 *
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

// 直接扫目录，不手写清单：spec 的 compute 是运行时才去取 quick 模块的全局对象，
// 漏加载一个的表现是「算出 null」，与「这个工具坏了」长得一模一样。
const QUICK_MODULES = fs.readdirSync(path.resolve(__dirname, '../src/js/calculation'))
    .filter((f) => f.endsWith('-quick.js'));

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const TB = () => window.EuriskoToolbox;
const SC = () => window.ShareCard;

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/utils.js');
    QUICK_MODULES.forEach((f) => loadSource('src/js/calculation/' + f));
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
    loadSource('src/js/share/share-card.js');
});

beforeEach(() => {
    localStorage.clear();
    window.showPage = jest.fn();
    window.showAlert = jest.fn();
    document.body.innerHTML = `
        <div id="mode-selection-page" class="page active"></div>
        <div id="tools-page" class="page hidden">
            <input id="toolbox-search" />
            <div id="toolbox-groups"></div>
            <div id="toolbox-deep"><div id="toolbox-deep-extra" class="hidden"></div></div>
        </div>
        <div id="quick-calculator-page" class="page hidden"></div>
        <div id="deep-wizard-page" class="page hidden"></div>
        <div id="profile-page" class="page hidden"></div>
        <div id="quick-title"></div>
        <div id="quick-subtitle"></div>
        <div id="quick-policy-badge"></div>
        <div id="quick-form"></div>
        <div id="quick-result"></div>
        <div id="quick-pitfalls"></div>
        <div id="quick-next" class="hidden"></div>
        <a id="quick-seo-link"></a>
        <details id="quick-policy-basis" class="hidden"><div id="quick-policy-basis-body"></div></details>
        <nav id="bottom-tabbar" class="hidden"></nav>
        <nav id="top-tabbar" class="hidden"></nav>
    `;
    TB().renderToolbox('', null);
});

function defaultsOf(fields) {
    const v = {};
    (fields || []).forEach((f) => { v[f.key] = f.default; });
    return v;
}

// 挑一个能直接塞数字的字段：select / switch / repeater 的值不是数字（repeater 是数组）
function numericField(fields) {
    return (fields || []).filter((f) => f.type !== 'select' && f.type !== 'switch' && f.type !== 'repeater')[0] || null;
}

// 与 share-card.js 同一判据：占位符 / 纯 0 视为「还没算出东西」
function isMeaningful(text) {
    const t = String(text || '').replace(/[\s¥￥,%]/g, '');
    return !!t && t !== '0' && !/^0\.0*$/.test(t) && t !== '-' && t !== '—' && t !== '--';
}

// 走一遍向导并把结果步渲染出来：open 带 values 时直达结果步（阶段18-2 起）。
// 默认输入对个别测算出的是 0（两处工资一样 → 汇算不退不补），那种「算出 0」本来就会被
// 拒绝出图（一张写着 0 的图比不出图更伤品牌），不是这次要钉的事 —— 所以先用哨兵值喂一份
// 能算出东西的输入，实在算不出才退回默认值。
function renderResult(tool) {
    const base = defaultsOf(tool.fields);
    const f = numericField(tool.fields);
    const seeded = Object.assign({}, base);
    if (f) seeded[f.key] = 12345;

    if (!W().open(tool.id, { values: seeded })) return false;
    const hero = document.getElementById('dw-result-primary');
    if (hero && isMeaningful(hero.textContent)) return true;

    if (!W().open(tool.id, { values: base })) return false;
    return !!document.getElementById('dw-result-primary');
}

describe('完整测算的分享图出口', () => {
    test('21 个完整测算算完之后都能出分享图，且图上的数属于本次测算', () => {
        const broken = [];
        R().deep().forEach((tool) => {
            if (!renderResult(tool)) {
                broken.push(tool.id + '：走完向导没有渲染出结果（这一步都不成立，谈不上出图）');
                return;
            }
            // 走 generate 用的同一个解析入口，而不是自己按 SOURCES 的键去猜 ——
            // 配置可以是「照卡现场取的」动态那一份，光查表会把它当成没有配置
            const cfg = SC().resolveConfig('dw-result-card');
            if (!cfg) {
                broken.push(tool.id + '：解析不出取数配置（sourceKey 为 ' + SC().sourceKey('dw-result-card') + '）');
                return;
            }
            // ① 归属：selector 必须认的是当前这个工具，否则就是「横刀夺爱」——
            //    把别人的结果（或干脆读不到东西）当成这一次的测算出成图
            if (String(cfg.hero.selector).indexOf('data-tool-id="' + tool.id + '"') === -1) {
                broken.push(tool.id + '：取的是 ' + cfg.hero.selector + '（不是这个工具的卡）');
                return;
            }
            // ② 真的取得到数，且与结果区显示的那个主结果一致
            const onCard = document.getElementById('dw-result-primary').textContent.trim();
            const data = SC().collect(cfg);
            if (!data) {
                broken.push(tool.id + '：取不到有效的主结果（出图时会被判成「还没测算」）');
                return;
            }
            if (String(data.heroValue).trim() !== onCard) {
                broken.push(tool.id + '：图上写的是 ' + data.heroValue + '，卡上是 ' + onCard);
            }
        });
        expect(broken).toEqual([]);
    });

    // 行节点把「标签」和「值」渲染在同一个 div 里，照 textContent 整取会把标签一起抄进图上
    // （「适用税率20%」）—— 这条守的是取**值**而不是取整行
    test('明细行写的是值本身，不把行标签一起抄进图上', () => {
        const broken = [];
        R().deep().forEach((tool) => {
            if (!renderResult(tool)) return;
            const cfg = SC().resolveConfig('dw-result-card');
            const data = cfg && SC().collect(cfg);
            if (!data) return;
            data.rows.forEach((row) => {
                if (String(row.value).indexOf(String(row.label)) !== -1) {
                    broken.push(tool.id + '：行「' + row.label + '」的值是 ' + row.value + '（把标签也带进来了）');
                }
            });
        });
        expect(broken).toEqual([]);
    });

    test('明细行同样带着归属锚点（一个工具的行标签不能拿去填另一张图）', () => {
        const broken = [];
        R().deep().forEach((tool) => {
            if (!renderResult(tool)) return;
            const cfg = SC().resolveConfig('dw-result-card');
            if (!cfg) return;
            (cfg.rows || []).forEach((row) => {
                if (String(row.selector).indexOf('data-tool-id="' + tool.id + '"') === -1) {
                    broken.push(tool.id + '：明细行 ' + row.label + ' 取的是 ' + row.selector);
                }
            });
        });
        expect(broken).toEqual([]);
    });
});
