const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db-connection');

const Donation = sequelize.define('donation', {

    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
    },

    donor_organization_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },

    title: {
        type: DataTypes.STRING(180),
        allowNull: false
    },

    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    category: {
        type: DataTypes.STRING(60),
        allowNull: false
    },

    dietary_type: {
        type: DataTypes.STRING(30),
        allowNull: true,
        validate: {
            isIn: [[
                'VEGETARIAN',
                'NON_VEGETARIAN',
                'VEGAN',
                'UNKNOWN'
            ]]
        }
    },

    total_quantity: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
            min: 0.01
        }
    },

    reserved_quantity: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },

    allocated_quantity: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },

    unit: {
        type: DataTypes.STRING(20),
        allowNull: false
    },

    prepared_at: {
        type: DataTypes.DATE,
        allowNull: true
    },

    pickup_deadline: {
        type: DataTypes.DATE,
        allowNull: false
    },

    safe_consumption_deadline: {
        type: DataTypes.DATE,
        allowNull: true
    },

    storage_instructions: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    packaging_details: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    allergens: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: true,
        defaultValue: []
    },

    pickup_address: {
        type: DataTypes.TEXT,
        allowNull: false
    },

    pickup_location: {
        type: DataTypes.GEOGRAPHY('POINT', 4326),
        allowNull: false
    },

    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'DRAFT',
        validate: {
            isIn: [[
                'DRAFT',
                'PUBLISHED',
                'CANCELLED',
                'EXPIRED',
                'COMPLETED'
            ]]
        }
    },

}, {
    tableName: 'donations',

    validate: {
        quantityLimit() {
            const total = Number(this.total_quantity);
            const reserved = Number(this.reserved_quantity);
            const allocated = Number(this.allocated_quantity);

            if (reserved + allocated > total) {
                throw new Error(
                    'Reserved and allocated quantities cannot exceed total quantity'
                );
            }
        },

        safeDeadlineCheck() {
            if (
                this.safe_consumption_deadline &&
                this.pickup_deadline &&
                new Date(this.safe_consumption_deadline) <
                new Date(this.pickup_deadline)
            ) {
                throw new Error(
                    'Safe consumption deadline cannot be earlier than pickup deadline'
                );
            }
        }
    }
});

module.exports = Donation;
