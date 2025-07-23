const router = require("express").Router();
const { paymentApproved, utrSubmission }=require("../../Controllers/Accounting/approvedPayment");
const { getCustomerPaymentSummary, clientHistory, totalBalanceSummary, getCreditSummary, getDebitSummary, getAdjustmentHistory } = require("../../Controllers/Accounting/customerpaymentSummary");
const { paymentApproval } = require("../../Controllers/Accounting/paymentApproval");
const { projectBalance , exportProjectBalance  }= require("../../Controllers/Accounting/ProjectBalance");
const { standbyRecord } = require("../../Controllers/Accounting/standbyRecord");


router.get("/approved-payment",paymentApproved);
router.get("/utr-submission", utrSubmission);
router.get("/project-balance",projectBalance);
router.get("/export-project-balance",exportProjectBalance);
router.get("/payment-approval",paymentApproval);
router.get("/standby-record",standbyRecord);
router.get("/customer-payment-summary",getCustomerPaymentSummary);
router.get("/client-history",clientHistory);
router.get("/balance-summary",totalBalanceSummary) ;
router.get("/credit-summary",getCreditSummary);
router.get("/debit-summary",getDebitSummary);
router.get("/adjustment-history",getAdjustmentHistory);
module.exports = router;