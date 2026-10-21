-- v1.146.0：工作人员账号独立成表（AdminUser）
--
-- 背景：v1.145.0 把管理员做成 User.role='admin'，管理台因此第一次有了「按人登录」。
--   但工作人员是**多个人**，而 User 是客户表，两者混在一张表里立刻暴露三处问题：
--     ① 客户列表混进工作人员 —— listUsers 的 where 没有排除 role，
--        管理员自己出现在「用户」Tab 里，还能被改 plan（v1.145.0 实测到的回归）；
--     ② 工作人员继承了 plan / 兑换码 / 计算记录这些客户字段，语义是错的；
--     ③ 工作人员能用同一个账号登录客户端 App —— 内部账号不该有客户端身份。
-- 方案：独立 AdminUser 表。客户表只装客户，工作人员的密码策略、吊销、审计各自独立。
--
-- User.role 保留但不删：列里已有存量值，且 DROP COLUMN 在 SQLite 上要 3.35+，
--   为兼容本地 dev 环境不做删除；代码侧已不再把它当权限判据（见 adminAuth.js）。

-- CreateTable: 工作人员账号
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'support',
    "status" TEXT NOT NULL DEFAULT 'active',
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 登录按邮箱查，唯一约束即索引
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
