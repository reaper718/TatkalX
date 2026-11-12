const express = require('express');
const router = express.Router();

const authenticateUser = require('../../middelware/auth');
const donationController = require('./donationsController');

router.post('/', authenticateUser, donationController.createDonation);
router.post('/:id/publish', authenticateUser, donationController.publishDonation);
router.get('/', authenticateUser, donationController.getAllDonations);
router.get('/mine', authenticateUser, donationController.getMyDonations)
router.get('/:id',authenticateUser, donationController.getDonationById);
router.patch('/:id', authenticateUser, donationController.updateDonation);
router.post('/:id/cancel', authenticateUser, donationController.cancelDonation)

module.exports = router;