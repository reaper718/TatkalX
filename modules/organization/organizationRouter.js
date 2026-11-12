const express = require('express');
const router = express.Router();

const authenticateUser = require('../../middelware/auth');
const adminAuth = require('../../middelware/adminAuth');
const organizationController = require('./organizationController');


router.get('/me', authenticateUser,organizationController.getMyOrganizations);
router.patch('/me', authenticateUser, organizationController.updateMyOrganization);
router.get('/pending', authenticateUser, adminAuth, organizationController.getPendingOrganizations);
router.get('/:id', authenticateUser, organizationController.getOrganizationById);
router.patch('/:id/verification', authenticateUser, adminAuth, organizationController.verifyOrganization);

module.exports = router;