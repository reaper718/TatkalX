const {
    Allocation,
    DonationReservation,
    Donation,
    Organization,
    OrganizationMember,
    AllocationEvent,
    Notification
} = require('../../models');

const { Op } = require('sequelize');
const sequelize = require('../../utils/db-connection');

const getMyAllocations = async (req, res) => {
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
            'READY_FOR_PICKUP',
            'PICKED_UP',
            'DELIVERED',
            'FAILED'
        ];

        const status = req.query.status
            ? req.query.status.toUpperCase()
            : null;

        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid allocation status.',
                allowedStatuses
            });
        }

        const memberships = await OrganizationMember.findAll({
            where: {
                user_id: userId
            },
            attributes: ['organization_id']
        });

        if (memberships.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'You do not belong to any organization.'
            });
        }

        const organizationIds = [
            ...new Set(
                memberships.map(member => member.organization_id)
            )
        ];

        const organizations = await Organization.findAll({
            where: {
                id: {
                    [Op.in]: organizationIds
                },
                verification_status: 'VERIFIED',
                is_active: true,
                type: {
                    [Op.in]: ['DONOR', 'NGO']
                }
            },
            attributes: ['id', 'name', 'type']
        });

        if (organizations.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'You must belong to an active, verified organization.'
            });
        }

        const activeOrganizationIds = organizations.map(
            organization => organization.id
        );

        const whereCondition = {
            [Op.or]: [
                {
                    '$reservation.ngo_organization_id$': {
                        [Op.in]: activeOrganizationIds
                    }
                },
                {
                    '$reservation.donation.donor_organization_id$': {
                        [Op.in]: activeOrganizationIds
                    }
                }
            ]
        };

        if (status) {
            whereCondition.status = status;
        }

        const { count, rows } = await Allocation.findAndCountAll({
            where: whereCondition,

            attributes: [
                'id',
                'reservation_id',
                'status',
                'pickup_notes',
                'confirmed_at',
                'picked_up_at',
                'delivered_at',
                'createdAt'
            ],

            include: [{
                model: DonationReservation,
                as: 'reservation',
                required: true,

                attributes: [
                    'id',
                    'ngo_organization_id',
                    'quantity',
                    'status',
                    'expires_at'
                ],

                include: [
                    {
                        model: Donation,
                        as: 'donation',
                        required: true,

                        attributes: [
                            'id',
                            'title',
                            'description',
                            'category',
                            'dietary_type',
                            'unit',
                            'pickup_deadline',
                            'pickup_address',
                            'donor_organization_id'
                        ],

                        include: [{
                            model: Organization,
                            as: 'donorOrganization',
                            required: true,

                            attributes: [
                                'id',
                                'name',
                                'type',
                                'phone',
                                'email',
                                'address',
                                'city'
                            ]
                        }]
                    },
                    {
                        model: Organization,
                        as: 'ngoOrganization',
                        required: true,

                        attributes: [
                            'id',
                            'name',
                            'type',
                            'phone',
                            'email',
                            'address',
                            'city'
                        ]
                    }
                ]
            }],

            order: [['createdAt', 'DESC']],
            limit,
            offset,
            distinct: true
        });

        const data = rows.map(allocation => {
            const reservation = allocation.reservation;
            const donation = reservation.donation;

            const donorOrganization = donation.donorOrganization;
            const ngoOrganization = reservation.ngoOrganization;

            const isDonor = activeOrganizationIds.includes(
                donorOrganization.id
            );

            const isNgo = activeOrganizationIds.includes(
                ngoOrganization.id
            );

            return {
                id: allocation.id,
                reservationId: reservation.id,
                status: allocation.status,

                role: isDonor && isNgo
                    ? 'BOTH'
                    : isDonor
                        ? 'DONOR'
                        : 'NGO',

                quantity: Number(reservation.quantity),

                confirmedAt: allocation.confirmed_at,
                pickedUpAt: allocation.picked_up_at,
                deliveredAt: allocation.delivered_at,
                pickupNotes: allocation.pickup_notes,

                reservation: {
                    status: reservation.status,
                    expiresAt: reservation.expires_at
                },

                donation: {
                    id: donation.id,
                    title: donation.title,
                    description: donation.description,
                    category: donation.category,
                    dietaryType: donation.dietary_type,
                    unit: donation.unit,
                    pickupDeadline: donation.pickup_deadline,
                    pickupAddress: donation.pickup_address
                },

                donorOrganization,
                ngoOrganization
            };
        });

        return res.status(200).json({
            success: true,
            message: 'Your allocations fetched successfully.',

            organizations: organizations.map(org => ({
                id: org.id,
                name: org.name,
                type: org.type
            })),

            pagination: {
                totalItems: count,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                limit,
                hasNextPage: page < Math.ceil(count / limit),
                hasPreviousPage: page > 1
            },

            data
        });

    } catch (error) {
        console.error('Get my allocations error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to fetch your allocations.',
            error: error.message
        });
    }
};


const getAllocationDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        const allocationId = req.params.id;

        const allocation = await Allocation.findByPk(allocationId, {
            attributes: [
                'id',
                'reservation_id',
                'status',
                'pickup_notes',
                'confirmed_at',
                'picked_up_at',
                'delivered_at',
                'createdAt'
            ],

            include: [{
                model: DonationReservation,
                as: 'reservation',
                required: true,

                attributes: [
                    'id',
                    'donation_id',
                    'ngo_organization_id',
                    'quantity',
                    'status',
                    'expires_at',
                    'createdAt'
                ],

                include: [
                    {
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
                            'storage_instructions',
                            'packaging_details',
                            'donor_organization_id'
                        ],

                        include: [{
                            model: Organization,
                            as: 'donorOrganization',
                            required: true,

                            attributes: [
                                'id',
                                'name',
                                'type',
                                'email',
                                'phone',
                                'address',
                                'city'
                            ]
                        }]
                    },
                    {
                        model: Organization,
                        as: 'ngoOrganization',
                        required: true,

                        attributes: [
                            'id',
                            'name',
                            'type',
                            'email',
                            'phone',
                            'address',
                            'city'
                        ]
                    }
                ]
            }]
        });

        if (!allocation) {
            return res.status(404).json({
                success: false,
                message: 'Allocation not found.'
            });
        }

        const reservation = allocation.reservation;
        const donation = reservation.donation;

        const donorOrganization = donation.donorOrganization;
        const ngoOrganization = reservation.ngoOrganization;

        const membership = await OrganizationMember.findOne({
            where: {
                user_id: userId,
                organization_id: {
                    [Op.in]: [
                        donorOrganization.id,
                        ngoOrganization.id
                    ]
                }
            }
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to view this allocation.'
            });
        }

        const events = await AllocationEvent.findAll({
            where: {
                allocation_id: allocation.id
            },
            attributes: [
                'id',
                'previous_status',
                'new_status',
                'changed_by',
                'notes',
                'createdAt'
            ],
            order: [['createdAt', 'ASC']]
        });

        const requesterRole =
            membership.organization_id === donorOrganization.id
                ? 'DONOR'
                : 'NGO';

        return res.status(200).json({
            success: true,
            message: 'Allocation details fetched successfully.',

            data: {
                id: allocation.id,
                status: allocation.status,
                requesterRole,

                pickupNotes: allocation.pickup_notes,
                confirmedAt: allocation.confirmed_at,
                pickedUpAt: allocation.picked_up_at,
                deliveredAt: allocation.delivered_at,
                createdAt: allocation.createdAt,

                reservation: {
                    id: reservation.id,
                    quantity: Number(reservation.quantity),
                    status: reservation.status,
                    expiresAt: reservation.expires_at,
                    createdAt: reservation.createdAt
                },

                donation: {
                    id: donation.id,
                    title: donation.title,
                    description: donation.description,
                    category: donation.category,
                    dietaryType: donation.dietary_type,
                    totalQuantity: Number(donation.total_quantity),
                    unit: donation.unit,
                    pickupDeadline: donation.pickup_deadline,
                    safeConsumptionDeadline:
                        donation.safe_consumption_deadline,
                    pickupAddress: donation.pickup_address,
                    storageInstructions: donation.storage_instructions,
                    packagingDetails: donation.packaging_details
                },

                donorOrganization,
                ngoOrganization,

                events: events.map(event => ({
                    id: event.id,
                    previousStatus: event.previous_status,
                    newStatus: event.new_status,
                    changedBy: event.changed_by,
                    notes: event.notes,
                    createdAt: event.createdAt
                }))
            }
        });

    } catch (error) {
        console.error('Get allocation details error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to fetch allocation details.',
            error: error.message
        });
    }
};



