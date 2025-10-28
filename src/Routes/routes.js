const router = require("express").Router();
const auth = require("../middlewares/auth.middleware.js");
const {
  addMoney,
  allbill,
  credit_amount,
  deletecredit,
  deleteCreditAmount,
} = require("../Controllers/addMoneyController.js");
const {
  createProject,
  updateProject,
  getallproject,
  deleteProjectById,
  getProjectById,
  getProjectbyPId,
  getProjectDropwdown,
  getProjectNameSearch,
  getProjectStatusFilter,
  getProjectDetail,
  getProjectStates,
  getAllProjects,
  updateProjectStatus,
  getActivityLineForProject,
  getProjectsDropdown,
  getAllPosts,
  updateProjectStatusForPreviousProjects,
  updateSubmittedByOfProject,
  updateSkippedProject,
} = require("../Controllers/project.controller.js");

const {
  userRegister,
  login,
  getalluser,
  forgettpass,
  logout,
  deleteUser,
  getSingleUser,
  verifyandResetPassword,
  verifyOtp,
  getAllUserByDepartment,
  editUser,
  getAllDepartment,
  finalizeBdLogin,
  backfillProfileFields,
  getAllUserByDepartmentWithPagination,
} = require("../Controllers/userController.js");
const {
  addPo,
  editPO,
  getPO,
  getallpo,
  getPaginatedPo,
  getExportPo,
  exportCSV,
  moverecovery,
  getPOByPONumber,
  getPOById,
  deletePO,
  getallpodetail,
  getpohistory,
  getPOHistoryById,
  updateEditandDeliveryDate,
  updateStatusPO,
  getPoBasic,
  updateSalesPO,
  bulkMarkDelivered,
  generatePurchaseOrderPdf,
  linkProjectToPOByPid,
} = require("../Controllers/purchaseorder.controller");
const {
  payRrequest,
  getPaySummary,
  account_matched,
  utrUpdate,
  accApproved,
  restoreTrashToDraft,
  newAppovAccount,
  deletePayRequestById,
  editPayRequestById,
  getPayRequestById,
  excelData,
  restorepayrequest,
  getPay,
  deadlineExtendRequest,
  requestCreditExtension,
  approve_pending,
  hold_approve_pending,
  updateExcelData,
  getExcelDataById,
  getpy,
  getTrashPayment,
  getPayRequestByVendor,
} = require("../Controllers/payRequestControllers.js");
const {
  addAdjustmentRequest,
  getAdjustmentRequest,
  deleteAdjustmentRequest,
} = require("../Controllers/adjustmentRequestController.js");
const {
  addBill,
  getBill,
  getPaginatedBill,
  GetBillByID,
  updatebill,
  deleteBill,
  bill_approved,
  exportBills,
  getAllBill,
  manipulatebill,
} = require("../Controllers/bill.controller.js");
const {
  subtractmoney,
  getsubtractMoney,
  deleteDebitMoney,
  recoveryDebit,
  deleteSubtractMoney,
} = require("../Controllers/subtractMoneyController.js");

const {
  all_project_balance,
  all_project_debit,
  total_po_balance,
  total_billed_value,
  total_project_billValue,
  project_credit_amount,
  project_debit_amount,
} = require("../Controllers/balanceController.js");

const {
  createOffer,
  getCommOffer,
  editOffer,
  deleteOffer,
} = require("../Controllers/commOfferController.js");

const {
  addCommRate,
  getCommRate,
  editCommRate,
  deleteCommRate,
} = require("../Controllers/commRateController.js");

const {
  addCommScmRate,
  editCommScmRate,
  getCommScmRate,
} = require("../Controllers/commScmRateController.js");
const {
  addCommBDRate,
  editCommBDRate,
  getCommBDRate,
  deleteCommBDRate,
  getCommBdRateHistory,
  getCommBDRateByOfferId,
} = require("../Controllers/coomBDRateController.js");

const {
  addmoduleMaster,
  getmoduleMasterdata,
  editmodulemaster,
  deletemodulemaster,
} = require("../Controllers/moduleMasterController.js");
// const { deleteOne } = require("../Modells/moduleMasterModells");

