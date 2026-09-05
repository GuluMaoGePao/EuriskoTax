const authService = require('../services/authService');

const register = async (req, res, next) => {
    try {
        const { username, email, password, phone, inviteCode } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Username, email and password are required',
                    statusCode: 400
                }
            });
        }
        
        // 邀请码校验（公测期限制注册）
        const VALID_INVITE_CODE = 'EURISKO2026BETA';
        if (inviteCode !== VALID_INVITE_CODE) {
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
    login,
    profile,
    updateProfile,
    deleteProfile,
    verifyPassword
};
