const express = require('express');
const router = express.Router();
const calculationController = require('../controllers/calculationController');
const { authenticateToken } = require('../middleware/auth');

router.post('/comprehensive', calculationController.calculateComprehensive);
router.post('/reverse', calculationController.calculateReverse);
router.post('/business', calculationController.calculateBusiness);
router.post('/classification', calculationController.calculateClassification);
router.get('/history', authenticateToken, calculationController.getHistory);
router.get('/:id', authenticateToken, calculationController.getCalculationById);
router.delete('/:id', authenticateToken, calculationController.deleteCalculation);

module.exports = router;