const {
  createExpense,
  getAllExpense,
  getExpenseById,
  deleteExpense,
  updateExpenseStatusOverall,
  updateExpenseStatusItems,
  exportExpenseSheetsCSV,
  updateExpenseSheet,
  updateDisbursementDate,
  getExpensePdf,
} = require("../Controllers/expensesheet.controller.js");

const {
  createModifiedExpense,
  getAllModifiedExpense,
  getModifiedExpenseById,
} = require("../Controllers/modifiedexpensesheet.controller.js");

const upload = require("../middlewares/multer.middleware.js");
const {
  syncAllProjectBalances,
  syncRecentCreditsAndDebits,
} = require("../Controllers/Accounting/ProjectBalance.js");

// Admin router
router.post("/user-registratioN-IT", userRegister);
router.post("/logiN-IT", login);
router.put("/logout", auth, logout);
router.post("/session-verify", finalizeBdLogin);
router.get(
  "/get-all-useR-IT",
  auth,

  getalluser
);
router.post("/sendOtp", forgettpass);
router.post("/verifyOtp", verifyOtp);
router.post("/resetPassword", verifyandResetPassword);
router.delete(
  "/delete-useR-IT/:_id",
  auth,

  deleteUser
);
router.get(
  "/get-single-useR-IT/:_id",
  auth,

  getSingleUser
);
router.get("/all-user", auth, getAllUserByDepartment);

router.get(
  "/all-user-with-pagination",
  auth,

  getAllUserByDepartmentWithPagination
);

router.put(
  "/edit-user/:_id",
  auth,
  upload,

  editUser
);

router.get(
  "/all-dept",
  auth,

  getAllDepartment
);

router.post("/backfill", auth, backfillProfileFields);

//project router
router.post("/add-new-projecT-IT", auth, createProject);
router.put("/update-projecT-IT/:_id", auth, updateProject);
router.get("/get-all-projecT-IT", auth, getallproject);
router.get("/projects", auth, getAllProjects);
router.put("/:projectId/updateProjectStatus", auth, updateProjectStatus);
router.delete("/delete-by-iD-IT/:_id", auth, deleteProjectById);
router.get("/get-project-iD-IT/:_id", auth, getProjectById);
router.get("/project", auth, getProjectbyPId);
router.get("/project-dropdown", auth, getProjectDropwdown);
router.get("/project-search", auth, getProjectNameSearch);

router.get("/project-status-filter", auth, getProjectStatusFilter);

router.get("/project-detail", auth, getProjectDetail);

router.get(
  "/project-activity-chart/:projectId",
  auth,
  getActivityLineForProject
);

router.get("/project-dropdown-detail", auth, getProjectsDropdown);

router.get("/project-state-detail", auth, getProjectStates);
router.get("/allposts", auth, getAllPosts);
router.put(
  "/updateprojectstatusforpreviousprojects",
  auth,
  updateProjectStatusForPreviousProjects
);
router.put("/updateprojectsubmittedby", auth, updateSubmittedByOfProject);
router.put("/updateSkippedProject", updateSkippedProject);

//addMoney APi
router.post(
  "/Add-MoneY-IT",
  auth,

  addMoney
);
router.get("/all-bilL-IT", auth, allbill);
router.get("/project-by-pid", auth, getAllProjects);
router.post(
  "/get-bilL-IT",
  auth,

  credit_amount
);
router.delete(
  "/delete-crdit-amount/:_id",
  auth,

  deleteCreditAmount
);

//purchase order controller
router.post("/Add-purchase-ordeR-IT", auth, addPo);
router.put("/edit-pO-IT/:_id", auth, upload, editPO);
router.get("/get-pO-IT/:_id", auth, getPO);
router.get("/get-all-pO-IT", auth, getallpo);
router.get("/get-paginated-po", auth, getPaginatedPo);
router.get("/get-po-basic", auth, getPoBasic);
router.post("/get-export-po", auth, getExportPo);
router.post("/export-to-csv", auth, exportCSV);
router.put("/remove-to-recovery/:_id", auth, moverecovery);
router.get("/get-po-by-po_number", auth, getPOByPONumber);
router.get("/get-po-by-id", auth, getPOById);
router.get("/get-po-detail", auth, getallpodetail);
router.delete("/delete-pO-IT/:_id", auth, deletePO);
router.get("/get-po-historY-IT", auth, getpohistory);
router.get("/get-po-history", auth, getPOHistoryById);
router.put("/updateStatusPO", auth, updateStatusPO);

