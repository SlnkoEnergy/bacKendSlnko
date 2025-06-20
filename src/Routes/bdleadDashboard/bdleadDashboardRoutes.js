var router = require("express").Router();
const {  getAllLeads, getLeadSummary, getLeadSource, taskDashboard, leadSummary,  leadconversationrate, getLeadByLeadIdorId }=require("../../Controllers/bdleadDashboard");
const { getByIdOrLeadId } = require("../../Controllers/handoversheetController");

router.get("/all-lead", getAllLeads);
router.get("/summary",getLeadSummary);
router.get("/lead-source",getLeadSource);
router.get("/taskdashboard",taskDashboard);
router.get("/lead-summary",leadSummary);
router.get("/lead-conversation",leadconversationrate);
router.get("/lead-details", getLeadByLeadIdorId);

module.exports = router;