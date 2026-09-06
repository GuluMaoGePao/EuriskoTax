require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const rateLimit = require('express-rate-limit');

const logger = require('./middleware/logger');
const { errorHandler, notFound } = require('./middleware/error');
const authRoutes = require('./routes/auth');
const calculationRoutes = require('./routes/calculations');
const feedbackRoutes = require('./routes/feedback');
const statsRoutes = require('./routes/stats');

// 生产环境安全校验
if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-random-secret-key') {
        console.error('FATAL: JWT_SECRET must be set to a strong key in production');
        process.exit(1);
    }
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('dev.db')) {
        console.error('FATAL: DATABASE_URL must point to PostgreSQL in production');
        process.exit(1);
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

// 信任 Zeabur 网关的一层反代，使 req.ip 为真实客户端IP
// 否则限流会把所有用户算作同一个网关IP，10次/15分钟的配额被全站共享
app.set('trust proxy', 1);

// 速率限制（防止暴力枚举登录）
// send-code（验证码发送）单独走 codeLimiter，不占用此配额
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skip: (req) => req.path === '/send-code',
    message: { error: '请求过于频繁，请 15 分钟后再试' }
});

// 验证码发送限流：5 次/15 分钟/IP（防邮件轰炸滥用）
const codeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skip: (req) => req.path !== '/send-code',
    message: {
        success: false,
        error: { message: '验证码发送过于频繁，请 15 分钟后再试', statusCode: 429 }
    }
});

// 基础安全 HTTP 头部（不引入额外依赖）
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
});

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: '个人所得税计算系统 API',
            version: '1.0.0',
            description: '个人所得税计算系统的后端API文档',
        },
        servers: [
            {
                url: process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`,
                description: 'API服务器'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        },
        // 全局安全要求：默认所有端点需要 bearerAuth；登录/注册/健康检查等在 JSDoc 中显式 security: []
        security: [{ bearerAuth: [] }]
    },
    apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// CORS 配置
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
// 请求体大小限制（防止过大请求导致 DoS）
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(logger);

// API 路由
app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(swaggerSpec);
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', codeLimiter, authLimiter, authRoutes);
app.use('/api/calculations', calculationRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/stats', statsRoutes);

// 健康检查端点（用于云平台健康检查）
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 静态文件服务（生产环境）
// 前端文件位于 server 目录的上一级
// 差异化缓存策略：
//   - index.html / manifest.json / service-worker.js → no-cache
//     （每次需重新验证，确保新版本及时下发；SW 文件尤其不能被浏览器强缓存）
//   - JS / CSS → public, max-age=31536000, immutable
//     （强缓存 1 年，依靠 Service Worker 版本号 + 文件 ?v= 指纹失效）
//   - 图片 / 字体 → public, max-age=604800（7 天）
//   - 其他 → 不设，走浏览器默认
const staticPath = path.join(__dirname, '../../');
app.use(express.static(staticPath, {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const base = path.basename(filePath).toLowerCase();
        // 必须 no-cache 的文件：HTML 入口、PWA 清单、Service Worker 本体
        if (base === 'index.html' || base === 'manifest.json' || base === 'service-worker.js') {
            res.setHeader('Cache-Control', 'no-cache');
            return;
        }
        // JS / CSS：强缓存 1 年（immutable 表示内容不会变，避免条件请求）
        if (ext === '.js' || ext === '.css') {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return;
        }
        // 图片 / 字体 / 图标：缓存 7 天
        if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=604800');
            return;
        }
    }
}));

// SPA 回退：所有非 API 路由返回 index.html（同样 no-cache）
app.get('*', (req, res, next) => {
    // 跳过 API 路由
    if (req.path.startsWith('/api/')) {
        return next();
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(staticPath, 'index.html'));
});

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`API文档地址: http://localhost:${PORT}/api/docs`);

    // 首批邀请码自动兜底：仅当 InviteCode 表为空时生成并打印到日志
    // 部署日志仅账号主人可见；手动补充用 scripts/generate-invite-codes.js
    const authService = require('./services/authService');
    authService.ensureInviteCodes(20)
        .then((codes) => {
            if (!codes || codes.length === 0) return;
            console.log('\n========== 首批邀请码已生成（一机一码，每个仅可用一次，请妥善保管） ==========');
            codes.forEach((code, idx) => console.log(`  ${idx + 1}. ${code}`));
            console.log('==============================================================================\n');
        })
        .catch((err) => {
            // 生成失败不阻塞服务启动，可稍后用脚本手动补
            console.error('邀请码自动生成失败（可用 scripts/generate-invite-codes.js 手动补）:', err.message);
        });
});