router.put("/:id/updateEtdOrDelivery", auth, updateEditandDeliveryDate);
router.put("/sales-update/:id", auth, upload, updateSalesPO);
router.put("/bulk-mark-delivered", auth, bulkMarkDelivered);
router.post("/purchase-orders/link-project/bulk", linkProjectToPOByPid);

router.post("/purchase-generate-pdf", auth, generatePurchaseOrderPdf);

//pay Request api
router.get(
  "/get-pay-sumrY-IT",
  auth,

  getPay
);
router.post(
  "/add-pay-requesT-IT",
  auth,

  payRrequest
);
router.get(
  "/get-pay-summarY-IT",
  auth,

  getPaySummary
);
router.get(
  "/hold-pay-summary-IT",
  auth,

  getTrashPayment
);
router.put("/acc-matched", auth, account_matched);
router.put("/utr-update", auth, utrUpdate);
router.put(
  "/account-approve",
  auth,

  accApproved
);
router.put(
  "/credit-extension-by-id/:_id",
  auth,

  deadlineExtendRequest
);
router.put(
  "/request-extension-by-id/:_id",
  auth,

  requestCreditExtension
);
router.put(
  "/restore-pay-request/:id",
  auth,

  restoreTrashToDraft
);
router.put(
  "/approval",
  auth,

  newAppovAccount
);
router.delete(
  "/delete-payrequest/:_id",
  auth,

  deletePayRequestById
);
router.put(
  "/update-pay-request/:_id",
  auth,

  editPayRequestById
); //update pay request
router.get(
  "/get-pay-request",
  auth,

  getPayRequestById
); //get pay request by id
router.get(
  "/get-exceldata",
  auth,

  excelData
);
router.put(
  "/restorepayrequest/:_id",
  auth,

  restorepayrequest
);
router.post(
  "/approve-data-send-holdpay",
  auth,

  approve_pending
);
router.post(
  "/hold-payto-payrequest",
  auth,

  hold_approve_pending
);
router.put(
  "/update-excel",
  auth,

  updateExcelData
);
router.get(
  "/get-single-excel-data/:_id",
  auth,

  getExcelDataById
);
router.get("/get-pay-smry", auth, getpy);
router.get("/payrequestvendor", auth, getPayRequestByVendor);

//adjustment request
router.post(
  "/add-adjustment-request",
  auth,

  addAdjustmentRequest
);
router.get(
  "/get-adjustment-request",
  auth,

  getAdjustmentRequest
);
router.delete(
  "/delete-adjustment-request/:_id",
  auth,

  deleteAdjustmentRequest
);

// add-Bill
router.post("/add-bilL-IT", auth, addBill);
router.get(
  "/get-all-bilL-IT",
  auth,

  getBill
);
router.get(
  "/get-paginated-bill",
  auth,

  getPaginatedBill
);
router.get("/bill", auth, getAllBill);
router.get(
  "/get-bill-by-id",
  auth,

  GetBillByID
);
router.put(
  "/update-bill/:_id",
  auth,

  updatebill
);
router.delete(
  "/delete-credit-amount/:_id",
  auth,

  deletecredit
);
router.delete(
  "/delete-bill/:_id",
  auth,

  deleteBill
);
router.put(
  "/accepted-by",
  auth,

  bill_approved
);
router.get("/get-export-bill", auth, exportBills);
router.put("/manipulatebill", manipulatebill);
//subtractmoney-debitmoney
router.post("/debit-moneY-IT", auth, subtractmoney);
router.get("/get-subtract-amounT-IT", auth, getsubtractMoney);
router.delete(
  "/delete-debit-money/:_id",
  auth,

  deleteDebitMoney
);
router.put(
  "/recovery-debit/:_id",
  auth,

  recoveryDebit
); //to test for rrecovery subtract money
router.delete(
  "/delete-subtract-moneY/:_id",
  auth,

  deleteSubtractMoney
);

