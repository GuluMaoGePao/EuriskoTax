/**
 * 文案口吻：spec 里的提示是**给人看的**，不是给自己人对账的。
 *
 * 这里钉四条最容易滑回去的：
 *   ① 用户可见的字符串里不许再有 markdown 加粗（`**…**`）。它曾被整批照 markdown 写进
 *      spec，界面靠 richEsc 转 <strong> 遮住了星号，但导出 PDF / Word、分享图这些旁路
 *      只要有一处漏调 strongify，用户看到的就是一对裸星号（历史上真出过）。
 *      既然界面上那点加粗收益有限，索性从源头删干净 —— 删完以后那条"漏转义"的路也不存在了。
 *   ② 提示不许「正确：… / 错误：…」—— 那是内部校对的口吻，用户看到只会想"那我该按哪个填"。
 *      （只看 hint / note / why：选项名里出现「错误：并入发放当月计税」是**选项的含义**，合法。）
 *   ③ 条文号要带依据，不许光秃秃一个（第五条）：写成（依据：财税〔2000〕91号 第五条）。
 *      条文号本身有价值（用户能拿去核），但没头没尾的"（第五条"谁也不知道是哪份文件。
 *      带了《…》书名号或〔…〕文号的算有依据。
 *   ④ 提示里不用「该数 / 本栏 / 此项」指代上一个框 —— 用户在表单里找不到叫"该数"的框。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../src/js');
const TIP_KEYS = ['hint', 'note', 'why'];

function walk(dir, out) {
    fs.readdirSync(dir).forEach(function (name) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p, out);
        else if (/\.js$/.test(name) && !/\.min\.js$/.test(name)) out.push(p);
    });
    return out;
}

// 取所有"用户可见"的字符串字面量，连同它前面的键名（用来判断是不是提示字段）。
// 注释块里的加粗是写给自己看的，不在此列。
function visibleStrings() {
    const out = [];
    walk(SRC, []).forEach(function (file) {
        const src = fs.readFileSync(file, 'utf8');
        const re = /(\w+)?\s*:\s*(['"])((?:\\\2|.)*?)\2/g;
        let m;
        while ((m = re.exec(src))) {
            const s = m[3];
            if (/^\s*[\/*]/.test(s)) continue;
            if (!/[\u4e00-\u9fa5]/.test(s)) continue;      // 纯代码串（键名、类名）不算文案
            out.push({ file: file, key: m[1] || '', text: s });
        }
    });
    return out;
}

describe('文案口吻：提示是给用户看的', () => {
    const all = visibleStrings();
    const tips = all.filter((x) => TIP_KEYS.indexOf(x.key) !== -1);

    test('样本量够（扫不到东西 = 正则坏了，不是文案干净了）', () => {
        expect(all.length).toBeGreaterThan(500);
        expect(tips.length).toBeGreaterThan(300);
    });

    test('用户可见文案里没有裸的 markdown 加粗', () => {
        const bad = all.filter((x) => x.text.indexOf('**') !== -1);
        expect(bad.slice(0, 5).map((x) => x.file + ' :: ' + x.text.slice(0, 60))).toEqual([]);
    });

    test('提示不许以「正确：/ 错误：」开头（那是内部校对的口吻）', () => {
        const bad = tips.filter((x) => /^(正确|错误|说明|注)\s*[:：]/.test(x.text));
        expect(bad.map((x) => x.text.slice(0, 50))).toEqual([]);
    });

    test('条文号要带依据：不许光秃秃一个（第五条）', () => {
        const bad = tips.filter(function (x) {
            if (!/（第[一二三四五六七八九十]+条/.test(x.text)) return false;
            if (/《[^》]+》/.test(x.text)) return false;        // 前面写了法规全名
            if (/〔[^〕]+〕/.test(x.text)) return false;        // 带了文号
            return x.text.indexOf('依据') === -1;
        });
        expect(bad.map((x) => x.text.slice(0, 70))).toEqual([]);
    });

    test('提示里不用「该数 / 本栏 / 此项」这类代词指代上一个框', () => {
        const bad = tips.filter((x) => /(该数|本栏|此项|本项)/.test(x.text));
        expect(bad.map((x) => x.text.slice(0, 60))).toEqual([]);
    });

    // 用户点破的一件事：提示不是公式表 —— 「社保缴费基数 × 养老比例」回答不了
    // "养老保险金是什么"。带算式的提示，得先有一句"这是什么 / 干什么用 / 什么前提"。
    test('带算式的提示先说这是什么，不能只给一个算式', () => {
        const CALC = /[×=＋÷]/;
        // 「房屋原值 = 实际支付的购房价款…」本身就是定义：名字在等号左边，已经说了是什么
        const NAMED = /^[^=＝]{2,14}\s*[=＝]/;
        // 「速算器按…当减除费用」「按…计税」这类动词也算说了是什么 —— 判据宁可宽，
        // 但不能宽到放过"光秃秃一个算式"（那正是用户点破的那件事）
        const EXPLAIN = /：|是|指|用于|用来|可以|能|进|包含|包括|取决于|前提|条件|依据|加收|相加|算法|结论|表示|按|算|计税|征收|封顶|上限|合计|组成|分档/;
        const bad = tips.filter((x) => CALC.test(x.text)
            && !NAMED.test(x.text) && !EXPLAIN.test(x.text)
            && x.text.length > 20);   // 短于 20 字的多半是拼接字符串的半个片段，整体看才有意义
        expect(bad.map((x) => x.text.slice(0, 60))).toEqual([]);
    });

    // 公式统一写成「计算公式：养老保险金 = 社保缴费基数 × 养老比例」——
    // 左边是算出来的那个名字，右边是算法。只给右半边，用户不知道算出来的是什么。
    // 「按这个算：社保缴费基数 × 养老比例」正是被用户否掉的那版。
    test('算式统一以「计算公式：名字 = …」给出，不留「按这个算」', () => {
        const old = tips.filter((x) => x.text.indexOf('按这个算') !== -1);
        expect(old.map((x) => x.text.slice(0, 60))).toEqual([]);
    });

    test('公式左边要有名字：等号不紧挨开括号、也不在句首', () => {
        // 「（= 社保缴费基数 × 养老比例」这类拼出来的残句，读的人得先看完右边才知道在算什么
        const bare = tips.filter((x) => /[（(]\s*[=＝]/.test(x.text) || /^\s*[=＝]/.test(x.text));
        expect(bare.map((x) => x.text.slice(0, 60))).toEqual([]);
    });

    // 公式另起一行：说明一段、公式一段。糊成一坨时，「计算公式：」这四个字会被前面的句子吃掉。
    // 源码里写的是 \n 两个字符（JS 转义），钉的也是这两个字符。
    test('公式另起一行：计算公式：前面有换行', () => {
        const bad = tips.filter((x) => x.text.indexOf('计算公式：') !== -1 && !/\\n计算公式：/.test(x.text));
        expect(bad.map((x) => x.text.slice(0, 60))).toEqual([]);
    });

    test('提示面板的 CSS 保留 pre-line（没有它，\\n 会被 HTML 折成一个空格）', () => {
        const css = fs.readFileSync(path.join(__dirname, '../src/css/toolbox.css'), 'utf8');
        ['.tool-field-hint', '.dw-result-hint'].forEach((sel) => {
            const block = css.slice(css.indexOf(sel + ' {'));
            expect(block.slice(0, block.indexOf('}'))).toMatch(/white-space:\s*pre-line/);
        });
    });

    test('提示里不出现内部模块名（那是给开发看的，不是给用户看的）', () => {
        const bad = tips.filter((x) => /-quick|registry|statusOf|expiringWithin|Eurisko[A-Z]/.test(x.text));
        expect(bad.map((x) => x.text.slice(0, 60))).toEqual([]);
    });

    // spec 的提示是照 markdown 写的；谁把它当纯文本转义出去，用户看到的就是「**30 人是临界点**」。
    test('提示里不留 markdown 星号', () => {
        const bad = tips.filter((x) => x.text.indexOf('**') !== -1);
        expect(bad.map((x) => x.text.slice(0, 60))).toEqual([]);
    });

    // 句首一个光秃秃的「=」，读的人得往回找主语 —— 先给动词，再给算式。
    test('提示不以等号开头', () => {
        const bad = tips.filter((x) => /^\s*[=＝]/.test(x.text));
        expect(bad.map((x) => x.text.slice(0, 60))).toEqual([]);
    });

    // 「专业、清晰易懂」里**易懂**那半个：能算的公式照留（用户要看这个数怎么来的），
    // 但把符号当连词用、拿函数式算式当说明，读的人只会卡住。
    test('等号只出现在算式里：不许全角 ＝，也不许 T(x) / min() 这种函数式写法', () => {
        const bad = tips.filter((x) => /＝|T\(x\)|min\(|max\(/.test(x.text));
        expect(bad.map((x) => x.text.slice(0, 70))).toEqual([]);
    });

    test('一句到底的长段要拆开：note / why 不超过 200 字', () => {
        // 200 字一整段，眼睛找不到落点 —— 拆成"一句结论 + 分点"是这轮改写的主要手法
        const long = tips.filter((x) => (x.key === 'note' || x.key === 'why') && x.text.length > 200);
        expect(long.map((x) => x.key + ' ' + x.text.length + ' 字：' + x.text.slice(0, 40))).toEqual([]);
    });

    test('黑话要带一句解释：出现术语就给说法，不许光秃秃一个词', () => {
        // 「孰优 / 孰先 / 孰低」是税圈行话（孰 = 哪一个）：圈内人一秒读懂，纳税人读到这里会卡住。
        // 「平均分摊」不是 —— 那是日常用词，不在此列。
        const jargon = /孰优|孰先|孰低|孰高|就高不就低/;
        const bad = tips.filter((x) => jargon.test(x.text) && !/(哪个|就是|指的是|也就是|哪个早|哪个低)/.test(x.text));
        expect(bad.map((x) => x.text.slice(0, 70))).toEqual([]);
    });
});
