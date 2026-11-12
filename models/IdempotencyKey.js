
const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db-connection');

const IdempotencyKey = sequelize.define('idempotency_key', {

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

    key: {
        type: DataTypes.STRING(255),
        allowNull: false
    },

    operation: {
        type: DataTypes.STRING(100),
        allowNull: false
    },

    response_status: {
        type: DataTypes.INTEGER,
        allowNull: true
    },

    response_body: {
        type: DataTypes.JSONB,
        allowNull: true
    }

}, {
    tableName: 'idempotency_keys',

    indexes: [
        {
            unique: true,
            fields: ['user_id', 'operation', 'key']
        }
    ]
});

module.exports = IdempotencyKey;
