const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db-connection');

const Allocation = sequelize.define('allocation', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
    },

    reservation_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true
    },

    status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'READY_FOR_PICKUP',
        validate: {
            isIn: [[
                'READY_FOR_PICKUP',
                'PICKED_UP',
                'DELIVERED',
                'FAILED'
            ]]
        }
    },

    pickup_notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    confirmed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },

    picked_up_at: {
        type: DataTypes.DATE,
        allowNull: true
    },

    delivered_at: {
        type: DataTypes.DATE,
        allowNull: true
    }

});

module.exports = Allocation;
