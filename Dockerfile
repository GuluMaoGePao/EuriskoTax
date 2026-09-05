# 构建阶段：安装依赖并生成 Prisma Client（Debian slim + OpenSSL，Prisma 引擎必需）
FROM node:22-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma
RUN cd server && npm install
COPY . .

# 运行阶段：启动前自动执行数据库迁移
FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node src/app.js"]
