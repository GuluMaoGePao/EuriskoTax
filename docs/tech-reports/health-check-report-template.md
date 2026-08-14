# EuriskoTax 部署后健康检查报告

> 部署后使用此模板进行系统健康检查，确认服务状态、日志健康和资源占用正常。

| 项目 | 值 |
|------|-----|
| 报告日期 | YYYY-MM-DD HH:mm:ss |
| 检查人 | _________ |
| 服务器地址 | _________ |
| 部署版本 | release-YYYYMMDD-HHMMSS |
| 部署方式 | PM2 / systemd / nohup |
| 上次部署时间 | YYYY-MM-DD HH:mm:ss |

---

## 一、服务状态检查

### 1.1 进程状态

| 检查项 | 期望值 | 实际值 | 结果 |
|--------|--------|--------|------|
| 进程名称 | euriskotax | _________ | ✅ / ❌ |
| 进程状态 | online / running | _________ | ✅ / ❌ |
| 运行时长 | > 60s | _________ | ✅ / ❌ |
| 重启次数 | 0（部署后） | _________ | ✅ / ❌ |
| PID | - | _________ | - |

**检查命令（PM2）**：
```bash
ssh user@host "pm2 describe euriskotax"
ssh user@host "pm2 list"
```

**检查命令（systemd）**：
```bash
ssh user@host "systemctl status euriskotax"
```

### 1.2 端口监听

| 检查项 | 期望值 | 实际值 | 结果 |
|--------|--------|--------|------|
| 监听端口 | 3000 | _________ | ✅ / ❌ |
| 监听地址 | 0.0.0.0 或 127.0.0.1 | _________ | ✅ / ❌ |
| 端口冲突 | 无 | _________ | ✅ / ❌ |

**检查命令**：
```bash
ssh user@host "ss -tlnp | grep 3000"
ssh user@host "netstat -tlnp | grep 3000"
```

### 1.3 HTTP 响应

| 检查项 | 期望值 | 实际值 | 结果 |
|--------|--------|--------|------|
| 首页 (/) | 200 | _________ | ✅ / ❌ |
| 健康检查 (/api/auth/profile) | 401（未认证） | _________ | ✅ / ❌ |
| 响应时间 | < 500ms | _________ms | ✅ / ❌ |
| SSL 证书（如启用） | 有效 | _________ | ✅ / ❌ |

**检查命令**：
```bash
# 本地检查
curl -s -o /dev/null -w "HTTP %{http_code} | %{time_total}s\n" http://host:3000/
curl -s -o /dev/null -w "HTTP %{http_code} | %{time_total}s\n" http://host:3000/api/auth/profile

# 服务器端检查
ssh user@host "curl -s -o /dev/null -w 'HTTP %{http_code} | %{time_total}s\n' http://127.0.0.1:3000/"
```

---

## 二、日志分析

### 2.1 应用日志统计

| 日志级别 | 期望值 | 实际数量 | 结果 |
|---------|--------|---------|------|
| ERROR | 0 | _________ | ✅ / ❌ |
| WARN | < 10 | _________ | ✅ / ❌ |
| INFO | 正常输出 | _________ | - |
| 崩溃/异常退出 | 0 | _________ | ✅ / ❌ |

**检查时间范围**：部署后 _____ 分钟内

**检查命令**：
```bash
# PM2 日志（最近 100 行）
ssh user@host "pm2 logs euriskotax --lines 100 --nostream"

# 错误日志统计
ssh user@host "pm2 logs euriskotax --lines 1000 --nostream | grep -c 'ERROR'"
ssh user@host "pm2 logs euriskotax --lines 1000 --nostream | grep -c 'WARN'"

# 未捕获的异常
ssh user@host "pm2 logs euriskotax --lines 1000 --nostream | grep -i 'uncaught\|unhandled'"
```

### 2.2 关键事件时间线

