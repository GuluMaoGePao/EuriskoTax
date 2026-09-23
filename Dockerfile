# 基础镜像源：Zeabur 等云端构建机从 Docker Hub 匿名拉取易被限流（HTTP 429），
# 默认走 DaoCloud 加速源规避；若构建机网络不通该源，可用
# --build-arg BASE_IMAGE=node:22-slim 回退官方源，或自行切换其它可用源。
ARG BASE_IMAGE=docker.m.daocloud.io/library/node:22-slim

# 构建阶段：安装依赖并生成 Prisma Client（Debian slim + OpenSSL，Prisma 引擎必需）
FROM ${BASE_IMAGE} AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma
RUN cd server && npm install
COPY . .

# 运行阶段：启动前自动执行数据库迁移
FROM ${BASE_IMAGE}
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
ENV PORT=3000
# 若平台（如 Zeabur）注入的 PORT 变量不是合法数字，本镜像默认值 3000 仍可兜底，
# 但平台级环境变量优先级高于 Dockerfile ENV，故控制台里也请保持 PORT=3000 或留空。
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node src/app.js"]
