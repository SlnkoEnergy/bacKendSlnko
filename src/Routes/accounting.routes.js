const router = require("express").Router();
const {
  paymentApproved,
  utrSubmission,
} = require("../Controllers/Accounting/approvedPayment");
const {
  getCustomerPaymentSummary,
} = require("../Controllers/Accounting/customerpaymentSummary");
const {
  paymentApproval,
  getPoApprovalPdf,
} = require("../Controllers/Accounting/paymentApproval");
const {
  paymentHistory,
  exportDebitHistoryCsv,
} = require("../Controllers/Accounting/paymentHistory");
const {
  projectBalance,
  exportProjectBalance,
} = require("../Controllers/Accounting/ProjectBalance");
const { standbyRecord } = require("../Controllers/Accounting/standbyRecord");
const jwtMW = require("../middlewares/auth");

router.get("/approved-payment", jwtMW.authentication, paymentApproved);
router.get("/utr-submission", jwtMW.authentication, utrSubmission);
router.get("/project-balance", jwtMW.authentication, projectBalance);
router.post(
  "/export-project-balance",
  jwtMW.authentication,
  exportProjectBalance
);

router.get("/payment-approval", jwtMW.authentication, paymentApproval);
router.post("/po-approve-pdf", jwtMW.authentication, getPoApprovalPdf);
router.get("/standby-record", jwtMW.authentication, standbyRecord);
router.get(
  "/customer-payment-summary",
  jwtMW.authentication,
  getCustomerPaymentSummary
);
router.get("/payment-history", jwtMW.authentication, paymentHistory);
router.get("/debithistorycsv", jwtMW.authentication, exportDebitHistoryCsv);

module.exports = router;
