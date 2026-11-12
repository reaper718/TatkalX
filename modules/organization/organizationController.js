const Organizations = require('../../models/Organizations');
const OrganizationMembers = require('../../models/Organozation_members');
const Users = require('../../models/Users');
const AuditLog = require('../../models/AuditLogs');
const Notification = require('../../models/Notifications');
const sequelize = require('../../utils/db-connection');

const getMyOrganizations = async (req, res) => {
    try {
        const userId = req.user.id;

        const memberships = await OrganizationMembers.findAll({
            where: {
                user_id: userId
            },

            attributes: [
                'id',
                'role',
                'createdAt'
            ],

            include: [
                {
                    model: Organizations,
                    as: 'organization',
                    attributes: [
                        'id',
                        'name',
                        'type',
                        'description',
                        'email',
                        'phone',
                        'address',
                        'city',
                        'verification_status',
                        'is_active',
                        'createdAt'
                    ]
                }
            ],

            order: [['createdAt', 'DESC']]
        });

        const organizations = memberships
            .filter(membership => membership.organization)
            .map(membership => ({
                membershipId: membership.id,
                role: membership.role,
                joinedAt: membership.createdAt,
                organization: membership.organization
            }));

        return res.status(200).json({
            success: true,
            message: 'Organizations fetched successfully',
            count: organizations.length,
            organizations
        });

    } catch (error) {
        console.error('Get my organizations error:', error);

        return res.status(500).json({
            success: false,
            message: 'Something went wrong'
        });
    }
};

const getOrganizationById = async (req, res) => {
    try {
        const organizationId = req.params.id;
        const userId = req.user.id;

        const organization = await Organizations.findByPk(
            organizationId,
            {
                attributes: [
                    'id',
                    'name',
                    'type',
                    'description',
                    'email',
                    'phone',
                    'address',
                    'city',
                    'verification_status',
                    'is_active',
                    'createdAt'
                ]
            }
        );

        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const membership = await OrganizationMembers.findOne({
            where: {
                organization_id: organizationId,
                user_id: userId
            },
            attributes: ['id', 'role']
        });

        const isMember = !!membership;

        const isPubliclyVisible =
            organization.verification_status === 'VERIFIED' &&
            organization.is_active;

        if (!isMember && !isPubliclyVisible) {
            return res.status(403).json({
                success: false,
                message: 'You are not allowed to view this organization'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Organization details fetched successfully',

            organization: {
                ...organization.toJSON(),

                membership: membership
                    ? {
                        role: membership.role
                    }
                    : null
            }
        });

    } catch (error) {
        console.error('Get organization error:', error);

        return res.status(500).json({
            success: false,
            message: 'Something went wrong'
        });
    }
};

const updateMyOrganization = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const userId = req.user.id;

        const {
            name,
            phone,
            address,
            latitude,
            longitude
        } = req.body;

        const membership = await OrganizationMembers.findOne({
            where: {
                user_id: userId
            },
            transaction
        });

        if (!membership) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'You do not belong to any organization'
            });
        }

        if (!['OWNER', 'MANAGER'].includes(membership.role)) {
            await transaction.rollback();

            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this organization'
            });
        }

        const organization = await Organizations.findByPk(
            membership.organization_id,
            { transaction }
        );

        if (!organization) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }


            organization.name = name.trim();
            organization.phone = phone;
            organization.address = address.trim();
            organization.location = {
                type: 'Point',
                coordinates: [longitude, latitude]
            };

        await organization.save({ transaction });
        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: 'Organization updated successfully',
            organization: {
                id: organization.id,
                name: organization.name,
                phone: organization.phone,
                address: organization.address,
                city: organization.city,
                verification_status: organization.verification_status
            }
        });

    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback();
        }

        console.error('Update organization error:', error);

        return res.status(500).json({
            success: false,
            message: 'Something went wrong'
        });
    }
};

const getPendingOrganizations = async (req,res) => {
    try {
        const organizations = await Organizations.findAll({
            where: {
                verification_status: "PENDING"
            }
        });

        return res.status(200).json({
            success: true,
            organizations
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        })
    }
}

const verifyOrganization = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks } = req.body;

        const result = await sequelize.transaction(async (transaction) => {

            const organization = await Organizations.findByPk(id, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            if (!organization) {
                const error = new Error('Organization not found');
                error.statusCode = 404;
                throw error;
            }

            const previousStatus = organization.verification_status;

            organization.verification_status = status;

            await organization.save({ transaction });

            await AuditLog.create({
                actor_user_id: req.user.id,
                action: 'ORGANIZATION_VERIFICATION_UPDATED',
                entity_type: 'ORGANIZATION',
                entity_id: organization.id,
                metadata: {
                    previousStatus,
                    newStatus: status,
                    remarks: remarks || null
                }
            }, { transaction });

            const owners = await OrganizationMembers.findAll({
                where: {
                    organization_id: organization.id,
                    role: 'OWNER'
                },
                attributes: ['user_id'],
                transaction
            });

            const notificationMessages = {
                VERIFIED: {
                    title: 'Organization Verified',
                    message: `Your organization "${organization.name}" has been verified.`
                },
                REJECTED: {
                    title: 'Organization Verification Rejected',
                    message: `Your organization "${organization.name}" verification was rejected.`
                },
                SUSPENDED: {
                    title: 'Organization Suspended',
                    message: `Your organization "${organization.name}" has been suspended.`
                }
            };

            const notification = notificationMessages[status];

            if (owners.length > 0) {
                await Notification.bulkCreate(
                    owners.map(owner => ({
                        user_id: owner.user_id,
                        type: `ORGANIZATION_${status}`,
                        title: notification.title,
                        message: remarks
                            ? `${notification.message} Remarks: ${remarks}`
                            : notification.message,
                        reference_type: 'ORGANIZATION',
                        reference_id: organization.id,
                        is_read: false
                    })),
                    { transaction }
                );
            }

            return {
                organization,
                previousStatus,
                notifiedOwners: owners.length
            };
        });

        return res.status(200).json({
            success: true,
            message: 'Organization verification status updated successfully',
            organization: {
                id: result.organization.id,
                name: result.organization.name,
                verification_status: result.organization.verification_status
            },
            previousStatus: result.previousStatus,
            notifiedOwners: result.notifiedOwners
        });

    } catch (error) {
        console.error('Verify organization error:', error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: 'Something went wrong'
        });
    }
};

module.exports = {
    getMyOrganizations,
    getOrganizationById,
    updateMyOrganization,
    getPendingOrganizations,
    verifyOrganization
};