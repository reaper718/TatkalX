const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db-connection');

const Organization = sequelize.define('organization', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull:false
    },
    name: {
        type: DataTypes.STRING(180),
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM("DONOR", "NGO"),
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    email: {
        type: DataTypes.STRING
    },
    phone: {
        type: DataTypes.STRING
    },
    address: {
        type: DataTypes.TEXT
    },
    city: {
        type: DataTypes.STRING
    },
    location: {
        type: DataTypes.GEOGRAPHY('point', 4326 ),
        allowNull: false
    },
    verification_status: {
        type: DataTypes.ENUM('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'),
        defaultValue: 'PENDING',
        allowNull: false
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    }
});

module.exports = Organization; 