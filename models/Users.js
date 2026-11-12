const { DataTypes, DATE } = require('sequelize');
const sequelize = require('../utils/db-connection');

const Users = sequelize.define('users', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false
    },
    full_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false
    }, 
    password: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    phone: {
        type: DataTypes.STRING,
        allowNull: false
    },
    system_role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "User",
        validate: {
            isIn: [['USER', 'ADMIN']]
        }
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
})

module.exports = Users;