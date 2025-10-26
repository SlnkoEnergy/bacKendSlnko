const router = require("express").Router();
const {
  paymentApproved,
  utrSubmission,
} = require("../Controllers/Accounting/approvedPayment");
const {
  getCustomerPaymentSummary,
  postCustomerPaymentSummaryPdf
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
  getProjectBalances,
} = require("../Controllers/Accounting/ProjectBalance");
const { standbyRecord } = require("../Controllers/Accounting/standbyRecord");
const auth = require("../middlewares/auth.middleware.js");
const { syncAllCustomerSummaries } = require("../Controllers/customerSummary.controller");

router.get("/approved-payment", auth, paymentApproved);
router.get("/utr-submission", auth, utrSubmission);
router.get("/project-balance-old", auth, projectBalance);
router.get("/project-balance", auth, getProjectBalances);
router.post(
  "/export-project-balance",
  auth,
  exportProjectBalance
);

router.get("/payment-approval", auth, paymentApproval);
router.post("/po-approve-pdf", auth, getPoApprovalPdf);
router.get("/standby-record", auth, standbyRecord);
router.get(
  "/customer-payment-summary",
  auth,
  getCustomerPaymentSummary
);
router.post(
  "/customer-payment-summary-pdf",
  auth,
  postCustomerPaymentSummaryPdf
)
router.get("/payment-history", auth, paymentHistory);
router.get("/debithistorycsv", auth, exportDebitHistoryCsv);

router.post("/customer-summary/sync-all", syncAllCustomerSummaries);

module.exports = router;
