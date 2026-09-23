# 腾讯云轻量服务器部署与迁移手册（Zeabur → 上海轻量）

> 适用：腾讯云轻量应用服务器（Docker CE 镜像，上海），部署包 `deploy/lighthouse/`。
> 背景：ICP 备案在腾讯云接入，备案要求域名解析指向境内服务器；Zeabur（东京）保留为过渡/预览环境。

## 0. 服务器与凭据

| 项 | 值 |
|---|---|
| 服务器 | 腾讯云轻量 euriskotax-sh（上海，Docker CE 镜像） |
| 登录 | SSH 密钥 `euriskoTax_ssh`（私钥放本机 `~/.ssh/euriskoTax_ssh`） |
| 部署目录 | `/opt/euriskotax` |
| 端口 | 80/443/22（轻量防火墙需放行 80、443） |

## 1. 首次部署（三条命令）

本机（PowerShell，仓库根）：

```powershell
# ① 上传 env 模板
scp -i $env:USERPROFILE\.ssh\euriskoTax_ssh deploy/lighthouse/.env.example root@<公网IP>:/tmp/

# ② 服务器上初始化（填密钥）
ssh -i $env:USERPROFILE\.ssh\euriskoTax_ssh root@<公网IP>
mkdir -p /opt/euriskotax/deploy/lighthouse
mv /tmp/.env.example /opt/euriskotax/deploy/lighthouse/.env
cd /opt/euriskotax/deploy/lighthouse
openssl rand -hex 32   # 生成两次：一次填 POSTGRES_PASSWORD，一次填 JWT_SECRET
vim .env               # 填 POSTGRES_PASSWORD / JWT_SECRET / ADMIN_TOKEN（与 Zeabur 现值一致）

# ③ 本机一条命令部署
powershell -File tools/ops/deploy-lighthouse.ps1 -ServerIp <公网IP>
```

成功标志：脚本末尾输出 `[4/4] /health = 200`，浏览器访问 `http://<公网IP>/` 看到首页。

## 2. 镜像拉取慢/失败（境内网络）

Dockerfile 基础镜像走 DaoCloud 源（境内可达）。`postgres:16-alpine`、`nginx:alpine` 走 Docker Hub，
Docker CE 镜像一般已预配腾讯云加速；若拉取超时，服务器上检查：

```bash
cat /etc/docker/daemon.json    # 应含 registry-mirrors（如 https://mirror.ccs.tencentyun.com）
# 没有则补上后：systemctl restart docker
```

## 3. 老数据迁移（Zeabur PostgreSQL → 轻量）

> 顺序很重要：**先导数据、后起 app**。app 启动会跑 `prisma migrate deploy` 建表；
> 数据先导进去（含完整 schema），app 启动时发现表已存在即跳过，两种顺序都不会错，但先导数据最稳。

```bash
# ① 在轻量服务器上起一个临时客户端容器，直连 Zeabur 导出并导入
#    SRC = Zeabur 控制台里数据库的连接串（可在 Zeabur 数据库页找到）
SRC="postgres://<用户>:<密码>@<Zeabur数据库地址>/<库名>"
DST="postgres://eurisko:<.env里的POSTGRES_PASSWORD>@127.0.0.1:5432/euriskotax"
#    临时把 db 端口映射到本机（跑完删掉）：
docker run -d --rm --name tmp-pg -p 127.0.0.1:5432:5432 \
  -v euriskotax_pg_data:/var/lib/postgresql/data postgres:16-alpine   # 复用数据卷，不要新库！

#    ↑ 注意：如果 compose 里 db 已经在跑，上面这步跳过，直接用容器名连：
DST="postgres://eurisko:<密码>@db:5432/euriskotax"

# ② 导出→导入（一条管道完成，--no-owner 避免角色不一致）
docker run --rm postgres:16-alpine sh -c \
  "pg_dump --no-owner --no-privileges -Fc '$SRC' | pg_restore --no-owner --no-privileges --clean --if-exists -d '$DST'"
```

**验证**：进 admin 后台看兑换码/留资记录是否齐全；`docker compose ... exec db psql -U eurisko -d euriskotax -c '\dt'` 应有 prisma 各表。

**注意**：Zeabur 数据库公网是否可达需在 Zeabur 控制台确认；不可达时先在本机 `pg_dump -Fc -f dump.bak`，把 dump.bak scp 上服务器再 `pg_restore`。

## 4. 例行运维（轻量上与 Zeabur 的差别）

| 事项 | 命令 |
|---|---|
| 看应用日志 | `docker compose -f deploy/lighthouse/docker-compose.yml logs --tail 100 app` |
| 重启应用 | `... up -d --force-recreate app` |
| 更新代码 | 本机重跑 `tools/ops/deploy-lighthouse.ps1 -ServerIp <IP>` |
| 备份数据库 | `... exec db pg_dump -U eurisko -Fc euriskotax > backup_$(date +%F).dump`（建议 crontab 每日 + scp 到本机/OSS） |
| 证书续期 | certbot webroot 模式，`... --profile tls run --rm certbot renew`（可 crontab 每月） |

## 5. 备案通过后的切换日（一次跑完）

1. **挂号**：备案号填进 `src/js/ui/site-filing-ui.js` 的 `icpNumber`，全站页脚生效；发版
2. **DNS**：腾讯云「域名解析」加 A 记录 `@ → 轻量公网IP`（此前不要加）
3. **证书**：服务器上跑 compose 里 certbot 命令签发（见 docker-compose.yml 注释），取消 `nginx/default.conf` 里 443 块注释并重载
4. **收紧 CORS**：`deploy/lighthouse/.env` 里 `CORS_ORIGIN=https://euriskotax.com`，`docker compose up -d` 重建 app
5. **切 canonical**：本机 `powershell -File tools/ops/set-canonical-domain.ps1 -Apply`（85 处一次切），跑全量测试、发布
6. **Zeabur**：`CORS_ORIGIN` 同步加 `https://euriskotax.com`；确认旧域名 301 到新域（Zeabur 设 primary domain）

## 6. 回滚

- **应用回滚**：本机 `git checkout <上一个tag> && powershell -File tools/ops/deploy-lighthouse.ps1 ...`
- **数据库回滚**：用最近的 `backup_*.dump` `pg_restore --clean --if-exists`
- **域名回滚**：DNS A 记录改回原值（TTL 600，10 分钟内生效）

## 7. 上线核对清单

- [ ] `http://<IP>/health` 返回 200
- [ ] 首页、3 个抽样落地页、admin 后台可访问
- [ ] 留资表单提交成功且 admin 能看到
- [ ] 数据迁移后兑换码数量与 Zeabur 一致
- [ ] 轻量防火墙只放行 22/80/443，**5432 未对公网开放**
- [ ] `deploy/lighthouse/.env` 权限 `chmod 600`
- [ ] 数据库每日备份 cron 生效且备份文件实际存在
- [ ] 备案号在页脚可见（切换日后）
