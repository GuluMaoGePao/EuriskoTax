const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: {
                message: 'Access token is missing',
                statusCode: 401
            }
        });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, username: true, email: true, phone: true }
        });
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: {
                    message: 'Invalid token',
                    statusCode: 401
                }
            });
        }
        
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({
            success: false,
            error: {
                message: 'Token expired or invalid',
                statusCode: 403
            }
        });
    }
};

module.exports = { authenticateToken };
