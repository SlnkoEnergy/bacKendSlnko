var router = require("express").Router();
const { bddashboard }=require("../../Controllers/bdleadashboard");



router.get("/dashboard",bddashboard);

module.exports = router;