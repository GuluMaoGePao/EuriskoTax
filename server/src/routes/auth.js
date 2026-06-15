const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/profile', authenticateToken, authController.profile);
router.put('/profile', authenticateToken, authController.updateProfile);
router.delete('/profile', authenticateToken, authController.deleteProfile);
router.post('/verify-password', authenticateToken, authController.verifyPassword);

module.exports = router;
