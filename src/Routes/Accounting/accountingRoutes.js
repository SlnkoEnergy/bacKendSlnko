const router = require("express").Router();
const { paymentApproved, utrSubmission }=require("../../Controllers/Accounting/approvedPayment");
const { projectBalance }= require("../../Controllers/Accounting/ProjectBalance");


router.get("/approved-payment",paymentApproved);
router.get("/utr-submission", utrSubmission);
router.get("/project-balance",projectBalance);
 
module.exports = router;