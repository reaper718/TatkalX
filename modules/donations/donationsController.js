const { Op } = require("sequelize");
const Donation = require("../../models/Donations");
const Organization = require("../../models/Organizations");
const OrganizationMember = require("../../models/Organozation_members");
const User = require('../../models/Users');
const DonationReservation = require('../../models/Donation_reservations');
const Allocation = require('../../models/allocation');
const AuditLog = require('../../models/AuditLogs');
const Notification = require('../../models/Notifications');
const IdempotencyKey = require('../../models/IdempotencyKey');
const sequelize = require("../../utils/db-connection");


const createDonation = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      title,
      description,
      category,
      dietaryType,
      totalQuantity,
      unit,
      preparedAt,
      pickupDeadline,
      safeConsumptionDeadline,
      storageInstructions,
      packagingDetails,
      allergens,
      pickupAddress,
      latitude,
      longitude,
    } = req.body;

    const allowedDietaryTypes = [
      "VEGETARIAN",
      "NON_VEGETARIAN",
      "VEGAN",
      "UNKNOWN",
    ];

    if (
      dietaryType !== undefined &&
      dietaryType !== null &&
      !allowedDietaryTypes.includes(dietaryType)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid dietary type",
      });
    }

    const quantity = Number(totalQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Total quantity must be greater than zero",
      });
    }

    const pickupDate = new Date(pickupDeadline);

    if (Number.isNaN(pickupDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid pickup deadline",
      });
    }

    if (pickupDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Pickup deadline must be in the future",
      });
    }

    let preparedDate = null;

    if (preparedAt !== undefined && preparedAt !== null) {
      preparedDate = new Date(preparedAt);

      if (Number.isNaN(preparedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid prepared date",
        });
      }

      if (preparedDate > new Date()) {
        return res.status(400).json({
          success: false,
          message: "Prepared date cannot be in the future",
        });
      }

      if (preparedDate > pickupDate) {
        return res.status(400).json({
          success: false,
          message: "Prepared date cannot be after pickup deadline",
        });
      }
    }

    let safeDate = null;

    if (
      safeConsumptionDeadline !== undefined &&
      safeConsumptionDeadline !== null
    ) {
      safeDate = new Date(safeConsumptionDeadline);

      if (Number.isNaN(safeDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid safe consumption deadline",
        });
      }

      if (safeDate < pickupDate) {
        return res.status(400).json({
          success: false,
          message: "Safe consumption deadline cannot be before pickup deadline",
        });
      }
    }

    const donationAllergens = allergens ?? [];

    if (
      !Array.isArray(donationAllergens) ||
      !donationAllergens.every((item) => typeof item === "string")
    ) {
      return res.status(400).json({
        success: false,
        message: "Allergens must be an array of strings",
      });
    }
    const memberships = await OrganizationMember.findAll({
      where: {
        user_id: userId,
      },
      include: [
        {
          model: Organization,
          as: "organization",
          required: true,
        },
      ],
    });

    const eligibleMemberships = memberships.filter((membership) => {
      const organization = membership.organization;

      return (
        organization &&
        organization.type === "DONOR" &&
        organization.is_active === true &&
        organization.verification_status === "VERIFIED" &&
        ["OWNER", "MANAGER"].includes(membership.role)
      );
    });

    if (eligibleMemberships.length === 0) {
      return res.status(403).json({
        success: false,
        message:
          "You need an OWNER or MANAGER membership in an active, verified DONOR organization to create donations",
      });
    }

    if (eligibleMemberships.length > 1) {
      return res.status(409).json({
        success: false,
        message:
          "You belong to multiple eligible donor organizations. Select an active organization before creating a donation.",
      });
    }

    const donorOrganization = eligibleMemberships[0].organization;

    const donation = await Donation.create({
      donor_organization_id: donorOrganization.id,

      title: title.trim(),
      description: description ?? null,
      category: category.trim(),
      dietary_type: dietaryType ?? null,

      total_quantity: quantity,
      reserved_quantity: 0,
      allocated_quantity: 0,
      unit: unit.trim(),

      prepared_at: preparedDate,
      pickup_deadline: pickupDate,
      safe_consumption_deadline: safeDate,

      storage_instructions: storageInstructions ?? null,
      packaging_details: packagingDetails ?? null,
      allergens: donationAllergens,

      pickup_address: pickupAddress.trim(),

      pickup_location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },

      status: "DRAFT",
    });

    return res.status(201).json({
      success: true,
      message: "Donation created successfully",
      donation,
    });
  } catch (error) {
    console.error("Create donation error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while creating donation",
    });
  }
};

