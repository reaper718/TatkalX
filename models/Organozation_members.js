const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db-connection');
const Organization = require('./Organizations');

const Organization_members = sequelize.define('organization_members', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false
    },
    organization_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('OWNER', 'MANAGER', 'MEMBER'),
        defaultValue: 'MEMBER',
        allowNull: false
    }
});

module.exports = Organization_members;