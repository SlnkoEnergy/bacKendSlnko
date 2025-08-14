const router = require("express").Router();
const {
  paymentApproved,
  utrSubmission,
} = require("../../Controllers/Accounting/approvedPayment");
const {
  getCustomerPaymentSummary,
} = require("../../Controllers/Accounting/customerpaymentSummary");
const {
  paymentApproval,
  getPoApprovalPdf,
} = require("../../Controllers/Accounting/paymentApproval");
const {
  paymentHistory,
  exportDebitHistoryCsv,
} = require("../../Controllers/Accounting/paymentHistory");
const {
  projectBalance,
  exportProjectBalance,
} = require("../../Controllers/Accounting/ProjectBalance");
const { standbyRecord } = require("../../Controllers/Accounting/standbyRecord");
const jwtMW = require("../../middlewares/auth");

router.get(
  "/approved-payment",
  jwtMW.authentication,
  jwtMW.authorization,
  paymentApproved
);
router.get(
  "/utr-submission",
  jwtMW.authentication,
  jwtMW.authorization,
  utrSubmission
);
router.get(
  "/project-balance",
  jwtMW.authentication,
  jwtMW.authorization,
  projectBalance
);
router.post(
  "/export-project-balance",
  jwtMW.authentication,
  jwtMW.authorization,
  exportProjectBalance
);

router.get(
  "/payment-approval",
  jwtMW.authentication,
  jwtMW.authorization,
  paymentApproval
);
router.post(
  "/po-approve-pdf",
  jwtMW.authentication,
  getPoApprovalPdf
);
router.get(
  "/standby-record",
  jwtMW.authentication,
  jwtMW.authorization,
  standbyRecord
);
router.get(
  "/customer-payment-summary",
  jwtMW.authentication,
  jwtMW.authorization,
  getCustomerPaymentSummary
);
router.get(
  "/payment-history",
  jwtMW.authentication,
  jwtMW.authorization,
  paymentHistory
);
router.get(
  "/debithistorycsv",
  jwtMW.authentication,
  jwtMW.authorization,
  exportDebitHistoryCsv
);

module.exports = router;