| 时间 | 事件类型 | 详情 | 严重程度 |
|------|---------|------|---------|
| HH:mm:ss | 启动/错误/警告 | _________ | 高/中/低 |
| HH:mm:ss | _________ | _________ | _________ |
| HH:mm:ss | _________ | _________ | _________ |

### 2.3 访问日志分析（如启用）

| 指标 | 值 | 说明 |
|------|-----|------|
| 总请求数 | _________ | 部署后 |
| 2xx 响应数 | _________ | 成功请求 |
| 4xx 响应数 | _________ | 客户端错误 |
| 5xx 响应数 | _________ | 服务器错误 |
| 平均响应时间 | _________ms | - |
| 最慢请求 | _________ms | URL: _________ |

---

## 三、资源占用

### 3.1 系统资源概览

| 指标 | 期望值 | 实际值 | 结果 |
|------|--------|--------|------|
| CPU 使用率 | < 70% | _________% | ✅ / ❌ |
| 内存使用率 | < 80% | _________% | ✅ / ❌ |
| 磁盘使用率 | < 85% | _________% | ✅ / ❌ |
| 系统负载 (1min) | < CPU 核心数 | _________ | ✅ / ❌ |
| 可用内存 | > 512MB | _________MB | ✅ / ❌ |

**检查命令**：
```bash
ssh user@host "top -bn1 | head -5"
ssh user@host "free -m"
ssh user@host "df -h /"
ssh user@host "uptime"
```

### 3.2 Node.js 进程资源

| 指标 | 期望值 | 实际值 | 结果 |
|------|--------|--------|------|
| CPU 占用 | < 50% | _________% | ✅ / ❌ |
| 内存占用 (RSS) | < 512MB | _________MB | ✅ / ❌ |
| 堆内存使用 | < 256MB | _________MB | ✅ / ❌ |
| 事件循环延迟 | < 50ms | _________ms | ✅ / ❌ |
| 活跃句柄数 | < 100 | _________ | ✅ / ❌ |

**检查命令**：
```bash
# PM2 监控
ssh user@host "pm2 monit"
ssh user@host "pm2 describe euriskotax | grep -E 'memory|cpu|uptime|restarts'"

# 进程详情
ssh user@host "ps aux | grep 'node src/app.js' | grep -v grep"
```

### 3.3 磁盘 I/O 与空间

| 路径 | 挂载点 | 总量 | 已用 | 可用 | 使用率 |
|------|--------|------|------|------|--------|
| 项目目录 | /opt/euriskotax | _________ | _________ | _________ | _________% |
| 日志目录 | /var/log | _________ | _________ | _________ | _________% |
| 数据库 | /opt/euriskotax/current/server | _________ | _________ | _________ | _________% |
| 临时文件 | /tmp | _________ | _________ | _________ | _________% |

**检查命令**：
```bash
ssh user@host "df -h"
ssh user@host "du -sh /opt/euriskotax/releases/*"
ssh user@host "du -sh /opt/euriskotax/current/server/prisma/*.db"
```

### 3.4 网络状态

| 指标 | 期望值 | 实际值 | 结果 |
|------|--------|--------|------|
| 已建立连接数 | < 100 | _________ | ✅ / ❌ |
| TIME_WAIT 连接 | < 200 | _________ | ✅ / ❌ |
| 监听端口数 | 1-2 | _________ | ✅ / ❌ |
| 网络丢包率 | < 1% | _________% | ✅ / ❌ |

**检查命令**：
```bash
ssh user@host "ss -s"
ssh user@host "ss -tn state established | wc -l"
ssh user@host "ss -tn state time-wait | wc -l"
```

---

## 四、数据库状态

### 4.1 连接状态

| 检查项 | 期望值 | 实际值 | 结果 |
|--------|--------|--------|------|
| 数据库文件存在 | ✅ | _________ | ✅ / ❌ |
| 数据库可读 | ✅ | _________ | ✅ / ❌ |
| 数据库可写 | ✅ | _________ | ✅ / ❌ |
| 迁移已应用 | 最新版本 | _________ | ✅ / ❌ |
| 连接池状态 | 正常 | _________ | ✅ / ❌ |

