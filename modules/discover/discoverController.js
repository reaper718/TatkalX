const { QueryTypes } = require('sequelize');
const { Donation, Organization, OrganizationMember } = require('../../models');
const sequelize = require('../../utils/db-connection');

const getNearbyDonations = async (req, res) => {
    try {
        const userId = req.user.id;

        const page = Math.max(1,Number.parseInt(req.query.page, 10) || 1);

        const limit = Math.min(50,Math.max(1, Number.parseInt(req.query.limit, 10) || 20));

        const offset = (page - 1) * limit;

        const radius = Number(req.query.radius ?? 10000);

        if (
            !Number.isFinite(radius) ||
            radius <= 0 ||
            radius > 50000
        ) {
            return res.status(400).json({
                success: false,
                message: 'Radius must be greater than 0 and cannot exceed 50000 meters.'
            });
        }

        const sortBy = req.query.sortBy || 'distance';

        if (!['distance', 'pickupDeadline'].includes(sortBy)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid sortBy. Use distance or pickupDeadline.'
            });
        }

        const { category, dietaryType } = req.query;

        const allowedDietaryTypes = [
            'VEGETARIAN',
            'NON_VEGETARIAN',
            'VEGAN',
            'UNKNOWN'
        ];

        if (
            dietaryType &&
            !allowedDietaryTypes.includes(dietaryType)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid dietary type.',
                allowedDietaryTypes
            });
        }

        const memberships = await OrganizationMember.findAll({
            where: {
                user_id: userId
            },
            include: [
                {
                    model: Organization,
                    as: 'organization',
                    required: true,
                    where: {
                        type: 'NGO',
                        verification_status: 'VERIFIED',
                        is_active: true
                    },
                    attributes: [
                        'id',
                        'name',
                        'city'
                    ]
                }
            ]
        });

        if (memberships.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'You must belong to an active, verified NGO organization to discover nearby donations.'
            });
        }

        if (memberships.length > 1) {
            return res.status(409).json({
                success: false,
                message: 'You belong to multiple verified NGO organizations. Please select an organization.',
                organizations: memberships.map(membership => ({
                    id: membership.organization.id,
                    name: membership.organization.name,
                    city: membership.organization.city
                }))
            });
        }

        const ngoOrganizationId = memberships[0].organization_id;

        const filters = [];
        const replacements = {
            organizationId: ngoOrganizationId,
            radius,
            limit,
            offset
        };

        if (category) {
            filters.push('d.category = :category');
            replacements.category = category;
        }

        if (dietaryType) {
            filters.push('d.dietary_type = :dietaryType');
            replacements.dietaryType = dietaryType;
        }

        const optionalFilters = filters.length > 0
            ? `AND ${filters.join(' AND ')}`
            : '';

        const baseWhere = `
            FROM donations AS d
            INNER JOIN organizations AS o
                ON o.id = :organizationId
            WHERE
                d.status = 'PUBLISHED'
                AND d.pickup_deadline > NOW()
                AND (
                    d.total_quantity
                    - COALESCE(d.reserved_quantity, 0)
                    - COALESCE(d.allocated_quantity, 0)
                ) > 0
                AND ST_DWithin(
                    d.pickup_location,
                    o.location,
                    :radius
                )
                ${optionalFilters}
        `;

        const countResult = await sequelize.query(
            `
            SELECT COUNT(*)::INTEGER AS total
            ${baseWhere}
            `,
            {
                replacements,
                type: QueryTypes.SELECT
            }
        );

        const totalItems = Number(countResult[0].total);

        const orderBy = sortBy === 'distance'
            ? 'distance_meters ASC, d.pickup_deadline ASC'
            : 'd.pickup_deadline ASC, distance_meters ASC';

        const donations = await sequelize.query(
            `
            SELECT
                d.id,
                d.title,
                d.description,
                d.category,
                d.dietary_type AS "dietaryType",

                (
                    d.total_quantity
                    - COALESCE(d.reserved_quantity, 0)
                    - COALESCE(d.allocated_quantity, 0)
                ) AS "availableQuantity",

                d.unit,

                ST_Distance(
                    d.pickup_location,
                    o.location
                ) AS distance_meters,

                d.pickup_deadline AS "pickupDeadline",
                d.safe_consumption_deadline AS "safeConsumptionDeadline",
                d.pickup_address AS "pickupAddress",

                d.prepared_at AS "preparedAt",
                d.storage_instructions AS "storageInstructions",
                d.packaging_details AS "packagingDetails",
                d.allergens,

                d.donor_organization_id AS "donorOrganizationId",
                o.name AS "ngoOrganizationName"

            ${baseWhere}

            ORDER BY ${orderBy}

            LIMIT :limit
            OFFSET :offset
            `,
            {
                replacements,
                type: QueryTypes.SELECT
            }
        );

        const totalPages = Math.ceil(totalItems / limit);

        return res.status(200).json({
            success: true,
            message: 'Nearby donations fetched successfully.',

            search: {
                organizationId: ngoOrganizationId,
                organizationName: memberships[0].organization.name,
                radiusMeters: radius,
                sortBy
            },

            pagination: {
                totalItems,
                currentPage: page,
                totalPages,
                limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            },

            data: donations.map(donation => ({
                ...donation,
                availableQuantity: Number(donation.availableQuantity),
                distanceMeters: Math.round(
                    Number(donation.distance_meters)
                )
            }))
        });

    } catch (error) {
        console.error('Get nearby donations error:', error);

        return res.status(500).json({
            success: false,
            message: 'Something went wrong.'
        });
    }
};

