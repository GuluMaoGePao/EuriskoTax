const { PrismaClient } = require('@prisma/client');
const taxCalculator = require('../services/taxCalculator');

const prisma = new PrismaClient();

const calculateComprehensive = async (req, res, next) => {
    try {
        const inputData = req.body;
        const result = taxCalculator.calculateComprehensiveTax(inputData);

        // 注：产品主链路为「前端本地计算 + localStorage 历史」，
        // 计算路由不挂 authenticateToken，req.user 恒为 undefined，
        // 此前的 if (req.user) 落库块是永不触发的死代码，已移除。
        // 将来做「账号历史同步」时，应给本路由挂可选认证中间件后再恢复 prisma 保存。
        
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

const calculateReverse = async (req, res, next) => {
    try {
        const inputData = req.body;
        const result = taxCalculator.calculateReverseTax(inputData);

        // 与 comprehensive 一致：不落库（见 calculateComprehensive 注释）
        
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

const calculateBusiness = async (req, res, next) => {
    try {
        const inputData = req.body;
        const result = taxCalculator.calculateBusinessTax(inputData);

        // 与 comprehensive 一致：不落库（见 calculateComprehensive 注释）
        
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

const calculateClassification = async (req, res, next) => {
    try {
        const inputData = req.body;
        const result = taxCalculator.calculateClassificationTax(inputData);

        // 与 comprehensive 一致：不落库（见 calculateComprehensive 注释）
        
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

const getHistory = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: {
                    message: 'Authentication required',
                    statusCode: 401
                }
            });
        }
        
        const calculations = await prisma.calculation.findMany({
            where: { user_id: req.user.id },
            orderBy: { created_at: 'desc' },
            take: 50
        });
        
        const parsedCalculations = calculations.map(calc => ({
            ...calc,
            input_data: JSON.parse(calc.input_data),
            result_data: JSON.parse(calc.result_data)
        }));
        
        res.status(200).json({
            success: true,
            data: parsedCalculations
        });
    } catch (err) {
        next(err);
    }
};

const getCalculationById = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: {
                    message: 'Authentication required',
                    statusCode: 401
                }
            });
        }
        
        const { id } = req.params;
        const calculation = await prisma.calculation.findUnique({
            where: { id: parseInt(id) }
        });
        
        if (!calculation) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'Calculation not found',
                    statusCode: 404
                }
            });
        }
        
        if (calculation.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: {
                    message: 'Access denied',
                    statusCode: 403
                }
            });
        }
        
        const parsedCalculation = {
            ...calculation,
            input_data: JSON.parse(calculation.input_data),
            result_data: JSON.parse(calculation.result_data)
        };
        
        res.status(200).json({
            success: true,
            data: parsedCalculation
        });
    } catch (err) {
        next(err);
    }
};

const deleteCalculation = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: {
                    message: 'Authentication required',
                    statusCode: 401
                }
            });
        }
        
        const { id } = req.params;
        const calculation = await prisma.calculation.findUnique({
            where: { id: parseInt(id) }
        });
        
        if (!calculation) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'Calculation not found',
                    statusCode: 404
                }
            });
        }
        
        if (calculation.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: {
                    message: 'Access denied',
                    statusCode: 403
                }
            });
        }
        
        await prisma.calculation.delete({
            where: { id: parseInt(id) }
        });
        
        res.status(200).json({
            success: true,
            data: { message: 'Calculation deleted successfully' }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    calculateComprehensive,
    calculateReverse,
    calculateBusiness,
    calculateClassification,
    getHistory,
    getCalculationById,
    deleteCalculation
};