const publishDonation = async (req, res) => {
  try {
    const userId = req.user.id;
    const donationId = req.params.id;

    const result = await sequelize.transaction(async (transaction) => {
      const donation = await Donation.findByPk(donationId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!donation) {
        throw new Error("Donation not found");
      }

      if (donation.status !== "DRAFT") {
        throw new Error(
          `only DRAFT donations can be published, Current donation status ${donation.status}`,
        );
      }

      const organization = await Organization.findByPk(
        donation.donor_organization_id,
        {
          transaction,
        },
      );

      if (!organization) {
        throw new Error("Donor organization not found");
      }

      if (
        organization.type !== "DONOR" ||
        organization.verification_status !== "VERIFIED" ||
        !organization.is_active
      ) {
        throw new Error(
          "Organization must be an active, verified DONOR organization",
        );
      }

      const membership = await OrganizationMember.findOne({
        where: {
          user_id: userId,
          organization_id: organization.id,
          role: ["OWNER", "MANAGER"],
        },
        transaction,
      });

      if (!membership) {
        throw new Error("You do not have permission to publish this donation");
      }

      const quantity = Number(donation.total_quantity);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        const error = new Error("Donation quantity must be greater than zero");
        error.statusCode = 400;
        throw error;
      }

      const pickupDeadline = new Date(donation.pickup_deadline);

      if (
        Number.isNaN(pickupDeadline.getTime()) ||
        pickupDeadline <= new Date()
      ) {
        const error = new Error("Pickup deadline must be a valid future date");
        error.statusCode = 400;
        throw error;
      }

      if (donation.prepared_at) {
        const preparedAt = new Date(donation.prepared_at);

        if (
          Number.isNaN(preparedAt.getTime()) ||
          preparedAt > new Date() ||
          preparedAt > pickupDeadline
        ) {
          const error = new Error("Invalid preparation date");
          error.statusCode = 400;
          throw error;
        }
      }

      if (donation.safe_consumption_deadline) {
        const safeDeadline = new Date(donation.safe_consumption_deadline);

        if (
          Number.isNaN(safeDeadline.getTime()) ||
          safeDeadline < pickupDeadline
        ) {
          const error = new Error(
            "Safe consumption deadline cannot be before pickup deadline",
          );
          error.statusCode = 400;
          throw error;
        }
      }

      const reserved = Number(donation.reserved_quantity || 0);
      const allocated = Number(donation.allocated_quantity || 0);

      if (reserved < 0 || allocated < 0 || reserved + allocated > quantity) {
        const error = new Error("Donation quantity allocation is invalid");
        error.statusCode = 400;
        throw error;
      }

      donation.status = "PUBLISHED";

      await donation.save({ transaction });

      return donation;
    });

    return res.status(200).json({
      success: true,
      message: "Donation published successfully",
      donation: result,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const getAllDonations = async (req,res) => {
    try {
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = Number.parseInt(req.query.limit, 10) || 10;

        const offset = (page - 1) * limit;

        const { category, dietaryType } = req.query;

        const whereCondition = {
            status: 'PUBLISHED',
            pickup_deadline: {
                [Op.gt]: new Date()
            }
        };

        if(category){
            whereCondition.category = category;
        }

        if(dietaryType){
            whereCondition.dietary_type = dietaryType
        }

        const availableQuantity = sequelize.literal(
            '"donation"."total_quantity" - ' +
            'COALESCE("donation"."reserved_quantity", 0) - ' +
            'COALESCE("donation"."allocated_quantity", 0)'
        );

        const { count, rows } = await Donation.findAndCountAll({
            where: {
                ...whereCondition,
                [Op.and]: [
                    sequelize.where(
                        availableQuantity,
                        {
                            [Op.gt]: 0
                        }
                    )
                ]
            },
            attributes: {
                include: [
                    [
                        availableQuantity,
                        'available_qunatity'
                    ]
                ]
            },

            include: [
                {
                    model: Organization,
                    as: 'donorOrganization',
                    attributes: [
                        'id','name', 'type', 'city', 'verification_status'
                    ],
                    required: true,
                    where: {
                        is_active: true,
                        verification_status: 'VERIFIED',
                        type: 'DONOR'
                    }
                }
            ],
            order: [
                ['pickup_deadline', 'ASC'],
                ['createdAt', 'DESC']
            ],

            limit,
            offset,
            distinct: true
        });

        const totalPages = Math.ceil(count / limit);

        return res.status(200).json({
            success: true,
            message: "ELigible donation fetched successfully",

            pagination: {
                totalItems: count,
                currentPage: page,
                totalPages,
                limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            },

            donations: rows
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        })
    }
}

const getDonationById = async (req,res) => {
    try {
        const { id } = req.params;

        const donation = await Donation.findByPk(id, {
            include: [
                {
                    model: Organization,
                    as: 'donorOrganization',
                    attributes: [
                        'id',
                        'name',
                        'type',
                        'description',
                        'email',
                        'phone',
                        'city',
                        'address',
                        'verification_status'
                    ]
                }
            ]
        });

        if(!donation){
            return res.status(404).json({
                success: false,
                message: "DOnation not found"
            })
        }

        let isAdmin = false;
        let isDonorMember = false;
        let ngoOrganizationIds = [];

        const user = await User.findByPk(req.user.id, {
            attributes: ['id','system_role','is_active']
        });

        if(user && user.is_active){
            isAdmin = user.system_role === 'ADMIN';

            const memberships = await OrganizationMember.findAll({
                where: {
                    user_id: req.user.id
                },
                attributes: ['organization_id']
            });

            const organizationIds = memberships.map(
                memberships => memberships.organization_id
            );

            isDonorMember = organizationIds.includes(
                donation.donor_organization_id
            );

            if(!isDonorMember && !isAdmin){
                ngoOrganizationIds = organizationIds
            }
        }

        const canViewPrivateDonation = isAdmin || isDonorMember;

        if (
            donation.status !== 'PUBLISHED' &&
            !canViewPrivateDonation
        ) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to view this donation'
            });
        }

        const totalQuantity = Number(donation.total_quantity);
        const reservedQuantity = Number(donation.reserved_quantity || 0);
        const allocatedQuantity = Number(donation.allocated_quantity || 0);

        const availableQuantity = Math.max(
            0,
            totalQuantity - reservedQuantity - allocatedQuantity
        );

         const canViewAllReservations = isAdmin || isDonorMember;

        const reservationWhere = {};

        if (!canViewAllReservations) {
            if (ngoOrganizationIds.length === 0) {
                reservationWhere.id = null;
            } else {
                reservationWhere.ngo_organization_id = {
                    [Op.in]: ngoOrganizationIds
                };
            }
        }

        let reservations = [];

        if (canViewAllReservations || ngoOrganizationIds.length > 0) {
            reservations = await DonationReservation.findAll({
                where: {
                    donation_id: donation.id,
                    ...(
                        canViewAllReservations
                            ? {}
                            : reservationWhere
                    )
                },
                include: [
                    {
                        model: Organization,
                        as: 'ngoOrganization',
                        attributes: [
                            'id',
                            'name',
                            'city'
                        ]
                    },
                    {
                        model: Allocation,
                        as: 'allocation'
                    }
                ],
                order: [['createdAt', 'DESC']]
            });
        }

        const donationData = donation.toJSON();

        donationData.available_quantity = availableQuantity;

        if (canViewAllReservations || ngoOrganizationIds.length > 0) {
            donationData.reservations = reservations;
        }

        return res.status(200).json({
            success: true,
            message: 'Donation details fetched successfully',
            donation: donationData
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        })
    }
}

