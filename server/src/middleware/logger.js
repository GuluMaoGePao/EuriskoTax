const logger = (req, res, next) => {
    const { method, url, ip } = req;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${method} ${url} - ${ip}`);
    next();
};

module.exports = logger;
