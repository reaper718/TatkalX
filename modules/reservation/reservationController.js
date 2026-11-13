const {
    Organization,
    OrganizationMember,
    DonationReservation,
    Donation,
    Allocation,
    AllocationEvent,
    Notification
} = require('../../models');

const { Op } = require('sequelize');
const sequelize = require('../../utils/db-connection');

const getMyReservations = async (req, res) => {
    try {
        const userId = req.user.id;

        const page = Math.max(
            Number.parseInt(req.query.page, 10) || 1,
            1
        );

        const limit = Math.min(
            Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
            50
        );

        const offset = (page - 1) * limit;

        const allowedStatuses = [
            'PENDING',
            'CONFIRMED',
            'REJECTED',
            'CANCELLED',
            'EXPIRED'
        ];

        const status = req.query.status
            ? req.query.status.toUpperCase()
            : null;

        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reservation status.',
                allowedStatuses
            });
        }

        const memberships = await OrganizationMember.findAll({
            where: {
                user_id: userId
            }
        });

        if (memberships.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'You do not belong to an organization.'
            });
        }

        const organizationIds = memberships.map(
            membership => membership.organization_id
        );

        const ngoOrganizations = await Organization.findAll({
            where: {
                id: {
                    [Op.in]: organizationIds
                },
                type: 'NGO',
                verification_status: 'VERIFIED',
                is_active: true
            },
            attributes: ['id', 'name']
        });

        if (ngoOrganizations.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'You must belong to an active, verified NGO organization.'
            });
        }

        if (ngoOrganizations.length > 1) {
            return res.status(409).json({
                success: false,
                message: 'You belong to multiple verified NGO organizations. Organization selection is required.'
            });
        }

        const ngoOrganization = ngoOrganizations[0];

        const whereCondition = {
            ngo_organization_id: ngoOrganization.id
        };

        if (status) {
            whereCondition.status = status;
        }

        const { count, rows } =
            await DonationReservation.findAndCountAll({
                where: whereCondition,

                include: [{
                    model: Donation,
                    as: 'donation',
                    required: true,
                    attributes: [
                        'id',
                        'title',
                        'description',
                        'category',
                        'dietary_type',
                        'total_quantity',
                        'unit',
                        'pickup_deadline',
                        'safe_consumption_deadline',
                        'pickup_address',
                        'status'
                    ]
                }],

                order: [['createdAt', 'DESC']],
                limit,
                offset,
                distinct: true
            });

        return res.status(200).json({
            success: true,
            message: 'Your reservations fetched successfully.',

            organization: {
                id: ngoOrganization.id,
                name: ngoOrganization.name
            },

            pagination: {
                totalItems: count,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                limit,
                hasNextPage: page < Math.ceil(count / limit),
                hasPreviousPage: page > 1
            },

            data: rows.map(reservation => ({
                id: reservation.id,
                donationId: reservation.donation_id,
                quantity: Number(reservation.quantity),
                status: reservation.status,
                expiresAt: reservation.expires_at,
                createdAt: reservation.createdAt,

                donation: reservation.donation
            }))
        });

    } catch (error) {
        console.error('Get my reservations error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to fetch your reservations.',
            error: error.message
        });
    }
};


