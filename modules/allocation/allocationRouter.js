const express = require('express');
const router = express.Router();

const authenticateUser = require('../../middelware/auth');
const allocationController = require('./allocationController');

router.get('/mine', authenticateUser, allocationController.getMyAllocations);
router.get('/:id', authenticateUser, allocationController.getAllocationDetails);
router.patch('/:id/status', authenticateUser, allocationController.updateAllocationStatus);

module.exports = router;