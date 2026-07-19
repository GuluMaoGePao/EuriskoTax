const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const registerUser = async (username, email, password, phone = null) => {
    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [
                { username: username },
                { email: email }
            ]
        }
    });
    
    if (existingUser) {
        const error = new Error('Username or email already exists');
        error.statusCode = 400;
        throw error;
    }
    
    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    
    const user = await prisma.user.create({
        data: {
            username,
            email,
            password_hash: passwordHash,
            phone
        },
        select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            created_at: true
        }
    });
    
    return user;
};

const loginUser = async (email, password) => {
    const user = await prisma.user.findUnique({
        where: { email }
    });
    
    if (!user) {
        const error = new Error('Invalid email or password');
        error.statusCode = 401;
        throw error;
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
        const error = new Error('Invalid email or password');
        error.statusCode = 401;
        throw error;
    }
    
    const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    return {
        token,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone
        }
    };
};

const getUserById = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            created_at: true,
            updated_at: true
        }
    });
    
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }
    
    return user;
};

const verifyPassword = async (userId, password) => {
    const user = await prisma.user.findUnique({
        where: { id: userId }
    });
    
    if (!user) {
        return false;
    }
    
    return await bcrypt.compare(password, user.password_hash);
};

const updateUser = async (userId, data) => {
    const updateData = {};
    
    if (data.username) updateData.username = data.username;
    if (data.email) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    
    if (data.password) {
        updateData.password_hash = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    }
    
    const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            updated_at: true
        }
    });
    
    return user;
};

const deleteUser = async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }
    
    await prisma.user.delete({ where: { id: userId } });
    
    return { message: 'User deleted successfully' };
};

module.exports = {
    registerUser,
    loginUser,
    getUserById,
    verifyPassword,
    updateUser,
    deleteUser
};
