const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db-connection');

const DonationReservation = sequelize.define('donation_reservation', {

    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
    },

    donation_id: {
        type: DataTypes.UUID,
        allowNull: false
    },

    ngo_organization_id: {
        type: DataTypes.UUID,
        allowNull: false
    },

    quantity: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
            min: 0.01
        }
    },

    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'PENDING',
        validate: {
            isIn: [[
                'PENDING',
                'CONFIRMED',
                'REJECTED',
                'CANCELLED',
                'EXPIRED'
            ]]
        }
    },

    expires_at: {
        type: DataTypes.DATE,
        allowNull: false
    },
});

module.exports = DonationReservation;
