const express = require('express');
const router = express.Router();

const authenticateUser = require('../../middelware/auth');
const reservationController = require('./reservationController');

router.get('/mine', authenticateUser, reservationController.getMyReservations);
router.post('/:id/approve', authenticateUser, reservationController.approveReservation);
router.post('/:id/reject', authenticateUser, reservationController.rejectReservation);
router.post('/:id/cancel', authenticateUser, reservationController.cancelReservation)

module.exports = router;