const getMyDonations = async (req, res) => {
    try {
        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const limit = Math.min(
            50,
            Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
        );

        const offset = (page - 1) * limit;

        const { status } = req.query;

        const allowedStatuses = [
            'DRAFT',
            'PUBLISHED',
            'CANCELLED',
            'EXPIRED',
            'COMPLETED'
        ];

        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid donation status',
                allowedStatuses
            });
        }

        const memberships = await OrganizationMember.findAll({
            where: {
                user_id: req.user.id
            },
            include: [
                {
                    model: Organization,
                    as: 'organization',
                    where: {
                        type: 'DONOR'
                    },
                    required: true
                }
            ]
        });

        if (memberships.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'You do not belong to any donor organization'
            });
        }

        if (memberships.length > 1) {
            return res.status(409).json({
                success: false,
                message: 'You belong to multiple donor organizations. Please select an organization.',
                organizations: memberships.map(membership => ({
                    id: membership.organization.id,
                    name: membership.organization.name,
                    role: membership.role
                }))
            });
        }

        const organizationId = memberships[0].organization_id;

        const whereCondition = {
            donor_organization_id: organizationId
        };

        if (status) {
            whereCondition.status = status;
        }

        const { count, rows } = await Donation.findAndCountAll({
            where: whereCondition,

            include: [
                {
                    model: Organization,
                    as: 'donorOrganization',
                    attributes: [
                        'id',
                        'name',
                        'type',
                        'city',
                        'verification_status'
                    ]
                }
            ],

            order: [
                ['createdAt', 'DESC']
            ],

            limit,
            offset,
            distinct: true
        });

        const totalPages = Math.ceil(count / limit);

        return res.status(200).json({
            success: true,
            message: 'Your donations fetched successfully',

            organization: {
                id: memberships[0].organization.id,
                name: memberships[0].organization.name
            },

            pagination: {
                totalItems: count,
                currentPage: page,
                totalPages,
                limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            },

            donations: rows
        });

    } catch (error) {
        console.error('Get my donations error:', error);

        return res.status(500).json({
            success: false,
            message: 'Something went wrong'
        });
    }
};

