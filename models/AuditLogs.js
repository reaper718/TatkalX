
const { DataTypes } = require('sequelize');
const sequelize = require('../utils/db-connection');

const AuditLog = sequelize.define('audit_log', {

    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
    },  

    actor_user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },

    action: {
        type: DataTypes.STRING(100),
        allowNull: false
    },

    entity_type: {
        type: DataTypes.STRING(60),
        allowNull: false
    },

    entity_id: {
        type: DataTypes.UUID,
        allowNull: false
    },

    metadata: {
        type: DataTypes.JSONB,
        allowNull: true
    }

});

module.exports = AuditLog;
