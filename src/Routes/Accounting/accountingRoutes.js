const router = require("express").Router();
const {
  paymentApproved,
  utrSubmission,
} = require("../../Controllers/Accounting/approvedPayment");
const {
  getCustomerPaymentSummary,
  clientHistory,
  totalBalanceSummary,
  getCreditSummary,
  getDebitSummary,
  getAdjustmentHistory,
} = require("../../Controllers/Accounting/customerpaymentSummary");
const {
  paymentApproval,
} = require("../../Controllers/Accounting/paymentApproval");
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
router.get(
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
  "/client-history",
  jwtMW.authentication,
  jwtMW.authorization,
  clientHistory
);
router.get(
  "/balance-summary",
  jwtMW.authentication,
  jwtMW.authorization,
  totalBalanceSummary
);
router.get("/credit-summary", jwtMW.authentication,
  jwtMW.authorization, getCreditSummary);
router.get("/debit-summary", jwtMW.authentication,
  jwtMW.authorization, getDebitSummary);

router.get("/adjustment-history", jwtMW.authentication,
  jwtMW.authorization, getAdjustmentHistory);
module.exports = router;
