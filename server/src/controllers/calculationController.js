const { PrismaClient } = require('@prisma/client');
const taxCalculator = require('../services/taxCalculator');

const prisma = new PrismaClient();

const calculateComprehensive = async (req, res, next) => {
    try {
        const inputData = req.body;
        const result = taxCalculator.calculateComprehensiveTax(inputData);
        
        if (req.user) {
            await prisma.calculation.create({
                data: {
                    user_id: req.user.id,
                    type: 'comprehensive',
                    input_data: JSON.stringify(inputData),
                    result_data: JSON.stringify(result)
                }
            });
        }
        
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
        
        if (req.user) {
            await prisma.calculation.create({
                data: {
                    user_id: req.user.id,
                    type: 'reverse',
                    input_data: JSON.stringify(inputData),
                    result_data: JSON.stringify(result)
                }
            });
        }
        
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
        
        if (req.user) {
            await prisma.calculation.create({
                data: {
                    user_id: req.user.id,
                    type: 'business',
                    input_data: JSON.stringify(inputData),
                    result_data: JSON.stringify(result)
                }
            });
        }
        
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
        
        if (req.user) {
            await prisma.calculation.create({
                data: {
                    user_id: req.user.id,
                    type: 'classification',
                    input_data: JSON.stringify(inputData),
                    result_data: JSON.stringify(result)
                }
            });
        }
        
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