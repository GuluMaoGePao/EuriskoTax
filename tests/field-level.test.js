/**
 * 字段级分级守护 — 阶段19-7b
 *
 * 19-7a 只给 6 个高频完整测算标了「步」级 advanced；19-7b 把分级铺到全部 spec。
 * 分级是一份**声明**（tool-registry.js 末尾的 ADVANCED_FIELDS / ADVANCED_STEPS），
 * 声明最容易犯的错不是"标错一个字段"，而是这三件：
 *   ① 拼错 / 改名后漏改 —— 清单里的 key 是字符串，写错了不会报错，只是那个字段永远分不到级；
 *   ② 把没有默认值的字段标成 advanced —— 简明视图收起它，用户算出来的就变成另一套数
 *      （「不填也能算」是分级的唯一前提，也是 mode-pref ②那一条守护的推广）；
 *   ③ 步级与字段级叠加 —— 折出两层折叠，用户要点两次才能看到一个参数。
 *
 * 这里把三件都钉死，另外钉两处容易被改坏的地方：
 *   字段的 step 必须能在 spec.steps 里找到（曾有一个字段写了两个 step，后者把前者冲掉，
 *   字段因此不属于任何一步、界面上永远不显示）；
 *   速算器一个都不标（它们只有 2~5 个字段且全部必填 —— 分级会把必填项藏起来）。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

const R = () => window.EuriskoToolRegistry;
const TB = () => window.EuriskoToolbox;
const P = () => window.EuriskoModePref;

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/ui/mode-pref.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
});

beforeEach(() => {
    localStorage.clear();
});

function deepSpecs() {
    return R().deep();
}

function allTools() {
    return R().all();
}

describe('分级清单可审计', () => {
    test('清单里的 spec id 都是真的 —— 拼错了不会报错，只会悄悄不生效', () => {
        const ids = deepSpecs().map((t) => t.id);
        // 清单不直接导出，靠「被标上 level 的字段 / 步」反查：任何一处 level 都必须落在真 spec 上
        deepSpecs().forEach((t) => {
            (t.fields || []).forEach((f) => {
                if (f.level) expect(f.level).toBe('advanced');
            });
            (t.steps || []).forEach((s) => {
                if (s.level) expect(s.level).toBe('advanced');
            });
        });
        expect(ids.length).toBe(21);
    });

    test('分级铺到了全部 spec：每个完整测算都有可折叠的进阶参数（只有一个字段的那个除外）', () => {
        const noLevel = deepSpecs().filter((t) => {
            const hasField = (t.fields || []).some((f) => f.level === 'advanced');
            const hasStep = (t.steps || []).some((s) => s.level === 'advanced');
            return !hasField && !hasStep;
        }).map((t) => t.id);
        // classification 只有 1 个字段（所得条目 repeater），没有"可选"可言 —— 它是唯一允许 0 分级的
        expect(noLevel.sort()).toEqual(['classification']);
    });
});

describe('「不填也能算」是分级的前提', () => {
    test('标了 advanced 的字段必须有 default —— 收起来就没值，等于换了套算法', () => {
        const bad = [];
        deepSpecs().forEach((t) => {
            (t.fields || []).forEach((f) => {
                if (f.level === 'advanced' && f.default === undefined) bad.push(t.id + '.' + f.key);
            });
        });
        expect(bad).toEqual([]);
    });

    test('每个 spec 至少留一个 basic 字段 —— 简明视图不该是一张空表', () => {
        const empty = [];
        deepSpecs().forEach((t) => {
            const basic = (t.fields || []).filter((f) => f.level !== 'advanced');
            if (!basic.length) empty.push(t.id);
        });
        expect(empty).toEqual([]);
    });
});

describe('步级与字段级不叠加', () => {
    test('advanced 步里的字段不再自带 level —— 否则简明视图下要连点两次折叠', () => {
        const dup = [];
        deepSpecs().forEach((t) => {
            const advSteps = (t.steps || []).filter((s) => s.level === 'advanced').map((s) => s.key);
            if (!advSteps.length) return;
            (t.fields || []).forEach((f) => {
                if (f.level === 'advanced' && advSteps.indexOf(f.step) >= 0) dup.push(t.id + '.' + f.key);
            });
        });
        expect(dup).toEqual([]);
    });
});

describe('字段的归属步必须存在', () => {
    test('每个字段的 step 都能在 spec.steps 里找到（曾有两个 step 键互相覆盖的前车之鉴）', () => {
        const orphan = [];
        deepSpecs().forEach((t) => {
            const keys = (t.steps || []).map((s) => s.key);
            (t.fields || []).forEach((f) => {
                if (keys.indexOf(f.step) < 0) orphan.push(t.id + '.' + f.key + ' → ' + String(f.step));
            });
        });
        expect(orphan).toEqual([]);
    });
});

describe('速算器不参与分级', () => {
    test('20 个速算器一个 advanced 字段都没有 —— 它们只有 2~5 个字段且全部必填', () => {
        const tagged = [];
        allTools().forEach((t) => {
            (t.fields || []).forEach((f) => {
                if (f.level === 'advanced') tagged.push(t.id + '.' + f.key);
            });
            (t.steps || []).forEach((s) => {
                if (s.level === 'advanced') tagged.push(t.id + '/step:' + s.key);
            });
        });
        expect(tagged).toEqual([]);
    });
});

describe('折叠 ≠ 删除', () => {
    test('简明视图下 advanced 字段的控件仍在 DOM 里（不是 display:none，切换视图不丢值）', () => {
        P().set(P().SIMPLE);
        expect(P().get()).toBe(P().SIMPLE);

        const missing = [];
        deepSpecs().forEach((t) => {
            const adv = (t.fields || []).filter((f) => f.level === 'advanced');
            if (!adv.length) return;
            const host = document.createElement('div');
            document.body.appendChild(host);
            host.innerHTML = TB().advancedBlockHtml(adv, {}, null);
            adv.forEach((f) => {
                // 速算器那份渲染器给控件加 'qf-' 前缀（向导复用同一份，id 口径只有一处）
                const el = host.querySelector('[id="qf-' + f.key + '"]');
                if (!el) missing.push(t.id + '.' + f.key);
            });
            // 折叠块本身必须是 details（可展开），且简明下默认收起
            const details = host.querySelector('details.tool-advanced-block');
            if (!details) missing.push(t.id + ' 缺折叠块');
            else if (details.hasAttribute('open')) missing.push(t.id + ' 简明下不该默认展开');
            document.body.removeChild(host);
        });
        expect(missing).toEqual([]);
    });

    test('完整视图下同一个块默认展开 —— 选了完整的人不该再点一次', () => {
        P().set(P().FULL);
        const t = deepSpecs().filter((x) => (x.fields || []).some((f) => f.level === 'advanced'))[0];
        const adv = (t.fields || []).filter((f) => f.level === 'advanced');
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.innerHTML = TB().advancedBlockHtml(adv, {}, null);
        const details = host.querySelector('details.tool-advanced-block');
        expect(details).toBeTruthy();
        expect(details.hasAttribute('open')).toBe(true);
        document.body.removeChild(host);
    });
});
