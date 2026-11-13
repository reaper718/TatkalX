const express = require('express');
const router = express.Router();

const authenticateUser = require('../../middelware/auth');
const discoverController = require('./discoverController');

router.get('/donations/nearby', authenticateUser, discoverController.getNearbyDonations);
router.get('/organizations/nearby', authenticateUser, discoverController.getNearbyOrganizations)

module.exports = router;