const updateDonation = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id } = req.params;
        const userId = req.user.id;

        const editableFields = {
            title: 'title',
            description: 'description',
            category: 'category',
            dietaryType: 'dietary_type',
            dietary_type: 'dietary_type',
            preparedAt: 'prepared_at',
            prepared_at: 'prepared_at',
            pickupDeadline: 'pickup_deadline',
            pickup_deadline: 'pickup_deadline',
            safeConsumptionDeadline: 'safe_consumption_deadline',
            safe_consumption_deadline: 'safe_consumption_deadline',
            storageInstructions: 'storage_instructions',
            storage_instructions: 'storage_instructions',
            packagingDetails: 'packaging_details',
            packaging_details: 'packaging_details',
            allergens: 'allergens',
            pickupAddress: 'pickup_address',
            pickup_address: 'pickup_address'
        };

        const protectedFields = [
            'totalQuantity',
            'total_quantity',
            'reservedQuantity',
            'reserved_quantity',
            'allocatedQuantity',
            'allocated_quantity',
            'donorOrganizationId',
            'donor_organization_id',
            'status'
        ];

        const requestFields = Object.keys(req.body);

        const attemptedProtectedFields = requestFields.filter(
            field => protectedFields.includes(field)
        );

        if (attemptedProtectedFields.length > 0) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'You cannot modify quantity counters, donor organization or donation status.',
                restrictedFields: attemptedProtectedFields
            });
        }

        const updates = {};

        for (const [requestField, modelField] of Object.entries(editableFields)) {
            if (Object.prototype.hasOwnProperty.call(req.body, requestField)) {
                updates[modelField] = req.body[requestField];
            }
        }

        const hasLatitude = req.body.latitude !== undefined;
        const hasLongitude = req.body.longitude !== undefined;

        if (hasLatitude !== hasLongitude) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Both latitude and longitude are required to update pickup location.'
            });
        }

        if (hasLatitude && hasLongitude) {
            const latitude = Number(req.body.latitude);
            const longitude = Number(req.body.longitude);

            if (
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude) ||
                latitude < -90 ||
                latitude > 90 ||
                longitude < -180 ||
                longitude > 180
            ) {
                await transaction.rollback();

                return res.status(400).json({
                    success: false,
                    message: 'Invalid latitude or longitude.'
                });
            }

            updates.pickup_location = {
                type: 'Point',
                coordinates: [longitude, latitude]
            };
        }

        if (Object.keys(updates).length === 0) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'No valid editable fields provided.'
            });
        }

        if (
            updates.title !== undefined &&
            (typeof updates.title !== 'string' ||
                !updates.title.trim() ||
                updates.title.length > 180)
        ) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Title is required and must not exceed 180 characters.'
            });
        }

        if (
            updates.description !== undefined &&
            typeof updates.description !== 'string'
        ) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Description must be a string.'
            });
        }

        if (
            updates.category !== undefined &&
            (typeof updates.category !== 'string' ||
                !updates.category.trim() ||
                updates.category.length > 60)
        ) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Invalid donation category.'
            });
        }

        const allowedDietaryTypes = [
            'VEGETARIAN',
            'NON_VEGETARIAN',
            'VEGAN',
            'UNKNOWN'
        ];

        if (
            updates.dietary_type !== undefined &&
            !allowedDietaryTypes.includes(updates.dietary_type)
        ) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Invalid dietary type.'
            });
        }

        if (
            updates.pickup_address !== undefined &&
            (typeof updates.pickup_address !== 'string' ||
                !updates.pickup_address.trim())
        ) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Pickup address cannot be empty.'
            });
        }

        if (
            updates.allergens !== undefined &&
            (!Array.isArray(updates.allergens) ||
                !updates.allergens.every(item => typeof item === 'string'))
        ) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Allergens must be an array of strings.'
            });
        }

        const donation = await Donation.findByPk(id, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!donation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Donation not found.'
            });
        }

        if (['CANCELLED', 'EXPIRED', 'COMPLETED'].includes(donation.status)) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: `Cannot update a ${donation.status.toLowerCase()} donation.`
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
                message: 'Only the donor organization OWNER or MANAGER can update this donation.'
            });
        }

        const deadlineFields = [
            'pickup_deadline',
            'safe_consumption_deadline'
        ];

        const deadlineChanged = deadlineFields.some(field => {
            if (updates[field] === undefined) return false;

            const oldValue = donation[field]
                ? new Date(donation[field]).getTime()
                : null;

            const newValue = updates[field]
                ? new Date(updates[field]).getTime()
                : null;

            return oldValue !== newValue;
        });

        if (deadlineChanged) {
            const reservationCount = await DonationReservation.count({
                where: {
                    donation_id: donation.id
                },
                transaction
            });

            if (reservationCount > 0) {
                await transaction.rollback();

                return res.status(409).json({
                    success: false,
                    message: 'Deadlines cannot be changed because reservations already exist.'
                });
            }
        }

        const finalPickupDeadline = new Date(
            updates.pickup_deadline ?? donation.pickup_deadline
        );

        const finalPreparedAt = updates.prepared_at !== undefined
            ? (updates.prepared_at ? new Date(updates.prepared_at) : null)
            : donation.prepared_at
                ? new Date(donation.prepared_at)
                : null;

        const finalSafeDeadline = updates.safe_consumption_deadline !== undefined
            ? (updates.safe_consumption_deadline
                ? new Date(updates.safe_consumption_deadline)
                : null)
            : donation.safe_consumption_deadline
                ? new Date(donation.safe_consumption_deadline)
                : null;

        if (
            updates.pickup_deadline !== undefined &&
            (
                !Number.isFinite(finalPickupDeadline.getTime()) ||
                finalPickupDeadline <= new Date()
            )
        ) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Pickup deadline must be a valid future date.'
            });
        }

        if (
            updates.prepared_at !== undefined &&
            updates.prepared_at !== null &&
            (
                !finalPreparedAt ||
                !Number.isFinite(finalPreparedAt.getTime()) ||
                finalPreparedAt > new Date() ||
                finalPreparedAt > finalPickupDeadline
            )
        ) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Prepared date must be valid, cannot be in the future, and cannot be after pickup deadline.'
            });
        }

        if (
            updates.safe_consumption_deadline !== undefined &&
            updates.safe_consumption_deadline !== null &&
            (
                !finalSafeDeadline ||
                !Number.isFinite(finalSafeDeadline.getTime()) ||
                finalSafeDeadline < finalPickupDeadline
            )
        ) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Safe consumption deadline cannot be before pickup deadline.'
            });
        }

        Object.assign(donation, updates);

        await donation.save({ transaction });

        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: 'Donation updated successfully.',
            donation
        });

    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback();
        }

        console.error('Update donation error:', error);

        return res.status(500).json({
            success: false,
            message: 'Something went wrong.'
        });
    }
};


