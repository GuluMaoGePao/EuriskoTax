# 构建阶段：安装依赖并生成 Prisma Client
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma
RUN cd server && npm install
COPY . .

# 运行阶段：启动前自动执行数据库迁移
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node src/app.js"]
