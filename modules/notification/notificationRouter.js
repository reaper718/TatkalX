const express = require('express');
const router = express.Router();

const authenticateUser = require('../../middelware/auth');
const notificationController = require('./notificationController');

router.get('/', authenticateUser, notificationController.getMyNotifications);
router.patch('/:id/read', authenticateUser, notificationController.markNotificationAsRead);
router.patch('/read-all', authenticateUser, notificationController.markAllNotificationsAsRead);

module.exports = router;