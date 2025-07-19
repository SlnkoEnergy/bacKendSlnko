const router = require("express").Router();
const { paymentApproved, utrSubmission }=require("../../Controllers/Accounting/approvedPayment");
const { getCustomerPaymentSummary } = require("../../Controllers/Accounting/customerpaymentSummary");
const { paymentApproval } = require("../../Controllers/Accounting/paymentApproval");
const { projectBalance }= require("../../Controllers/Accounting/ProjectBalance");
const { standbyRecord } = require("../../Controllers/Accounting/standbyRecord");


router.get("/approved-payment",paymentApproved);
router.get("/utr-submission", utrSubmission);
router.get("/project-balance",projectBalance);
router.get("/payment-approval",paymentApproval);
router.get("/standby-record",standbyRecord);
router.get("/customer-payment-summary",getCustomerPaymentSummary);
 
module.exports = router;