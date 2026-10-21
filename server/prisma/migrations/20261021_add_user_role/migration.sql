-- v1.145.0：User.role —— 管理台从「一把静态令牌」改为「邮箱 + 密码登录」
--
-- 背景：管理台此前只认环境变量 ADMIN_TOKEN，请求头带上同一个字符串即为管理员。
--   这把令牌的问题不是强度，而是**不可分人、不可吊销**：
--     ① 它只有一把，给过谁、谁还留着，无从追溯；
--     ② 想换人就得改环境变量并重启，期间所有在线管理员一起掉线；
--     ③ 没有「这个人什么时候登录过」这回事 —— 出事查不到。
-- 方案：管理员定义为 role='admin' 的 User，登录走 /api/admin/login（邮箱 + 密码），
--   复用项目已有的 bcrypt 哈希与 token_version 吊销机制，签发的 JWT 带 scope='admin'
--   且**独立于 App 的 7 天令牌、默认 2 小时**——拿 App 的普通令牌进不了管理台。
-- 存量行默认 'user'：老用户不会因为这次迁移「自动变成管理员」，
--   管理员必须由运维脚本显式授予（tools/ops/ops-admin-user.js）。

-- AlterTable: User 新增角色
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
