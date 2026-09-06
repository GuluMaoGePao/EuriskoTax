const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    const statusCode = err.statusCode || 500;
    const isProd = process.env.NODE_ENV === 'production';
    // 业务错误（400/401/403/404/409/429 等）携带的是面向用户的提示，原样返回；
    // 生产环境的 500 内部错误不裸透 err.message（可能含 SQL/堆栈/内部路径），统一为通用提示
    const message = statusCode >= 500 && isProd
        ? '服务器内部错误，请稍后重试'
        : (err.message || 'Internal Server Error');

    res.status(statusCode).json({
        success: false,
        error: {
            message: message,
            statusCode: statusCode
        }
    });
};

const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.statusCode = 404;
    next(error);
};

module.exports = { errorHandler, notFound };