const getNearbyOrganizations = async (req, res) => {
    try {
        const page = Math.max(
            Number.parseInt(req.query.page, 10) || 1,
            1
        );

        const limit = Math.min(
            Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
            50
        );

        const offset = (page - 1) * limit;

        const radius = Number(req.query.radius) || 10000;

        if (!Number.isFinite(radius) || radius <= 0 || radius > 50000) {
            return res.status(400).json({
                success: false,
                message: 'Radius must be between 1 and 50000 meters.'
            });
        }

        const sortBy = req.query.sortBy || 'distance';

        if (!['distance', 'name'].includes(sortBy)) {
            return res.status(400).json({
                success: false,
                message: 'sortBy must be distance or name.'
            });
        }

        const memberships = await OrganizationMember.findAll({
            where: {
                user_id: req.user.id
            },
            include: [{
                model: Organization,
                as: 'organization',
                required: true,
                attributes: ['id', 'name'],
                where: {
                    type: 'NGO',
                    verification_status: 'VERIFIED',
                    is_active: true
                }
            }]
        });

        if (memberships.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'You must belong to an active, verified NGO organization to discover nearby donors.'
            });
        }

        if (memberships.length > 1) {
            return res.status(409).json({
                success: false,
                message: 'You belong to multiple verified NGO organizations. Please select an organization.'
            });
        }

        const ngoOrganization = memberships[0].organization;
        const ngoOrganizationId = ngoOrganization.id;

        const countResult = await sequelize.query(
            `
            SELECT COUNT(*) AS total
            FROM organizations AS donor_org
            INNER JOIN organizations AS ngo_org
                ON ngo_org.id = :ngoOrganizationId
            WHERE
                donor_org.type = 'DONOR'
                AND donor_org.verification_status = 'VERIFIED'
                AND donor_org.is_active = true
                AND ST_DWithin(
                    donor_org.location,
                    ngo_org.location,
                    :radius
                )
            `,
            {
                replacements: {
                    ngoOrganizationId,
                    radius
                },
                type: QueryTypes.SELECT
            }
        );

        const totalItems = Number(countResult[0].total);

        const orderBy = sortBy === 'name'
            ? 'donor_org.name ASC'
            : 'distance_meters ASC';

        const organizations = await sequelize.query(
            `
            SELECT
                donor_org.id,
                donor_org.name,
                donor_org.description,
                donor_org.email,
                donor_org.phone,
                donor_org.address,
                donor_org.city,
                ST_Distance(
                    donor_org.location,
                    ngo_org.location
                ) AS distance_meters
            FROM organizations AS donor_org
            INNER JOIN organizations AS ngo_org
                ON ngo_org.id = :ngoOrganizationId
            WHERE
                donor_org.type = 'DONOR'
                AND donor_org.verification_status = 'VERIFIED'
                AND donor_org.is_active = true
                AND ST_DWithin(
                    donor_org.location,
                    ngo_org.location,
                    :radius
                )
            ORDER BY ${orderBy}
            LIMIT :limit
            OFFSET :offset
            `,
            {
                replacements: {
                    ngoOrganizationId,
                    radius,
                    limit,
                    offset
                },
                type: QueryTypes.SELECT
            }
        );

        return res.status(200).json({
            success: true,
            message: 'Nearby donor organizations fetched successfully.',
            search: {
                organizationId: ngoOrganizationId,
                organizationName: ngoOrganization.name,
                radiusMeters: radius,
                sortBy
            },
            pagination: {
                totalItems,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                limit,
                hasNextPage: page < Math.ceil(totalItems / limit),
                hasPreviousPage: page > 1
            },
            data: organizations.map(org => ({
                ...org,
                distanceMeters: Number(
                    Number(org.distance_meters).toFixed(2)
                )
            }))
        });

    } catch (error) {
        console.error('Get nearby organizations error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to fetch nearby donor organizations.',
            error: error.message
        });
    }
};

module.exports = {
    getNearbyDonations,
    getNearbyOrganizations
}
