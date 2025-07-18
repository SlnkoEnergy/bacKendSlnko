const router = require("express").Router();
const { paymentApproved, utrSubmission }=require("../../Controllers/Accounting/approvedPayment");

router.get("/approved-payment",paymentApproved);
router.get("/utr-submission", utrSubmission) 
module.exports = router;