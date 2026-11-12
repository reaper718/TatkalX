
const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db-connection');

const Notification = sequelize.define('notification', {

    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
    },

    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },

    type: {
        type: DataTypes.STRING(60),
        allowNull: false
    },

    title: {
        type: DataTypes.STRING(180),
        allowNull: false
    },

    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },

    reference_type: {
        type: DataTypes.STRING(40),
        allowNull: true
    },

    reference_id: {
        type: DataTypes.UUID,
        allowNull: true
    },

    is_read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }

});

module.exports = Notification;
