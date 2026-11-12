const express = require('express');
const router = express.Router();

const authController = require('./authController');
const authenticateUser = require('../../middelware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authenticateUser,authController.getMe);

module.exports = router;