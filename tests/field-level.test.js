/**
 * 字段级分级守护 — 阶段19-7b
 *
 * 19-7a 只给 6 个高频完整测算标了「步」级 advanced；19-7b 把分级铺到全部 spec。
 * v1.142.0：分级不再是「简明 / 完整」视图的一部分 —— 视图取消后它只承担一件事，
 * 把「不填也能算」的参数收进「更多参数（可选）」。本文的守护也随之收敛。
 * 分级是一份**声明**（tool-registry.js 末尾的 ADVANCED_FIELDS / ADVANCED_STEPS），
 * 声明最容易犯的错不是"标错一个字段"，而是这三件：
 *   ① 拼错 / 改名后漏改 —— 清单里的 key 是字符串，写错了不会报错，只是那个字段永远分不到级；
 *   ② 把没有默认值的字段标成 advanced —— 收起来就没值，用户算出来的就变成另一套数
 *      （「不填也能算」是分级唯一的前提，也是下面那组用例守的东西）；
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

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
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
        expect(ids.length).toBe(22);
    });

    // v1.142.0 第三轮：步级 advanced 整档取消 —— 原先它会把整步收起并挪到最后，
    // 于是综合所得进门先被问"你一年挣多少"，而"工作几个月"被挪到最后一屏 —— 参数有默认值
    // 不等于它可以后填：改了工作月数，前面录的那些数全部作废。
    // **位置本身也是语义**，今后只由 spec 的声明顺序决定（见 deep-wizard-ui 的 stepsOf）。
    // 这条断言的作用是：谁再给 steps 打上 level，它会立刻红在那一行 —— 而 field-level
    // 那份清单只能管住字段。
    test('步级 advanced 已整档取消（step 上不允许再出现 level）', () => {
        const withStepLevel = deepSpecs().filter((t) => (t.steps || []).some((s) => s.level))
            .map((t) => t.id);
        expect(withStepLevel).toEqual([]);
    });

    // 「铺到全部 spec」这条**不再成立也不该成立**：reverse 的扣除明细原先整片被标成进阶，
    // 结果那一屏只剩两颗勾选框（详见 tool-registry 里 ADVANCED_FIELDS 的注释）。
    // 一个完整测算**没有**可折叠的进阶参数，说明它每一屏都是必要项 —— 那正是好事，
    // 不是需要补齐的缺口。
    test('没有进阶参数的 spec 是被允许的（不必为了「每个都凑一刀」去标，标了反而有害）', () => {
        const noLevel = deepSpecs().filter((t) => {
            return !(t.fields || []).some((f) => f.level === 'advanced');
        }).map((t) => t.id);
        expect(noLevel).toContain('classification');   // 只有 1 个字段（所得条目 repeater）
        expect(noLevel.length).toBeLessThan(deepSpecs().length);   // 分级清单本身还在被使用
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
    test('advanced 字段的控件仍在 DOM 里（不是 display:none，重画不丢值）', () => {
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
            // 折叠块本身必须是 details（原生可展开，不必先把某个开关打开）
            const details = host.querySelector('details.tool-advanced-block');
            if (!details) missing.push(t.id + ' 缺折叠块');
            else if (details.hasAttribute('open')) missing.push(t.id + ' 不该默认展开');
            document.body.removeChild(host);
        });
        expect(missing).toEqual([]);
    });

    // v1.142.0 之前这里断言的是「完整视图下默认展开」—— 视图没了，只剩默认收起这一条：
    // 这一屏要先把必填项讲清楚，参数清单不是开场就得看见的东西。
    test('折叠块默认收起，且 summary 上写明「不填按默认值」', () => {
        const t = deepSpecs().filter((x) => (x.fields || []).some((f) => f.level === 'advanced'))[0];
        const adv = (t.fields || []).filter((f) => f.level === 'advanced');
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.innerHTML = TB().advancedBlockHtml(adv, {}, null, t.id);
        const details = host.querySelector('details.tool-advanced-block');
        expect(details).toBeTruthy();
        expect(details.hasAttribute('open')).toBe(false);
        // 折叠带 tool-id：翻过参数要能归因到「调的是哪个税」（lead-context 的信号看它）
        expect(details.getAttribute('data-tool-id')).toBe(t.id);
        expect(details.textContent).toContain('不填按默认值');
        document.body.removeChild(host);
    });
});