const updateAllocationStatus = async (req, res) => {
    let transaction;

    try {
        transaction = await sequelize.transaction();

        const allocationId = req.params.id;
        const userId = req.user.id;

        const requestedStatus = req.body.status;
        const notes = typeof req.body.notes === 'string'
            ? req.body.notes.trim()
            : '';

        const allowedStatuses = [
            'PICKED_UP',
            'DELIVERED',
            'FAILED'
        ];

        if (!allowedStatuses.includes(requestedStatus)) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Invalid allocation status.',
                allowedStatuses
            });
        }

        if (notes.length > 1000) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Notes cannot exceed 1000 characters.'
            });
        }

        if (requestedStatus === 'FAILED' && !notes) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Please provide a reason when reporting an allocation failure.'
            });
        }

        const initialAllocation = await Allocation.findByPk(
            allocationId,
            {
                attributes: ['id', 'reservation_id'],
                include: [{
                    model: DonationReservation,
                    as: 'reservation',
                    attributes: [
                        'id',
                        'donation_id',
                        'ngo_organization_id'
                    ],
                    required: true
                }],
                transaction
            }
        );

        if (!initialAllocation || !initialAllocation.reservation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Allocation not found.'
            });
        }

        const donationId = initialAllocation.reservation.donation_id;

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

        const allocation = await Allocation.findByPk(allocationId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!allocation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Allocation not found.'
            });
        }

        const reservation = await DonationReservation.findByPk(
            allocation.reservation_id,
            { transaction }
        );

        if (
            !reservation ||
            reservation.donation_id !== donation.id ||
            reservation.ngo_organization_id !==
                initialAllocation.reservation.ngo_organization_id
        ) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Associated reservation not found.'
            });
        }

        const donorOrganizationId = donation.donor_organization_id;
        const ngoOrganizationId = reservation.ngo_organization_id;

        const memberships = await OrganizationMember.findAll({
            where: {
                user_id: userId,
                organization_id: {
                    [Op.in]: [
                        donorOrganizationId,
                        ngoOrganizationId
                    ]
                }
            },
            transaction
        });

        if (memberships.length === 0) {
            await transaction.rollback();

            return res.status(403).json({
                success: false,
                message: 'You do not belong to either organization participating in this allocation.'
            });
        }

        const isDonorMember = memberships.some(
            membership =>
                membership.organization_id === donorOrganizationId
        );

        const isNgoMember = memberships.some(
            membership =>
                membership.organization_id === ngoOrganizationId
        );

        const currentStatus = allocation.status;

        let actorOrganizationId;

        if (requestedStatus === 'PICKED_UP') {
            if (currentStatus !== 'READY_FOR_PICKUP') {
                await transaction.rollback();

                return res.status(409).json({
                    success: false,
                    message: `Cannot mark allocation as PICKED_UP from ${currentStatus}.`
                });
            }

            if (!isNgoMember) {
                await transaction.rollback();

                return res.status(403).json({
                    success: false,
                    message: 'Only the recipient NGO can confirm pickup.'
                });
            }

            actorOrganizationId = ngoOrganizationId;
        }

        if (requestedStatus === 'DELIVERED') {
            if (currentStatus !== 'PICKED_UP') {
                await transaction.rollback();

                return res.status(409).json({
                    success: false,
                    message: `Cannot mark allocation as DELIVERED from ${currentStatus}.`
                });
            }

            if (!isNgoMember) {
                await transaction.rollback();

                return res.status(403).json({
                    success: false,
                    message: 'Only the recipient NGO can confirm delivery.'
                });
            }

            actorOrganizationId = ngoOrganizationId;
        }

        if (requestedStatus === 'FAILED') {
            if (
                !['READY_FOR_PICKUP', 'PICKED_UP'].includes(currentStatus)
            ) {
                await transaction.rollback();

                return res.status(409).json({
                    success: false,
                    message: `Cannot mark allocation as FAILED from ${currentStatus}.`
                });
            }

            actorOrganizationId = isNgoMember
                ? ngoOrganizationId
                : isDonorMember
                    ? donorOrganizationId
                    : null;
        }

        if (!actorOrganizationId) {
            await transaction.rollback();

            return res.status(403).json({
                success: false,
                message: 'You are not authorized to perform this allocation update.'
            });
        }

        const actorOrganization = await Organization.findByPk(
            actorOrganizationId,
            {
                attributes: ['id', 'name'],
                transaction
            }
        );

        const now = new Date();

        const updateValues = {
            status: requestedStatus
        };

        if (requestedStatus === 'PICKED_UP') {
            updateValues.picked_up_at = now;
        }

        if (requestedStatus === 'DELIVERED') {
            updateValues.delivered_at = now;
        }

        if (notes) {
            updateValues.pickup_notes = notes;
        }

        await allocation.update(updateValues, { transaction });

        await AllocationEvent.create(
            {
                allocation_id: allocation.id,
                previous_status: currentStatus,
                new_status: requestedStatus,
                changed_by: userId,
                notes: notes || null
            },
            { transaction }
        );

        const recipientOrganizationId =
            actorOrganizationId === ngoOrganizationId
                ? donorOrganizationId
                : ngoOrganizationId;

        const recipientOrganization = await Organization.findByPk(
            recipientOrganizationId,
            {
                attributes: ['id', 'name'],
                transaction
            }
        );

        const recipientMembers = await OrganizationMember.findAll({
            where: {
                organization_id: recipientOrganizationId
            },
            attributes: ['user_id'],
            transaction
        });

        const recipientUserIds = [
            ...new Set(
                recipientMembers.map(member => member.user_id)
            )
        ];

        if (recipientUserIds.length > 0) {
            const notificationMessage = requestedStatus === 'FAILED'
                ? `${actorOrganization.name} reported a failure for "${donation.title}". Reason: ${notes}`
                : `${actorOrganization.name} updated the allocation for "${donation.title}" to ${requestedStatus}.`;

            await Notification.bulkCreate(
                recipientUserIds.map(recipientUserId => ({
                    user_id: recipientUserId,
                    type: `ALLOCATION_${requestedStatus}`,
                    title: `Allocation ${requestedStatus.replace('_', ' ').toLowerCase()}`,
                    message: notificationMessage,
                    reference_type: 'ALLOCATION',
                    reference_id: allocation.id,
                    is_read: false
                })),
                { transaction }
            );
        }

        const responseBody = {
            success: true,
            message: 'Allocation status updated successfully.',
            data: {
                allocationId: allocation.id,
                previousStatus: currentStatus,
                status: requestedStatus,
                reservationId: reservation.id,
                donationId: donation.id,
                quantity: Number(reservation.quantity),
                pickupNotes: allocation.pickup_notes,
                pickedUpAt: allocation.picked_up_at,
                deliveredAt: allocation.delivered_at,
                updatedAt: now
            }
        };

        await transaction.commit();

        return res.status(200).json(responseBody);

    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }

        console.error('Update allocation status error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to update allocation status.',
            error: error.message
        });
    }
};


module.exports = {
    getMyAllocations,
    getAllocationDetails,
    updateAllocationStatus
}
