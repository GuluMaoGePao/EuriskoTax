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

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Password must be at least 6 characters',
                    statusCode: 400
                }
            });
        }

        if (!inviteCode) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Invite code is required',
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

        // 先查重（在消耗一次性验证码之前），已注册账号给出明确提示，避免浪费验证码
        await authService.checkDuplicate(username, email);

        // 邮箱验证码校验（一次性使用，校验通过即作废）
        await verificationService.verifyRegisterCode(email, verificationCode);

        // 注册 + 一机一码邀请码在事务内原子消耗
        const user = await authService.registerUser(username, email, password, phone, inviteCode);

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

        // 已注册邮箱直接拦截，引导登录，不浪费验证码邮件
        await authService.checkDuplicate(null, email);

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

        // 仅校验实际提交的字段（部分更新语义：未提交的字段不校验不修改）
        if (username !== undefined && !String(username).trim()) {
            return res.status(400).json({
                success: false,
                error: {
                    message: '用户名不能为空',
                    statusCode: 400
                }
            });
        }
        if (email !== undefined && String(email).trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(String(email).trim())) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: '邮箱格式不正确',
                        statusCode: 400
                    }
                });
            }
        }
        if (phone !== undefined && phone !== null && String(phone).trim()) {
            // 大陆 11 位手机号；为空字符串/null 表示清除手机号
            const phoneRegex = /^1[3-9]\d{9}$/;
            if (!phoneRegex.test(String(phone).trim())) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: '手机号格式不正确（需为 11 位大陆手机号）',
                        statusCode: 400
                    }
                });
            }
        }

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: 'Password must be at least 6 characters',
                        statusCode: 400
                    }
                });
            }
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: '修改密码需验证当前密码',
                        statusCode: 400
                    }
                });
            }
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

        if (!currentPassword) {
            return res.status(400).json({
                success: false,
                error: {
                    message: '请输入当前密码',
                    statusCode: 400
                }
            });
        }

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

// 忘记密码：向已注册邮箱发送重置验证码（未注册邮箱直接 404 提示，不发送邮件）
const sendResetCode = async (req, res, next) => {
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

        // 仅已注册邮箱允许发送，避免对任意邮箱轰炸邮件
        await authService.ensureEmailRegistered(email);

        const result = await verificationService.sendResetCode(email);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

// 忘记密码：校验重置验证码后更新密码
const resetPassword = async (req, res, next) => {
    try {
        const { email, verificationCode, newPassword } = req.body;

        if (!email || !verificationCode || !newPassword) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Email, verification code and new password are required',
                    statusCode: 400
                }
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Password must be at least 6 characters',
                    statusCode: 400
                }
            });
        }

        await authService.ensureEmailRegistered(email);

        // 重置验证码校验（一次性使用，通过即作废）
        await verificationService.verifyResetCode(email, verificationCode);

        const result = await authService.resetPassword(email, newPassword);

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
    verifyPassword,
    sendResetCode,
    resetPassword
};