const cancelDonation = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id } = req.params;
        const userId = req.user.id;

        const donation = await Donation.findByPk(id, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!donation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Donation not found.'
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
                message: 'Only the donor organization OWNER or MANAGER can cancel this donation.'
            });
        }

        if (!['DRAFT', 'PUBLISHED'].includes(donation.status)) {
            await transaction.rollback();

            return res.status(409).json({
                success: false,
                message: `Cannot cancel a donation with status ${donation.status}.`
            });
        }

        const previousStatus = donation.status;

        const reservations = await DonationReservation.findAll({
            where: {
                donation_id: donation.id
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        const reservationIds = reservations.map(
            reservation => reservation.id
        );

        let allocations = [];

        if (reservationIds.length > 0) {
            allocations = await Allocation.findAll({
                where: {
                    reservation_id: {
                        [Op.in]: reservationIds
                    }
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
        }

        const allocationMap = new Map(
            allocations.map(allocation => [
                allocation.reservation_id,
                allocation
            ])
        );

        const blockingReservations = reservations.filter(reservation => {
            const allocation = allocationMap.get(reservation.id);

            const hasActiveAllocation =
                allocation &&
                [
                    'READY_FOR_PICKUP',
                    'PICKED_UP',
                    'DELIVERED'
                ].includes(allocation.status);

            return (
                reservation.status === 'CONFIRMED' ||
                hasActiveAllocation
            );
        });

        if (blockingReservations.length > 0) {
            await transaction.rollback();

            return res.status(409).json({
                success: false,
                message: 'This donation cannot be cancelled because confirmed reservations or active allocations exist.',
                blockingReservations: blockingReservations.map(reservation => ({
                    reservationId: reservation.id,
                    status: reservation.status,
                    allocationStatus:
                        allocationMap.get(reservation.id)?.status || null
                }))
            });
        }

        const pendingReservations = reservations.filter(
            reservation => reservation.status === 'PENDING'
        );

        const quantityToRelease = pendingReservations.reduce(
            (total, reservation) => {
                return total + Number(reservation.quantity);
            },
            0
        );

        const currentReservedQuantity = Number(
            donation.reserved_quantity || 0
        );

        if (
            quantityToRelease > currentReservedQuantity ||
            currentReservedQuantity < 0
        ) {
            await transaction.rollback();

            return res.status(409).json({
                success: false,
                message: 'Reservation quantities are inconsistent with the donation reserved quantity. Cancellation was stopped.'
            });
        }

        const affectedNgoIds = [
            ...new Set(
                pendingReservations.map(
                    reservation => reservation.ngo_organization_id
                )
            )
        ];

        if (pendingReservations.length > 0) {
            await DonationReservation.update(
                {
                    status: 'CANCELLED'
                },
                {
                    where: {
                        id: {
                            [Op.in]: pendingReservations.map(
                                reservation => reservation.id
                            )
                        },
                        status: 'PENDING'
                    },
                    transaction
                }
            );
        }

        donation.reserved_quantity =
            currentReservedQuantity - quantityToRelease;

        donation.status = 'CANCELLED';

        await donation.save({ transaction });

        await AuditLog.create(
            {
                actor_user_id: userId,
                action: 'DONATION_CANCELLED',
                entity_type: 'DONATION',
                entity_id: donation.id,
                metadata: {
                    previousStatus,
                    newStatus: 'CANCELLED',
                    cancelledReservationCount: pendingReservations.length,
                    releasedQuantity: quantityToRelease,
                    affectedNgoIds
                }
            },
            { transaction }
        );

        let notifications = [];

        if (affectedNgoIds.length > 0) {
            const ngoMembers = await OrganizationMember.findAll({
                where: {
                    organization_id: {
                        [Op.in]: affectedNgoIds
                    }
                },
                attributes: ['user_id'],
                transaction
            });

            const uniqueUserIds = [
                ...new Set(
                    ngoMembers.map(member => member.user_id)
                )
            ];

            notifications = uniqueUserIds.map(memberUserId => ({
                user_id: memberUserId,
                type: 'DONATION_CANCELLED',
                title: 'Donation cancelled',
                message: `The donation "${donation.title}" has been cancelled by the donor organization.`,
                reference_type: 'DONATION',
                reference_id: donation.id,
                is_read: false
            }));

            if (notifications.length > 0) {
                await Notification.bulkCreate(notifications, {
                    transaction
                });
            }
        }

        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: 'Donation cancelled successfully.',
            cancellation: {
                donationId: donation.id,
                previousStatus,
                status: donation.status,
                cancelledReservations: pendingReservations.length,
                releasedQuantity: quantityToRelease,
                affectedNGOs: affectedNgoIds.length,
                notificationsCreated: notifications.length
            }
        });

    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback();
        }

        console.error('Cancel donation error:', error);

        return res.status(500).json({
            success: false,
            message: 'Something went wrong.'
        });
    }
};

const createReservation = async (req, res) => {
    const transaction = await sequelize.transaction();
    console.log('Authenticated user ID:', req.user.id);
    try {
        const donationId = req.params.id;
        const userId = req.user.id;
        const quantity = Number(req.body.quantity);
        const idempotencyKey = req.get('Idempotency-Key');

        if (!idempotencyKey || idempotencyKey.length > 255) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'A valid Idempotency-Key header is required.'
            });
        }

        const membership = await OrganizationMember.findOne({
            where: {
                user_id: userId
            },
            transaction
        });

        if (!membership) {
            await transaction.rollback();

            return res.status(403).json({
                success: false,
                message: 'You must belong to an active, verified NGO organization to create reservations.'
            });
        }

        const ngoOrganization = await Organization.findOne({
            where: {
                id: membership.organization_id,
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

        const ngoOrganizationId = ngoOrganization.id;

        const donation = await Donation.findByPk(donationId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!donation) {
            await transaction.rollback();

            return res.status(404).json({
                success: false,
                message: 'Donation not found.'
            });
        }

        const operation = `CREATE_DONATION_RESERVATION:${donationId}`;

        const existingRequest = await IdempotencyKey.findOne({
            where: {
                user_id: userId,
                operation,
                key: idempotencyKey
            },
            transaction
        });

        if (existingRequest) {
            await transaction.commit();

            return res
                .status(existingRequest.response_status)
                .json(existingRequest.response_body);
        }

        if (donation.status !== 'PUBLISHED') {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'Only published donations can be reserved.'
            });
        }

        const now = new Date();

        if (new Date(donation.pickup_deadline) <= now) {
            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: 'The pickup deadline for this donation has passed.'
            });
        }

        const totalQuantity = Number(donation.total_quantity);
        const reservedQuantity = Number(donation.reserved_quantity || 0);
        const allocatedQuantity = Number(donation.allocated_quantity || 0);

        const availableQuantity =
            totalQuantity - reservedQuantity - allocatedQuantity;

        if (quantity > availableQuantity) {
            await transaction.rollback();

            return res.status(409).json({
                success: false,
                message: 'Requested quantity is not available.',
                availableQuantity
            });
        }

        const reservationTTLMinutes =
            Number(process.env.RESERVATION_TTL_MINUTES) || 15;

        const ttlExpiry = new Date(
            now.getTime() + reservationTTLMinutes * 60 * 1000
        );

        const pickupDeadline = new Date(donation.pickup_deadline);

        const expiresAt = new Date(
            Math.min(ttlExpiry.getTime(), pickupDeadline.getTime())
        );

        const newReservedQuantity = reservedQuantity + quantity;

        await donation.update(
            {
                reserved_quantity: newReservedQuantity
            },
            { transaction }
        );

        const reservation = await DonationReservation.create(
            {
                donation_id: donation.id,
                ngo_organization_id: ngoOrganizationId,
                quantity,
                status: 'PENDING',
                expires_at: expiresAt
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
                    type: 'RESERVATION_CREATED',
                    title: 'New donation reservation',
                    message: `${ngoOrganization.name} has requested ${quantity} ${donation.unit} of "${donation.title}".`,
                    reference_type: 'DONATION_RESERVATION',
                    reference_id: reservation.id,
                    is_read: false
                })),
                { transaction }
            );
        }

        const responseBody = {
            success: true,
            message: 'Donation reservation created successfully.',
            data: {
                reservationId: reservation.id,
                donationId: donation.id,
                donationTitle: donation.title,
                ngoOrganizationId,
                quantity: Number(reservation.quantity),
                status: reservation.status,
                expiresAt: reservation.expires_at,
                availableQuantity:
                    totalQuantity - newReservedQuantity - allocatedQuantity
            }
        };

        await IdempotencyKey.create(
            {
                key: idempotencyKey,
                user_id: userId,
                operation,
                response_status: 201,
                response_body: responseBody
            },
            { transaction }
        );

        await transaction.commit();

        return res.status(201).json(responseBody);

    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback();
        }

        console.error('Create reservation error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to create donation reservation.',
            error: error.message
        });
    }
};


