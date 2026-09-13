#!/usr/bin/env node
/**
 * 本机测试账号读取 —— 凭据不写进仓库
 *
 * 背景：开发环境用的测试账号常常就是「本机自己的邮箱 / 密码」，这种凭据一旦提交就等于
 * 随仓库一起公开（远端、镜像、历史记录都能翻到）。所以：
 *   - 仓库里只保留一份**可用的默认账号**（下 DEFAULT_DEV_ACCOUNT，由
 *     reset-dev-user.js / verify:local 自动创建，任何一台机器 clone 下来都能跑通门禁）
 *   - 本机想用别的账号，就在仓库根目录放一个 `dev-account.local.json`（已在 .gitignore）：
 *
 *       { "email": "you@example.com", "password": "your-local-password", "username": "devuser" }
 *
 * 读取方（都走本模块 / 它的 PowerShell 孪生兄弟 tools/ops/dev-account.ps1，避免两份事实）：
 *   - server/scripts/reset-dev-user.js   重置本地测试账号
 *   - server/scripts/verify-local-auth.js 门禁登录用的账号
 *   - 登录页「开发环境：填入本地测试账号」预填（前端运行时拉 /dev-account.local.json）
 *   - tools/ops/get-token.ps1、debug-swagger*.ps1、ops-start-dev.ps1、GUI 控制台复制按钮
 *
 * 覆盖文件缺失 → 回落默认账号；覆盖文件存在但写坏了 → 直接抛错（不能悄悄用默认账号，
 * 否则「换了账号却没生效」会被误当成链路故障）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

// 仓库默认账号：必须是「任何机器都能用」的占位值，不要放本机真实凭据
const DEFAULT_DEV_ACCOUNT = Object.freeze({
    email: 'dev@example.com',
    password: 'password',
    username: 'devuser',
});

// 仓库根（本文件在 server/scripts/ 下）
const OVERRIDE_FILE = path.join(__dirname, '..', '..', 'dev-account.local.json');

/**
 * 读取本机测试账号
 * @returns {{ email: string, password: string, username: string, source: string }}
 *          source = 'default' 表示用的是仓库默认账号，否则是覆盖文件绝对路径
 */
const loadDevAccount = () => {
    if (!fs.existsSync(OVERRIDE_FILE)) {
        return { ...DEFAULT_DEV_ACCOUNT, source: 'default' };
    }
    let cfg;
    try {
        cfg = JSON.parse(fs.readFileSync(OVERRIDE_FILE, 'utf8'));
    } catch (e) {
        throw new Error(`本机测试账号文件解析失败（${OVERRIDE_FILE}）：${e.message}`);
    }
    if (!cfg || !cfg.email || !cfg.password) {
        throw new Error(`本机测试账号文件缺 email / password 字段：${OVERRIDE_FILE}`);
    }
    return {
        email: String(cfg.email),
        password: String(cfg.password),
        username: cfg.username ? String(cfg.username) : DEFAULT_DEV_ACCOUNT.username,
        source: OVERRIDE_FILE,
    };
};

module.exports = { loadDevAccount, DEFAULT_DEV_ACCOUNT, OVERRIDE_FILE };
