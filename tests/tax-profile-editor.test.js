/**
 * 「我的 → 税务档案 → 我的情况」编辑卡（阶段19-6a，v1.87.0）
 *
 * 不测样式，钉的是三件「肉眼点一遍才知道」的事：
 *   ① 填过的档案能**看得见**（不能只写不读 —— 那用户只会觉得档案在偷数据）；
 *   ② 改了能存回去，存的是 tax-profile.js 那份（不是另起一个 key）；
 *   ③ 清空要连 nudgeDismissed 一起清（档案都没了还装哑，等于把补全这条路堵死）。
 *
 * @jest-environment jsdom
 */
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const PROJECT_ROOT = path.resolve(__dirname, '..');

beforeAll(() => {
    loadSource('src/js/data/tax-profile.js');
    loadSource('src/js/ui/tax-profile-editor.js');
});

beforeEach(() => {
    localStorage.removeItem('taxProfile');
    document.body.innerHTML = '<div id="profile-whoami-card" class="hidden"></div>';
    window.EuriskoTaxProfile.reset();
});

const card = () => document.getElementById('profile-whoami-card');
const stored = () => JSON.parse(localStorage.getItem('taxProfile') || 'null');

describe('我的情况（档案查看 / 修改）', () => {
    test('空档案：五项都列出来，且都标「未填」', () => {
        window.EuriskoTaxProfileEditor.render();
        expect(card().classList.contains('hidden')).toBe(false);
        expect(card().querySelectorAll('.whoami-row')).toHaveLength(5);
        expect(card().querySelectorAll('.whoami-now.is-empty')).toHaveLength(5);
        expect(card().querySelector('.profile-nudge-pct').textContent).toBe('0%');
    });

    test('填过的项要看得见（身份 / 城市 / 扣除都给出人话，不是字段值）', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee', city: '杭州', deductions: ['rent', 'elderly'] });
        window.EuriskoTaxProfileEditor.render();
        const text = card().textContent;
        expect(text).toContain('上班族');
        expect(text).toContain('杭州');
        expect(text).toContain('住房租金');
        expect(text).toContain('赡养老人');
    });

    test('改城市 + 保存：写回 tax-profile.js 的同一份存储', () => {
        window.EuriskoTaxProfileEditor.render();
        const city = card().querySelector('[data-key="city"]');
        city.value = '成都';
        card().querySelector('.whoami-save').click();

        expect(stored().city).toBe('成都');
        expect(window.EuriskoTaxProfile.get().city).toBe('成都');
        expect(card().textContent).toContain('成都');
    });

    test('勾两个扣除项 + 保存：deductions 落盘，完成度随之走动', () => {
        window.EuriskoTaxProfileEditor.render();
        const before = window.EuriskoTaxProfile.pure.completeness(window.EuriskoTaxProfile.get()).percent;
        const boxes = card().querySelectorAll('.whoami-ded');
        Array.prototype.forEach.call(boxes, (cb) => {
            if (cb.value === 'children' || cb.value === 'rent') cb.checked = true;
        });
        card().querySelector('.whoami-save').click();

        expect(stored().deductions.sort()).toEqual(['children', 'rent']);
        const after = window.EuriskoTaxProfile.pure.completeness(window.EuriskoTaxProfile.get()).percent;
        expect(after).toBeGreaterThan(before);
    });

    test('取消勾选同样生效（改不只是「加」）', () => {
        window.EuriskoTaxProfile.patch({ deductions: ['children', 'rent'] });
        window.EuriskoTaxProfileEditor.render();
        const box = Array.prototype.filter.call(card().querySelectorAll('.whoami-ded'), (b) => b.value === 'rent')[0];
        box.checked = false;
        card().querySelector('.whoami-save').click();
        expect(stored().deductions).toEqual(['children']);
    });

    test('清空：档案归零，且 nudgeDismissed 一起清掉（引导重新开口）', () => {
        window.EuriskoTaxProfile.patch({ identity: 'owner', city: '苏州' });
        window.EuriskoTaxProfile.dismissNudge();
        expect(window.EuriskoTaxProfile.get().nudgeDismissed).toBe(true);

        window.confirm = () => true;      // jsdom 不实现 confirm，返回值会让清空静默跳过
        window.EuriskoTaxProfileEditor.render();
        card().querySelector('.whoami-clear').click();

        const p = window.EuriskoTaxProfile.get();
        expect(p.identity).toBe('');
        expect(p.city).toBe('');
        expect(p.nudgeDismissed).toBe(false);
    });

    test('confirm 取消就什么都不动', () => {
        window.EuriskoTaxProfile.patch({ city: '南京' });
        window.confirm = () => false;
        window.EuriskoTaxProfileEditor.render();
        card().querySelector('.whoami-clear').click();
        expect(window.EuriskoTaxProfile.get().city).toBe('南京');
    });

    test('容器不存在时不抛错（我的页之外的场景不会被拖垮）', () => {
        document.body.innerHTML = '';
        expect(() => window.EuriskoTaxProfileEditor.render()).not.toThrow();
    });
});
