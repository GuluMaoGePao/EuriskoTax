// 脚本编码守卫：含中文的 .ps1 必须带 UTF-8 BOM
//
// 为什么必须守（真实事故，不是假想）：
//   v1.37.0 发布后跑 `npm run verify:pg`，脚本在**解析阶段**就报「字符串缺少终止符」——
//   `tools/ops/ops-verify-pg.ps1` 被存成了 UTF-8 **无 BOM**。Windows PowerShell 5.1 对无 BOM
//   文件按系统 ANSI(GBK) 解码，中文字节被误解码后会把后面的引号一起吞掉，于是字符串没闭合，
//   整个脚本连跑都跑不起来（现象：发布链路里「演练」这一环直接消失，而单测全绿、毫无征兆）。
//   同类隐患还有 `tools/gui/gui-dev-console.ps1`（GUI 开发控制台主体）：它没炸只是因为启动 bat
//   里有一段「BOM 自检」每次启动自动补 —— 兜底可以留，但不能是唯一防线。
//
// 这里钉住五件事：
//   ① 仓库内所有 .ps1（排除 node_modules / .git）只要含非 ASCII，就必须以 UTF-8 BOM 开头；
//   ② 文件必须是合法 UTF-8（解码后不出现替换字符 U+FFFD），防止「带了 BOM 但内容已损坏」；
//   ③ 正文里不得出现第二个 U+FEFF（拼接 / 工具复制可能塞进隐形 BOM，PS 同样解析报错）；
//   ④ 扫描必须真的扫到东西（含中文脚本数、带 BOM 脚本数下限），避免路径写错导致空跑全绿；
//   ⑤ 关键运维脚本仍在扫描范围内（改名 / 挪目录时这条会红，而不是被 ① 静默放过）。
//
// 反向验证过（断言非恒真）：临时放入一个含中文、无 BOM 的 .ps1，① 会立刻红灯并点名该文件；
// 移除后转绿。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// node_modules 里的三方包不受本仓库纪律约束；.git / coverage 是生成物或对象库
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist']);

const UTF8_BOM = [0xef, 0xbb, 0xbf];

function walkPs1(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walkPs1(path.join(dir, entry.name), out);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.ps1')) {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
}

const hasBom = (buf) => buf.length >= 3 && UTF8_BOM.every((b, i) => buf[i] === b);
const toRel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

const scripts = walkPs1(ROOT).map((abs) => {
    const buf = fs.readFileSync(abs);
    const bom = hasBom(buf);
    // 按 UTF-8 解码正文（BOM 不算内容）：用于判定「有没有中文」与「文件本身是否损坏」
    const text = (bom ? buf.subarray(3) : buf).toString('utf8');
    return { file: toRel(abs), bom, text, hasChinese: /[^\x00-\x7F]/.test(text) };
});

const chineseScripts = scripts.filter((s) => s.hasChinese);

describe('脚本编码守卫：含中文的 .ps1 必须带 UTF-8 BOM（PS 5.1 按 ANSI 读会吞掉引号）', () => {
    test('扫描确实覆盖到仓库脚本（防路径写错导致空跑全绿）', () => {
        expect(scripts.length).toBeGreaterThanOrEqual(15);
        expect(chineseScripts.length).toBeGreaterThanOrEqual(10);
        expect(scripts.filter((s) => s.bom).length).toBeGreaterThanOrEqual(10);
    });

    test('每个含非 ASCII 字符的 .ps1 都以 UTF-8 BOM 开头', () => {
        const offenders = chineseScripts.filter((s) => !s.bom).map((s) => s.file);
        // 失败信息里直接给出文件名清单：重存为「UTF-8 with BOM」即可修
        expect(offenders).toEqual([]);
    });

    test('正文里没有多余的 U+FEFF（拼接/MS 工具可能塞进第二个 BOM，PS 会直接报错）', () => {
        // 允许（且仅允许）文件开头那一个 BOM：BOM 之外的 U+FEFF 属于「隐形垃圾字符」
        const duplicated = scripts.filter((s) => s.text.includes('\uFEFF')).map((s) => s.file);
        expect(duplicated).toEqual([]);
    });

    test('脚本内容是合法 UTF-8（不带替换字符 U+FFFD，防「有 BOM 但文件已损坏」）', () => {
        const broken = scripts.filter((s) => s.text.includes('\uFFFD')).map((s) => s.file);
        expect(broken).toEqual([]);
    });

    test('关键运维脚本仍在扫描范围内（改名 / 挪目录由这条拦下）', () => {
        const scanned = scripts.map((s) => s.file);
        [
            'tools/ops/ops-publish.ps1',
            'tools/ops/ops-verify-pg.ps1',
            'tools/ops/ops-check-prod.ps1',
            'tools/ops/ops-start-dev.ps1',
            'tools/gui/gui-dev-console.ps1'
        ].forEach((p) => expect(scanned).toContain(p));
    });
});

describe('GUI 控制台的启动兜底（BOM 被编辑器抹掉时不至于打不开）', () => {
    const bat = fs.readFileSync(path.join(ROOT, 'tools/gui', 'EuriskoTax-Console.bat'), 'utf8');

    test('启动 bat 仍先做 BOM 自检再启动 GUI 脚本', () => {
        expect(bat).toMatch(/gui-dev-console\.ps1/);
        expect(bat).toMatch(/0xEF/);   // 自检里比对的 BOM 首字节
        expect(bat).toMatch(/-File/);  // 仍以脚本文件方式启动
    });
});
