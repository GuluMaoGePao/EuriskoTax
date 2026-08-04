// 测试辅助：加载源文件到当前上下文
// 由于项目源码使用浏览器全局变量（无 module.exports），
// 需通过 eval 将函数定义注入到测试环境

const fs = require('fs');
const path = require('path');

function loadSource(relativePath) {
    const fullPath = path.join(__dirname, '..', '..', relativePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    // 使用间接 eval 在全局作用域执行
    (0, eval)(code);
}

module.exports = { loadSource };
