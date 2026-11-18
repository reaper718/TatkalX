require("dotenv").config();

const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DATABASE_URL || "postgres://postgres:root@localhost:5432/foodloop",
  {
    dialect: "postgres",
    logging: false,

    dialectOptions: process.env.DATABASE_URL
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        }
      : {},

    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

(async () => {
    try {
        await sequelize.authenticate();
        console.log("Connection to database made");
    } catch (error) {
        console.log(error);
    }
})();

module.exports = sequelize;