const approveReservation = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const reservationId = req.params.id;
        const userId = req.user.id;

        const initialReservation = await DonationReservation.findByPk(
            reservationId,
            {
                attributes: ['id', 'donation_id'],
                transaction
            }
        );

        if (!initialReservation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Reservation not found.'
            });
        }

        const donationId = initialReservation.donation_id;

        const donation = await Donation.findByPk(donationId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!donation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Associated donation not found.'
            });
        }

        const membership = await OrganizationMember.findOne({
            where: {
                user_id: userId,
                organization_id: donation.donor_organization_id,
                role: {
                    [Op.in]: ['OWNER', 'MANAGER']
                }
            },
            transaction
        });

        if (!membership) {
            await transaction.rollback();

            return res.status(403).json({
                success: false,
                message: 'You are not authorized to approve reservations for this donation.'
            });
        }

        const donorOrganization = await Organization.findOne({
            where: {
                id: donation.donor_organization_id,
                type: 'DONOR',
                verification_status: 'VERIFIED',
                is_active: true
            },
            transaction
        });

        if (!donorOrganization) {
            await transaction.rollback();

            return res.status(403).json({
                success: false,
                message: 'Your donor organization must be active and verified.'
            });
        }

        const reservation = await DonationReservation.findByPk(
            reservationId,
            {
                transaction,
                lock: transaction.LOCK.UPDATE
            }
        );

        if (!reservation || reservation.donation_id !== donation.id) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Reservation not found for this donation.'
            });
        }

        if (reservation.status !== 'PENDING') {
            await transaction.rollback();

            return res.status(409).json({
                success: false,
                message: `Reservation cannot be approved because its status is ${reservation.status}.`
            });
        }

        const now = new Date();

        if (new Date(reservation.expires_at) <= now) {
            await transaction.rollback();

            return res.status(409).json({
                success: false,
                message: 'This reservation has expired and cannot be approved.'
            });
        }

        const quantity = Number(reservation.quantity);
        const reservedQuantity = Number(donation.reserved_quantity || 0);
        const allocatedQuantity = Number(donation.allocated_quantity || 0);

        if (
            !Number.isFinite(quantity) ||
            quantity <= 0 ||
            reservedQuantity < quantity
        ) {
            throw new Error(
                'Invalid reservation quantity or inconsistent donation quantity counters.'
            );
        }

        const newReservedQuantity = reservedQuantity - quantity;
        const newAllocatedQuantity = allocatedQuantity + quantity;

        await donation.update(
            {
                reserved_quantity: newReservedQuantity,
                allocated_quantity: newAllocatedQuantity
            },
            { transaction }
        );

        await reservation.update(
            {
                status: 'CONFIRMED'
            },
            { transaction }
        );

        const allocation = await Allocation.create(
            {
                reservation_id: reservation.id,
                status: 'READY_FOR_PICKUP',
                confirmed_at: now
            },
            { transaction }
        );

        await AllocationEvent.create(
            {
                allocation_id: allocation.id,
                previous_status: null,
                new_status: 'READY_FOR_PICKUP',
                changed_by: userId,
                notes: 'Reservation approved by donor organization.'
            },
            { transaction }
        );

        const ngoMembers = await OrganizationMember.findAll({
            where: {
                organization_id: reservation.ngo_organization_id
            },
            attributes: ['user_id'],
            transaction
        });

        const ngoUserIds = [
            ...new Set(ngoMembers.map(member => member.user_id))
        ];

        if (ngoUserIds.length > 0) {
            await Notification.bulkCreate(
                ngoUserIds.map(ngoUserId => ({
                    user_id: ngoUserId,
                    type: 'RESERVATION_APPROVED',
                    title: 'Reservation approved',
                    message: `Your reservation for ${quantity} ${donation.unit} of "${donation.title}" has been approved by ${donorOrganization.name}.`,
                    reference_type: 'ALLOCATION',
                    reference_id: allocation.id,
                    is_read: false
                })),
                { transaction }
            );
        }

        const responseBody = {
            success: true,
            message: 'Reservation approved successfully.',
            data: {
                reservationId: reservation.id,
                donationId: donation.id,
                donationTitle: donation.title,
                ngoOrganizationId: reservation.ngo_organization_id,
                quantity,
                reservationStatus: 'CONFIRMED',
                allocationId: allocation.id,
                allocationStatus: allocation.status,
                confirmedAt: allocation.confirmed_at,
                reservedQuantity: newReservedQuantity,
                allocatedQuantity: newAllocatedQuantity
            }
        };

        await transaction.commit();

        return res.status(200).json(responseBody);

    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback();
        }

        console.error('Approve reservation error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to approve reservation.',
            error: error.message
        });
    }
};



