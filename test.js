// 测试updateIncomeCalculation函数
function testUpdateIncomeCalculation() {
    console.log('Testing updateIncomeCalculation...');
    
    // 模拟输入值
    document.getElementById('salary-income').value = 10000;
    document.getElementById('labor-income').value = 50000;
    document.getElementById('author-income').value = 20000;
    document.getElementById('royalty-income').value = 10000;
    document.getElementById('bonus-income').value = 100000;
    document.getElementById('bonus-include').checked = true;
    document.getElementById('work-months').value = 12;
    
    // 调用函数
    updateIncomeCalculation();
    
    // 检查结果
    console.log('Monthly income amount:', document.getElementById('monthly-income-amount').textContent);
    console.log('Total income amount:', document.getElementById('total-income-amount').textContent);
    
    // 测试工作月数变化
    console.log('\nTesting work months change...');
    document.getElementById('work-months').value = 6;
    updateIncomeCalculation();
    console.log('Monthly income amount (6 months):', document.getElementById('monthly-income-amount').textContent);
    console.log('Total income amount (6 months):', document.getElementById('total-income-amount').textContent);
}

// 运行测试
testUpdateIncomeCalculation();
