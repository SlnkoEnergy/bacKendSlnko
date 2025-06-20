var router = require("express").Router();
const { bddashboard }=require("../../Controllers/bdleadDashboard");

router.get("/dashboard",bddashboard);

module.exports = router;