const getDonationReservations = async (req, res) => {
    try {
        const userId = req.user.id;
        const donationId = req.params.id;

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

        const donation = await Donation.findByPk(donationId);

        if (!donation) {
            return res.status(404).json({
                success: false,
                message: 'Donation not found.'
            });
        }

        const membership = await OrganizationMember.findOne({
            where: {
                user_id: userId,
                organization_id: donation.donor_organization_id,
                role: {
                    [Op.in]: ['OWNER', 'MANAGER']
                }
            }
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to view reservations for this donation.'
            });
        }

        const whereCondition = {
            donation_id: donation.id
        };

        if (status) {
            whereCondition.status = status;
        }

        const { count, rows } =
            await DonationReservation.findAndCountAll({
                where: whereCondition,

                attributes: [
                    'id',
                    'donation_id',
                    'ngo_organization_id',
                    'quantity',
                    'status',
                    'expires_at',
                    'createdAt'
                ],

                include: [{
                    model: Organization,
                    as: 'ngoOrganization',
                    required: true,
                    attributes: [
                        'id',
                        'name',
                        'type',
                        'description',
                        'email',
                        'phone',
                        'address',
                        'city'
                    ]
                }],

                order: [['createdAt', 'DESC']],
                limit,
                offset,
                distinct: true
            });

        return res.status(200).json({
            success: true,
            message: 'Donation reservations fetched successfully.',

            donation: {
                id: donation.id,
                title: donation.title,
                donorOrganizationId: donation.donor_organization_id
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
                reservationId: reservation.id,
                donationId: reservation.donation_id,
                quantity: Number(reservation.quantity),
                status: reservation.status,
                expiresAt: reservation.expires_at,
                createdAt: reservation.createdAt,

                ngo: reservation.ngoOrganization
            }))
        });

    } catch (error) {
        console.error('Get donation reservations error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to fetch donation reservations.',
            error: error.message
        });
    }
};


module.exports = {
  createDonation,
  publishDonation,
  getAllDonations,
  getDonationById,
  getMyDonations,
  updateDonation,
  cancelDonation,
  createReservation,
  getDonationReservations
};