//All Balance SUMMARY
router.get(
  "/get-balance-summary",
  auth,

  all_project_balance
);
router.get(
  "/get-debit-balance",
  auth,

  all_project_debit
);
router.get(
  "/get-po-balance",
  auth,

  total_po_balance
);
router.get(
  "/get-total-billed",
  auth,

  total_billed_value
);
router.post(
  "/get-total-credit-single",
  auth,

  project_credit_amount
);
router.post(
  "/get-total-debit-single",
  auth,

  project_debit_amount
);

//commOffer
router.post(
  "/create-offer",
  auth,

  createOffer
);
router.get(
  "/get-comm-offer",
  auth,

  getCommOffer
);
router.put(
  "/edit-offer/:_id",
  auth,

  editOffer
);
router.delete(
  "/delete-offer/:_id",
  auth,

  deleteOffer
);

//commRate
router.post(
  "/create-rate",
  auth,

  addCommRate
);
router.get(
  "/get-comm-rate",
  auth,

  getCommRate
);
router.put(
  "/edit-comm-rate/:_id",
  auth,

  editCommRate
);
router.delete(
  "/delete-comm-rate/:_id",
  auth,

  deleteCommRate
);

//commScmRate
router.post(
  "/create-scm-rate",
  auth,

  addCommScmRate
);
router.put(
  "/edit-scm-rate/:_id",
  auth,

  editCommScmRate
);
router.get(
  "/get-comm-scm-rate",
  auth,

  getCommScmRate
);

//commBDRate
router.post(
  "/create-bd-rate",
  auth,

  addCommBDRate
);
router.put(
  "/edit-bd-rate/:_id",
  auth,

  editCommBDRate
);
router.get(
  "/get-comm-bd-rate",
  auth,

  getCommBDRate
);
router.delete(
  "/delete-comm-bd-rate/:_id",
  auth,

  deleteCommBDRate
);
router.get("/get-bd-rate-history", auth, getCommBdRateHistory);
router.get("/get-bd-rate-by-offer_id", auth, getCommBDRateByOfferId);

//module master
router.post(
  "/add-module-master",
  auth,

  addmoduleMaster
);
router.get(
  "/get-module-master",
  auth,

  getmoduleMasterdata
);

router.put(
  "/edit-module-master/:_id",
  auth,

  editmodulemaster
);
router.delete(
  "/delete-module-master/:_id",
  auth,

  deletemodulemaster
);

//Expense Sheet
router.get(
  "/get-all-expense",
  auth,

  getAllExpense
);
router.get(
  "/get-expense-by-id",
  auth,

  getExpenseById
);
router.post(
  "/create-expense",
  auth,

  upload,
  createExpense
);
router.put(
  "/update-expense/:_id",
  auth,

  updateExpenseSheet
);
router.put(
  "/update-disbursement-date/:_id",
  auth,

  updateDisbursementDate
); //update disbursement date
router.put(
  "/:_id/status/overall",
  auth,

  updateExpenseStatusOverall
);
router.put(
  "/:sheetId/item/:itemId/status",
  auth,

  updateExpenseStatusItems
);
router.delete(
  "/delete-expense/:_id",
  auth,

  deleteExpense
);
router.post(
  "/expense-to-csv",
  auth,

  exportExpenseSheetsCSV
);
//Expense Pdf
router.post(
  "/expense-pdf",
  auth,

  getExpensePdf
);
router.post(
  "/create-modified-expense",
  auth,

  upload,
  createModifiedExpense
);
router.get(
  "/get-all-modified-expense",
  auth,

  getAllModifiedExpense
);
router.get("/get-modified-expense-by-id", auth, getModifiedExpenseById);
router.post("/project-balances/sync-all", syncAllProjectBalances);
router.post("/sync-recent-transactions", syncRecentCreditsAndDebits);

module.exports = router;
