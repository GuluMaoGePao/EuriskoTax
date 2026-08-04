// 性能基准测试
// 通过 Node.js 直接加载 tax-calculator.js 中的纯函数进行性能测量
// 由于 tax-calculator.js 依赖 document，此处采用 vm 沙箱 + mock 方式加载

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

// 创建 mock 环境
function createSandbox() {
    const store = {};
    const elementCache = {};
    const mockElement = (id, props = {}) => ({
        value: props.value || '',
        checked: props.checked || false,
        textContent: props.textContent || '',
        innerHTML: props.innerHTML || '',
        className: props.className || '',
        classList: {
            add() {}, remove() {}, contains() { return false; }, toggle() {}
        },
        closest() { return mockElement(id, props); },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        appendChild() {},
        style: {},
        ...props
    });

    const sandbox = {
        console: { log() {}, error: console.error, warn: console.warn },
        localStorage: {
            getItem(k) { return store[k] || null; },
            setItem(k, v) { store[k] = String(v); },
            removeItem(k) { delete store[k]; },
            clear() { Object.keys(store).forEach(k => delete store[k]); }
        },
        document: {
            getElementById(id) {
                if (!elementCache[id]) elementCache[id] = mockElement(id);
                return elementCache[id];
            },
            querySelector() { return mockElement('qs'); },
            querySelectorAll() { return []; },
            createElement() { return mockElement('ce'); },
            addEventListener() {}
        },
        window: {},
        isNaN,
        parseInt,
        parseFloat,
        Math,
        Date,
        Infinity,
        Number,
        Array,
        Object,
        JSON,
        RegExp,
        String,
        Boolean,
        Set,
        Map,
        Error,
        performance
    };
    sandbox.window.localStorage = sandbox.localStorage;
    sandbox.global = sandbox;
    return sandbox;
}

// 加载 tax-calculator.js
function loadCalculator() {
    const filePath = path.join(__dirname, '..', '..', 'src', 'js', 'calculation', 'tax-calculator.js');
    const code = fs.readFileSync(filePath, 'utf8');
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'tax-calculator.js' });
    return sandbox;
}

// 性能测量工具
function measure(name, fn, iterations = 10000) {
    // 预热
    for (let i = 0; i < 100; i++) fn();

    // 测量
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        fn();
    }
    const end = performance.now();
    const totalMs = end - start;
    const avgUs = (totalMs / iterations) * 1000;
    return { name, iterations, totalMs, avgUs };
}

// 主程序
function main() {
    console.log('===== EuriskoTax 性能基准测试 =====');
    console.log('');

    const sandbox = loadCalculator();

    // 测试用例
    const tests = [
        {
            name: 'checkTaxBracketThreshold（接近临界点）',
            fn: () => sandbox.checkTaxBracketThreshold(35000)
        },
        {
            name: 'checkTaxBracketThreshold（远离临界点）',
            fn: () => sandbox.checkTaxBracketThreshold(100000)
        },
        {
            name: 'calculateOptimalBonusAllocation（中收入）',
            fn: () => sandbox.calculateOptimalBonusAllocation(300000, 60000)
        },
        {
            name: 'calculateOptimalBonusAllocation（高收入）',
            fn: () => sandbox.calculateOptimalBonusAllocation(1000000, 60000)
        },
        {
            name: 'validateCharitableDonation（正常）',
            fn: () => sandbox.validateCharitableDonation(5000, 100000)
        },
        {
            name: 'validateCharitableDonation（超额）',
            fn: () => sandbox.validateCharitableDonation(50000, 100000)
        },
        {
            name: 'calculateOtherIncome（三项所得）',
            fn: () => sandbox.calculateOtherIncome(50000, 30000, 20000)
        },
        {
            name: 'calculateBonusTax（单独计税）',
            fn: () => sandbox.calculateBonusTax(50000, false)
        },
        {
            name: 'calculateCumulativePrepaidTax（12个月）',
            fn: () => sandbox.calculateCumulativePrepaidTax(12, 20000, 5000, 3000, 2000, 1000, 500, 200, 100)
        },
        {
            name: 'calculateTotalIncome（综合所得）',
            fn: () => sandbox.calculateTotalIncome(20000, 12, {
                laborTaxableIncome: 40000,
                authorTaxableIncome: 20000,
                royaltyTaxableIncome: 15000
            }, 50000, true)
        }
    ];

    console.log('测试项                                            迭代次数    总耗时(ms)    平均(μs)');
    console.log('-'.repeat(95));

    const results = [];
    for (const test of tests) {
        const result = measure(test.name, test.fn, 10000);
        results.push(result);
        console.log(
            result.name.padEnd(48) +
            String(result.iterations).padStart(10) +
            result.totalMs.toFixed(2).padStart(14) +
            result.avgUs.toFixed(3).padStart(12)
        );
    }

    console.log('');
    console.log('===== 性能总结 =====');
    const totalAvgUs = results.reduce((sum, r) => sum + r.avgUs, 0);
    console.log(`所有函数平均耗时合计: ${totalAvgUs.toFixed(3)} μs`);
    console.log(`最快函数: ${results.reduce((a, b) => a.avgUs < b.avgUs ? a : b).name}`);
    console.log(`最慢函数: ${results.reduce((a, b) => a.avgUs > b.avgUs ? a : b).name}`);

    return results;
}

main();
