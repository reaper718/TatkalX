const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db-connection');

const AllocationEvent = sequelize.define('allocation_event', {

    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
    },

    allocation_id: {
        type: DataTypes.UUID,
        allowNull: false
    },

    previous_status: {
        type: DataTypes.STRING(30),
        allowNull: true
    },

    new_status: {
        type: DataTypes.STRING(30),
        allowNull: false
    },

    changed_by: {
        type: DataTypes.UUID,
        allowNull: false
    },

    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }

});

module.exports = AllocationEvent;
