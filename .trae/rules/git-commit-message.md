---
alwaysApply: true
scene: git_message
---

# EuriskoTax Git 提交信息规范

## 提交类型

| 类型 | 说明 | 示例 |
|------|------|------|
| feat | 新增功能 | feat: 添加社保基数验证功能 |
| fix | 修复问题 | fix: 修复反向倒算均衡模式计算错误 |
| docs | 更新文档 | docs: 更新计税规则手册 |
| style | 代码格式 | style: 优化代码缩进和空格 |
| refactor | 代码重构 | refactor: 重构综合所得计算函数 |
| perf | 性能优化 | perf: 优化二分法搜索效率 |
| test | 添加测试 | test: 添加经营所得计算测试用例 |
| chore | 构建/工具 | chore: 更新依赖包版本 |

## 提交信息格式

```
<类型>(<模块>): <简短描述>

<详细说明（可选）>

<关联的Issue或PR编号（可选）>
```

## 示例

```
feat(security): 添加社保基数验证功能

- 新增validateSocialSecurityBase函数，验证基数是否低于最低标准
- 添加红色警告提示，当基数低于4250元时显示
- 在input事件中绑定验证函数

Closes #123
```

```
fix(reverse): 修复按目标税额倒算均衡模式计算错误

- 均衡模式改为使用二分法计算的基准值，而非档位中间值
- 修复taxDifference字段在到手金额模式下显示无意义值的问题
- 涉及函数：calculateFromTargetTax, calculateBusinessFromTargetTax
```

## 注意事项

1. 提交信息使用中文
2. 简短描述不超过50个字符
3. 详细说明使用列表格式
4. 关联Issue时使用 `Closes #编号` 格式