**检查命令**：
```bash
# 检查数据库文件
ssh user@host "ls -lh /opt/euriskotax/current/server/prisma/*.db"

# 检查迁移状态
ssh user@host "cd /opt/euriskotax/current/server && npx prisma migrate status"

# 测试数据库读写
ssh user@host "cd /opt/euriskotax/current/server && node -e \"
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$queryRaw('SELECT 1 as ok').then(r => { console.log('DB OK:', r); process.exit(0); }).catch(e => { console.error('DB FAIL:', e.message); process.exit(1); });
\""
```

### 4.2 数据库大小

| 表名 | 记录数 | 大小 | 说明 |
|------|--------|------|------|
| User | _________ | _________KB | 用户表 |
| Calculation | _________ | _________KB | 计算记录表 |
| _________ | _________ | _________ | _________ |

---

## 五、安全检查

| 检查项 | 期望值 | 实际值 | 结果 |
|--------|--------|--------|------|
| .env 文件权限 | 600 | _________ | ✅ / ❌ |
| .env.shared 不对外暴露 | ✅ | _________ | ✅ / ❌ |
| JWT_SECRET 已设置 | ✅（非默认值） | _________ | ✅ / ❌ |
| 防火墙启用 | ufw/iptables | _________ | ✅ / ❌ |
| 仅必要端口开放 | 22, 3000, 80/443 | _________ | ✅ / ❌ |
| SSH 禁止 root 登录（建议） | PermitRootLogin no | _________ | ⚠️ |
| fail2ban 运行中（建议） | active | _________ | ⚠️ |

**检查命令**：
```bash
# 文件权限
ssh user@host "ls -la /opt/euriskotax/.env.shared /opt/euriskotax/current/server/.env"

# 防火墙状态
ssh user@host "ufw status"         # Ubuntu/Debian
ssh user@host "iptables -L -n"     # 通用

# 开放端口
ssh user@host "ss -tlnp"

# SSH 配置
ssh user@host "grep PermitRootLogin /etc/ssh/sshd_config"

# fail2ban 状态
ssh user@host "systemctl status fail2ban"
```

---

## 六、部署版本信息

| 检查项 | 值 |
|--------|-----|
| current 软链接指向 | _________ |
| 部署时间戳 | _________ |
| 保留的版本数 | _________ |
| Node.js 版本 | _________ |
| npm 版本 | _________ |
| PM2 版本 | _________ |
| 操作系统 | _________ |
| 内核版本 | _________ |

**检查命令**：
```bash
ssh user@host "readlink /opt/euriskotax/current"
ssh user@host "ls -lt /opt/euriskotax/releases/"
ssh user@host "node -v && npm -v && pm2 -v"
ssh user@host "uname -a"
```

---

## 七、结论与建议

### 7.1 总体状态

| 维度 | 状态 | 说明 |
|------|------|------|
| 服务状态 | ✅ 正常 / ❌ 异常 | _________ |
| 日志健康 | ✅ 正常 / ⚠️ 警告 / ❌ 异常 | _________ |
| 资源占用 | ✅ 正常 / ⚠️ 偏高 / ❌ 不足 | _________ |
| 数据库状态 | ✅ 正常 / ❌ 异常 | _________ |
| 安全状态 | ✅ 正常 / ⚠️ 待优化 / ❌ 风险 | _________ |

**总体结论**: ✅ 部署成功，服务运行正常 / ⚠️ 部分指标需关注 / ❌ 存在问题需处理

### 7.2 发现的问题

| 编号 | 问题描述 | 严重程度 | 建议处理方式 |
|------|---------|---------|-------------|
| 1 | _________ | 高/中/低 | _________ |
| 2 | _________ | 高/中/低 | _________ |

### 7.3 优化建议

| 编号 | 建议内容 | 优先级 | 计划处理时间 |
|------|---------|--------|-------------|
| 1 | _________ | 高/中/低 | _________ |
| 2 | _________ | 高/中/低 | _________ |