const rejectReservation = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const reservationId = req.params.id;
        const userId = req.user.id;

        const initialReservation = await DonationReservation.findByPk(
            reservationId,
            {
                attributes: ['id', 'donation_id'],
                transaction
            }
        );

        if (!initialReservation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Reservation not found.'
            });
        }

        const donationId = initialReservation.donation_id;

        const donation = await Donation.findByPk(donationId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!donation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Associated donation not found.'
            });
        }

        const membership = await OrganizationMember.findOne({
            where: {
                user_id: userId,
                organization_id: donation.donor_organization_id,
                role: {
                    [Op.in]: ['OWNER', 'MANAGER']
                }
            },
            transaction
        });

        if (!membership) {
            await transaction.rollback();

            return res.status(403).json({
                success: false,
                message: 'You are not authorized to reject reservations for this donation.'
            });
        }

        const donorOrganization = await Organization.findOne({
            where: {
                id: donation.donor_organization_id,
                type: 'DONOR',
                verification_status: 'VERIFIED',
                is_active: true
            },
            transaction
        });

        if (!donorOrganization) {
            await transaction.rollback();

            return res.status(403).json({
                success: false,
                message: 'Your donor organization must be active and verified.'
            });
        }

        const reservation = await DonationReservation.findByPk(
            reservationId,
            {
                transaction,
                lock: transaction.LOCK.UPDATE
            }
        );

        if (!reservation || reservation.donation_id !== donation.id) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Reservation not found for this donation.'
            });
        }

        if (reservation.status !== 'PENDING') {
            await transaction.rollback();

            return res.status(409).json({
                success: false,
                message: `Reservation cannot be rejected because its status is ${reservation.status}.`
            });
        }

        const now = new Date();

        if (new Date(reservation.expires_at) <= now) {
            await transaction.rollback();

            return res.status(409).json({
                success: false,
                message: 'This reservation has expired. It should be handled by the reservation expiry workflow.'
            });
        }

        const quantity = Number(reservation.quantity);
        const reservedQuantity = Number(donation.reserved_quantity || 0);

        if (
            !Number.isFinite(quantity) ||
            quantity <= 0 ||
            reservedQuantity < quantity
        ) {
            throw new Error(
                'Invalid reservation quantity or inconsistent donation reserved quantity.'
            );
        }

        const newReservedQuantity = reservedQuantity - quantity;

        await donation.update(
            {
                reserved_quantity: newReservedQuantity
            },
            { transaction }
        );

        await reservation.update(
            {
                status: 'REJECTED'
            },
            { transaction }
        );

        const ngoMembers = await OrganizationMember.findAll({
            where: {
                organization_id: reservation.ngo_organization_id
            },
            attributes: ['user_id'],
            transaction
        });

        const ngoUserIds = [
            ...new Set(ngoMembers.map(member => member.user_id))
        ];

        if (ngoUserIds.length > 0) {
            await Notification.bulkCreate(
                ngoUserIds.map(ngoUserId => ({
                    user_id: ngoUserId,
                    type: 'RESERVATION_REJECTED',
                    title: 'Reservation rejected',
                    message: `Your reservation for ${quantity} ${donation.unit} of "${donation.title}" has been rejected by ${donorOrganization.name}.`,
                    reference_type: 'DONATION_RESERVATION',
                    reference_id: reservation.id,
                    is_read: false
                })),
                { transaction }
            );
        }

        const responseBody = {
            success: true,
            message: 'Reservation rejected successfully.',
            data: {
                reservationId: reservation.id,
                donationId: donation.id,
                donationTitle: donation.title,
                ngoOrganizationId: reservation.ngo_organization_id,
                quantity,
                reservationStatus: 'REJECTED',
                reservedQuantity: newReservedQuantity,
                allocatedQuantity: Number(donation.allocated_quantity || 0),
                rejectedAt: now
            }
        };

        await transaction.commit();

        return res.status(200).json(responseBody);

    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback();
        }

        console.error('Reject reservation error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to reject reservation.',
            error: error.message
        });
    }
};



