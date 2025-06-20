var router = require("express").Router();
const { bddashboard, getAllLeads }=require("../../Controllers/bdleadDashboard");

router.get("/dashboard",bddashboard);
router.get("/all-lead", getAllLeads);

module.exports = router;