---

## 八、附录：一键健康检查脚本

> 将以下命令保存为 `scripts/health-check.sh`，在服务器上执行可快速获取大部分指标。

```bash
#!/bin/bash
# EuriskoTax 服务器健康检查脚本
# 用法: ssh user@host 'bash -s' < scripts/health-check.sh

echo "========================================"
echo "  EuriskoTax 健康检查 $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

echo "--- 1. 系统信息 ---"
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime -p)"
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo ""

echo "--- 2. 资源使用 ---"
echo "CPU 使用率: $(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')%"
echo "内存: $(free -m | awk '/Mem:/{printf "%dMB / %dMB (%.1f%%)", $3, $2, $3/$2*100}')"
echo "磁盘: $(df -h / | awk 'NR==2{printf "%s / %s (%s)", $3, $2, $5}')"
echo "负载: $(cat /proc/loadavg | awk '{print $1, $2, $3}')"
echo ""

echo "--- 3. Node.js 进程 ---"
if command -v pm2 &> /dev/null; then
    pm2 list 2>/dev/null
    echo ""
    echo "进程详情:"
    pm2 describe euriskotax 2>/dev/null | grep -E 'status|uptime|restarts|memory|cpu' || echo "  (euriskotax 进程未找到)"
else
    echo "PM2 未安装"
    ps aux | grep 'node src/app.js' | grep -v grep || echo "  (node 进程未找到)"
fi
echo ""

echo "--- 4. 端口监听 ---"
ss -tlnp | grep -E '3000|80|443' || echo "  (未找到监听端口)"
echo ""

echo "--- 5. HTTP 检查 ---"
resp=$(curl -s -o /dev/null -w '%{http_code}|%{time_total}' http://127.0.0.1:3000/ 2>/dev/null)
if [ -n "$resp" ] && [ "$resp" != "000|0.000000" ]; then
    code=$(echo $resp | cut -d'|' -f1)
    time=$(echo $resp | cut -d'|' -f2)
    echo "首页: HTTP $code (${time}s)"
else
    echo "首页: 无法连接"
fi
resp2=$(curl -s -o /dev/null -w '%{http_code}|%{time_total}' http://127.0.0.1:3000/api/auth/profile 2>/dev/null)
if [ -n "$resp2" ] && [ "$resp2" != "000|0.000000" ]; then
    code2=$(echo $resp2 | cut -d'|' -f1)
    time2=$(echo $resp2 | cut -d'|' -f2)
    echo "API: HTTP $code2 (${time2}s)"
else
    echo "API: 无法连接"
fi
echo ""

echo "--- 6. 数据库 ---"
DB_PATH="/opt/euriskotax/current/server/prisma/dev.db"
if [ -f "$DB_PATH" ]; then
    echo "数据库文件: $(ls -lh $DB_PATH | awk '{print $5}')"
    echo "数据库大小: $(du -sh $DB_PATH | awk '{print $1}')"
else
    echo "数据库文件未找到: $DB_PATH"
fi
echo ""

echo "--- 7. 部署版本 ---"
if [ -L /opt/euriskotax/current ]; then
    echo "当前版本: $(readlink /opt/euriskotax/current)"
    echo "版本列表:"
    ls -lt /opt/euriskotax/releases/ 2>/dev/null | head -6
else
    echo "current 软链接未找到"
fi
echo ""

echo "--- 8. 安全检查 ---"
if [ -f /opt/euriskotax/.env.shared ]; then
    echo ".env.shared 权限: $(stat -c '%a' /opt/euriskotax/.env.shared)"
else
    echo ".env.shared 未找到"
fi
echo "开放端口:"
ss -tlnp | awk 'NR>1{print $4}' | cut -d: -f2 | sort -un
echo ""

echo "========================================"
echo "  检查完成"
echo "========================================"
```

---

| 签字 | 日期 |
|------|------|
| 检查人: _________ | YYYY-MM-DD |
| 复核人: _________ | YYYY-MM-DD |
