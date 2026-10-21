-- v1.144.0：登录态版本号（User.token_version）用于「立即吊销已签发 JWT」
--
-- 背景：JWT 是无状态令牌，一旦签发出去，在 exp（默认 7d）之前无法收回。
--   这导致三处断口：① 重置密码后旧会话仍能调通所有受保护接口；
--   ② 改密码后旧设备不掉线；③ 退出登录只清了本浏览器，别的设备照样能用。
-- 方案：用户行上挂一个自增版本号，签发时写进 payload（tv），中间件每次比对。
--   改密 / 重置 / 退出时 +1，于是「这一刻之前签出的所有 token」一次性全部失效。
-- 为什么不选别的：
--   - token 黑名单要 Redis / 一张新表，且每次鉴权多一次查表；
--   - Refresh Token 要改前端整套会话管理，还引入轮换语义；
--   - token_version 只在「查用户」这一步顺带带出来（中间件本来就要查 User），零额外查询。

-- AlterTable: User 新增登录态版本号
ALTER TABLE "User" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
