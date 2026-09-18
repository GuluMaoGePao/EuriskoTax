// 测试辅助：加载源文件到当前上下文
// 由于项目源码使用浏览器全局变量（无 module.exports），
// 需通过 eval 将函数定义注入到测试环境

const fs = require('fs');
const path = require('path');

// 浏览器里由 index.html 的 <script> 顺序保证的加载次序，测试里得靠这张表复现。
// 写在这里而不是让 27 个测试文件各抄一遍：漏抄一个的表现是「只在这一条用例里炸」，排查成本远高于一张表。
const PREREQUISITES = {
    'src/js/calculation/tax-calculator.js': ['src/js/calculation/solver.js'],
    'src/js/calculation/net-salary-quick.js': ['src/js/calculation/solver.js'],
    'src/js/calculation/employer-cost-quick.js': ['src/js/calculation/solver.js']
};

// 只给「自动前置」的那一层去重，手写重复加载仍照原样 eval —— 避免悄悄改变既有测试的行为
const autoLoaded = new Set();

function evalSource(relativePath) {
    const fullPath = path.join(__dirname, '..', '..', relativePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    // 使用间接 eval 在全局作用域执行
    (0, eval)(code);
}

function loadSource(relativePath) {
    (PREREQUISITES[relativePath] || []).forEach(function (dependency) {
        if (autoLoaded.has(dependency)) return;
        autoLoaded.add(dependency);
        evalSource(dependency);
    });
    evalSource(relativePath);
}

module.exports = { loadSource, PREREQUISITES };
