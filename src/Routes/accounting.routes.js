const router = require("express").Router();
const {
  paymentApproved,
  utrSubmission,
} = require("../controllers/Accounting/approvedPayment");
const {
  getCustomerPaymentSummary,
} = require("../controllers/Accounting/customerpaymentSummary");
const {
  paymentApproval,
  getPoApprovalPdf,
} = require("../controllers/Accounting/paymentApproval");
const {
  paymentHistory,
  exportDebitHistoryCsv,
} = require("../controllers/Accounting/paymentHistory");
const {
  projectBalance,
  exportProjectBalance,
} = require("../controllers/Accounting/ProjectBalance");
const { standbyRecord } = require("../controllers/Accounting/standbyRecord");
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
