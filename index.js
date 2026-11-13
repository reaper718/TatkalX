const express = require("express");
const db = require("./utils/db-connection");
require('./models');

const authRouter = require('./modules/auth/authRouter');
const organizationRouter = require('./modules/organization/organizationRouter');
const donationRouter = require('./modules/donations/donationRouter');
const reservationRouter = require('./modules/reservation/reservationRouter');
const disoverRouter = require('./modules/discover/discoverRouter');
const allocationRouter = require('./modules/allocation/allocationRouter');
const notificationRouter = require('./modules/notification/notificationRouter');

const app = express();

app.use(express.json());

app.use('/auth',authRouter);
app.use('/organizations', organizationRouter);
app.use('/admin/organizations', organizationRouter);
app.use('/donations', donationRouter);
app.use('/discover', disoverRouter);
app.use('/reservations', reservationRouter);
app.use('/allocations', allocationRouter);
app.use('/notifications', notificationRouter);

db.sync()
  .then(() => {
    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000");
    });
  })
  .catch((error) => {
    console.log(error);
  });
