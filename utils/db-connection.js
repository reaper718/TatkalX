const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('tatkalx', 'postgres', 'root', {
    host: 'localhost',
    dialect: 'postgres',
    port: 5432,
    logging: false
});

(async () => {
    try {
        await sequelize.authenticate();
        console.log("Connection to database made");
    } catch (error) {
        console.log(error);
    }
})();

module.exports = sequelize;