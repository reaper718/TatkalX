const express = require("express");
const db = require("./utils/db-connection");

const app = express();

app.use(express.json());

db.sync()
  .then(() => {
    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000");
    });
  })
  .catch((error) => {
    console.log(error);
  });
