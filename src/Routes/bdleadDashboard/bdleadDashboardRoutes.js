var router = require("express").Router();
const {  getAllLeads, getLeadSummary, getLeadSource, taskDashboard, leadSummary, leadconversionrate }=require("../../Controllers/bdleadDashboard");

router.get("/all-lead", getAllLeads);
router.get("/summary",getLeadSummary);
router.get("/lead-source",getLeadSource);
router.get("/taskdashboard",taskDashboard);
router.get("/lead-summary",leadSummary);
router.get("/lead-converstion",leadconversionrate);

module.exports = router;