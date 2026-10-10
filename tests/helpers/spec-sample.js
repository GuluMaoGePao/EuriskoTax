/**
 * 测试基线：一份「用户填过了」的输入（tests/helpers/spec-sample.js）
 *
 * 为什么需要它（v1.138.0）：速算器与完整测算的金额预填**全部归零**了 —— 用户没输就是 0，
 * 产品不该替用户先填一个数。原先的示例值（月薪 30000、年终奖 36000…）并没有丢，它们留在
 * 字段的 `sample` 上，作为**测试与演示的基线**：
 *
 *   - 产品渲染读 `default`（0）—— 用户看到的是空表单；
 *   - 测试要一组「填过了」的输入来钉住金额断言，读 `sample ?? default`。
 *
 * 没有这层，测试就会把「默认值」当成用例数据：默认值一改，一片断言同时变红，而它们红的
 * 原因跟被测逻辑毫无关系。
 */
function sampleValues(fields) {
    const v = {};
    (fields || []).forEach((f) => { v[f.key] = (f.sample !== undefined ? f.sample : f.default); });
    return v;
}

function sampleOf(toolOrId) {
    const R = window.EuriskoToolRegistry;
    if (!R || typeof R.get !== 'function') return {};
    const tool = typeof toolOrId === 'string' ? R.get(toolOrId) : toolOrId;
    return tool ? sampleValues(tool.fields) : {};
}

module.exports = { sampleValues, sampleOf };
