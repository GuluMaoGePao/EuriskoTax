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
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node src/app.js"]