const cancelReservation = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const reservationId = req.params.id;
        const userId = req.user.id;

        const initialReservation = await DonationReservation.findByPk(
            reservationId,
            {
                attributes: ['id', 'donation_id', 'ngo_organization_id'],
                transaction
            }
        );

        if (!initialReservation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Reservation not found.'
            });
        }

        const donationId = initialReservation.donation_id;
        const ngoOrganizationId = initialReservation.ngo_organization_id;

        const donation = await Donation.findByPk(donationId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!donation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Associated donation not found.'
            });
        }

        const membership = await OrganizationMember.findOne({
            where: {
                user_id: userId,
                organization_id: ngoOrganizationId
            },
            transaction
        });

        if (!membership) {
            await transaction.rollback();

            return res.status(403).json({
                success: false,
                message: 'You are not authorized to cancel this reservation.'
            });
        }

        const ngoOrganization = await Organization.findOne({
            where: {
                id: ngoOrganizationId,
                type: 'NGO',
                verification_status: 'VERIFIED',
                is_active: true
            },
            transaction
        });

        if (!ngoOrganization) {
            await transaction.rollback();

            return res.status(403).json({
                success: false,
                message: 'Your NGO organization must be active and verified.'
            });
        }

        const reservation = await DonationReservation.findByPk(
            reservationId,
            {
                transaction,
                lock: transaction.LOCK.UPDATE
            }
        );

        if (
            !reservation ||
            reservation.donation_id !== donation.id ||
            reservation.ngo_organization_id !== ngoOrganizationId
        ) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Reservation not found.'
            });
        }

        if (reservation.status !== 'PENDING') {
            await transaction.rollback();

            return res.status(409).json({
                success: false,
                message: `Reservation cannot be cancelled because its status is ${reservation.status}.`
            });
        }

        const now = new Date();

        if (new Date(reservation.expires_at) <= now) {
            await transaction.rollback();

            return res.status(409).json({
                success: false,
                message: 'This reservation has expired. It should be handled by the reservation expiry workflow.'
            });
        }

        const quantity = Number(reservation.quantity);
        const reservedQuantity = Number(donation.reserved_quantity || 0);

        if (
            !Number.isFinite(quantity) ||
            quantity <= 0 ||
            reservedQuantity < quantity
        ) {
            throw new Error(
                'Invalid reservation quantity or inconsistent donation reserved quantity.'
            );
        }

        const newReservedQuantity = reservedQuantity - quantity;

        await donation.update(
            {
                reserved_quantity: newReservedQuantity
            },
            { transaction }
        );

        await reservation.update(
            {
                status: 'CANCELLED'
            },
            { transaction }
        );

        const donorMembers = await OrganizationMember.findAll({
            where: {
                organization_id: donation.donor_organization_id
            },
            attributes: ['user_id'],
            transaction
        });

        const donorUserIds = [
            ...new Set(donorMembers.map(member => member.user_id))
        ];

        if (donorUserIds.length > 0) {
            await Notification.bulkCreate(
                donorUserIds.map(donorUserId => ({
                    user_id: donorUserId,
                    type: 'RESERVATION_CANCELLED',
                    title: 'Reservation cancelled',
                    message: `${ngoOrganization.name} has cancelled its reservation for ${quantity} ${donation.unit} of "${donation.title}".`,
                    reference_type: 'DONATION_RESERVATION',
                    reference_id: reservation.id,
                    is_read: false
                })),
                { transaction }
            );
        }

        const responseBody = {
            success: true,
            message: 'Reservation cancelled successfully.',
            data: {
                reservationId: reservation.id,
                donationId: donation.id,
                donationTitle: donation.title,
                ngoOrganizationId,
                quantity,
                reservationStatus: 'CANCELLED',
                reservedQuantity: newReservedQuantity,
                allocatedQuantity: Number(donation.allocated_quantity || 0),
                cancelledAt: now
            }
        };

        await transaction.commit();

        return res.status(200).json(responseBody);

    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback();
        }

        console.error('Cancel reservation error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to cancel reservation.',
            error: error.message
        });
    }
};


module.exports = {
    getMyReservations,
    approveReservation,
    rejectReservation,
    cancelReservation
};
