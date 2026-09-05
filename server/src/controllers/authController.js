const authService = require('../services/authService');
const verificationService = require('../services/verificationService');

const register = async (req, res, next) => {
    try {
        const { username, email, password, phone, inviteCode, verificationCode } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Username, email and password are required',
                    statusCode: 400
                }
            });
        }

        if (!verificationCode) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Verification code is required',
                    statusCode: 400
                }
            });
        }

        // 邮箱验证码校验（一次性使用，校验通过即作废）
        await verificationService.verifyRegisterCode(email, verificationCode);

        // 邀请码校验（公测期限制注册；码值由环境变量提供，未配置时一律拒绝）
        const VALID_INVITE_CODE = process.env.INVITE_CODE;
        if (!VALID_INVITE_CODE || inviteCode !== VALID_INVITE_CODE) {
            return res.status(403).json({
                success: false,
                error: {
                    message: 'Invalid invite code. Public beta requires an invite code.',
                    statusCode: 403
                }
            });
        }

        const user = await authService.registerUser(username, email, password, phone);

        res.status(201).json({
            success: true,
            data: user
        });
    } catch (err) {
        next(err);
    }
};

// 发送注册验证码到邮箱
const sendCode = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Email is required',
                    statusCode: 400
                }
            });
        }

        const result = await verificationService.sendRegisterCode(email);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Email and password are required',
                    statusCode: 400
                }
            });
        }
        
        const result = await authService.loginUser(email, password);
        
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

const profile = async (req, res, next) => {
    try {
        const user = await authService.getUserById(req.user.id);
        
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        next(err);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const { username, email, phone, password, currentPassword } = req.body;
        const userId = req.user.id;
        
        if (password) {
            const isValid = await authService.verifyPassword(userId, currentPassword);
            if (!isValid) {
                return res.status(401).json({
                    success: false,
                    error: {
                        message: '当前密码验证失败',
                        statusCode: 401
                    }
                });
            }
        }
        
        const updatedUser = await authService.updateUser(userId, {
            username,
            email,
            phone,
            password
        });
        
        res.status(200).json({
            success: true,
            data: updatedUser
        });
    } catch (err) {
        next(err);
    }
};

const verifyPassword = async (req, res, next) => {
    try {
        const { currentPassword } = req.body;
        const userId = req.user.id;
        
        const isValid = await authService.verifyPassword(userId, currentPassword);
        
        res.status(200).json({
            success: true,
            data: { valid: isValid }
        });
    } catch (err) {
        next(err);
    }
};

const deleteProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const result = await authService.deleteUser(userId);
        
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    register,
    sendCode,
    login,
    profile,
    updateProfile,
    deleteProfile,
    verifyPassword
};
