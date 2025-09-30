const router = require("express").Router();
const jwtMW = require("../middlewares/auth.js");
const {
  addMoney,
  getCreditAmount,
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
} = require("../Controllers/purchaseorder.controller");
const {
  addVendor,
  getVendor,
  updateVendor,
  deleteVendor,
  getVendorDropwdown,
  getVendorNameSearch,
} = require("../Controllers/vendor.controller.js");
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
  createhandoversheet,
  gethandoversheetdata,
  edithandoversheetdata,
  updateStatusOfHandoversheet,
  getbdhandoversheetdata,
  updateStatusHandoversheet,
  updatehandoverbd,
  updatestatus,
  checkid,
  getbyid,
  search,
  getByIdOrLeadId,
  getexportToCsv,
  migrateProjectToHandover,
  listUsersNames,
  UpdateAssigneTo
} = require("../Controllers/handoversheet.controller.js");
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

const upload = require("../middlewares/multer.js");
const { syncAllProjectBalances } = require("../Controllers/Accounting/ProjectBalance.js");


// Admin router
router.post("/user-registratioN-IT", userRegister);
router.post("/logiN-IT", login);
router.put("/logout", jwtMW.authentication, logout);
router.post("/session-verify", finalizeBdLogin);
router.get(
  "/get-all-useR-IT",
  jwtMW.authentication,

  getalluser
);
router.post("/sendOtp", forgettpass);
router.post("/verifyOtp", verifyOtp);
router.post("/resetPassword", verifyandResetPassword);
router.delete(
  "/delete-useR-IT/:_id",
  jwtMW.authentication,

  deleteUser
);
router.get(
  "/get-single-useR-IT/:_id",
  jwtMW.authentication,

  getSingleUser
);
router.get(
  "/all-user",
  jwtMW.authentication,

  getAllUserByDepartment
);

router.get(
  "/all-user-with-pagination",
  jwtMW.authentication,

  getAllUserByDepartmentWithPagination
);

router.put(
  "/edit-user/:_id",
  jwtMW.authentication,
  upload,

  editUser
);

router.get(
  "/all-dept",
  jwtMW.authentication,

  getAllDepartment
);

router.post(
  "/backfill",
  jwtMW.authentication,
  jwtMW.authorization,
  backfillProfileFields
);

//project router
router.post(
  "/add-new-projecT-IT",
  jwtMW.authentication,

  createProject
);
router.put(
  "/update-projecT-IT/:_id",
  jwtMW.authentication,

  updateProject
);
router.get(
  "/get-all-projecT-IT",
  jwtMW.authentication,

  getallproject
);
router.delete(
  "/delete-by-iD-IT/:_id",
  jwtMW.authentication,

  deleteProjectById
);
router.get(
  "/get-project-iD-IT/:_id",
  jwtMW.authentication,

  getProjectById
);
router.get(
  "/project",
  jwtMW.authentication,

  getProjectbyPId
);
router.get(
  "/project-dropdown",
  jwtMW.authentication,

  getProjectDropwdown
);
router.get("/project-search", jwtMW.authentication, getProjectNameSearch);

//addMoney APi
router.post(
  "/Add-MoneY-IT",
  jwtMW.authentication,

  addMoney
);
router.get("/all-bilL-IT", jwtMW.authentication, allbill);
router.post(
  "/get-bilL-IT",
  jwtMW.authentication,

  credit_amount
);
router.delete(
  "/delete-crdit-amount/:_id",
  jwtMW.authentication,

  deleteCreditAmount
);

//purchase order controller
router.post(
  "/Add-purchase-ordeR-IT",
  jwtMW.authentication,

  addPo
);
router.put(
  "/edit-pO-IT/:_id",
  jwtMW.authentication,

  upload,
  editPO
);
router.get("/get-pO-IT/:_id", jwtMW.authentication, getPO);
router.get(
  "/get-all-pO-IT",
  jwtMW.authentication,

  getallpo
);
router.get(
  "/get-paginated-po",
  jwtMW.authentication,

  getPaginatedPo
);
router.get(
  "/get-po-basic",
  jwtMW.authentication,

  getPoBasic
);
router.get(
  "/get-export-po",
  jwtMW.authentication,

  getExportPo
);
router.post(
  "/export-to-csv",
  jwtMW.authentication,

  exportCSV
);
router.put(
  "/remove-to-recovery/:_id",
  jwtMW.authentication,
  moverecovery
);
router.get(
  "/get-po-by-po_number",
  jwtMW.authentication,
  getPOByPONumber
);
router.get(
  "/get-po-by-id",
  jwtMW.authentication,
  getPOById
);
router.get(
  "/get-po-detail",
  jwtMW.authentication,
  getallpodetail
);
router.delete(
  "/delete-pO-IT/:_id",
  jwtMW.authentication,
  deletePO
);
router.get(
  "/get-po-historY-IT",
  jwtMW.authentication,
  getpohistory
);
router.get(
  "/get-po-history",
  jwtMW.authentication,
  getPOHistoryById
);
router.put(
  "/updateStatusPO",
  jwtMW.authentication,
  updateStatusPO
);

router.put(
  "/:id/updateEtdOrDelivery",
  jwtMW.authentication,
  updateEditandDeliveryDate
);
router.put(
  "/sales-update/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  upload,
  updateSalesPO
);
router.put(
  "/bulk-mark-delivered",
  jwtMW.authentication,
  bulkMarkDelivered
);

router.post(
  "/purchase-generate-pdf",
  jwtMW.authentication,
  generatePurchaseOrderPdf
)

//Add vendor
router.post(
  "/Add-vendoR-IT",
  jwtMW.authentication,

  addVendor
);
router.get(
  "/get-all-vendoR-IT",
  jwtMW.authentication,

  getVendor
);
router.put(
  "/update-vendoR-IT/:_id",
  jwtMW.authentication,

  updateVendor
); //update vendor
router.delete(
  "/delete-vendoR-IT/:_id",
  jwtMW.authentication,

  deleteVendor
); //delete vendor
router.get(
  "/vendor-dropdown",
  jwtMW.authentication,

  getVendorDropwdown
);
router.get("/vendor-search", jwtMW.authentication, getVendorNameSearch);

//pay Request api
router.get(
  "/get-pay-sumrY-IT",
  jwtMW.authentication,

  getPay
);
router.post(
  "/add-pay-requesT-IT",
  jwtMW.authentication,

  payRrequest
);
router.get(
  "/get-pay-summarY-IT",
  jwtMW.authentication,

  getPaySummary
);
router.get(
  "/hold-pay-summary-IT",
  jwtMW.authentication,

  getTrashPayment
);
router.put(
  "/acc-matched",
  jwtMW.authentication,

  account_matched
);
router.put("/utr-update", jwtMW.authentication, utrUpdate);
router.put(
  "/account-approve",
  jwtMW.authentication,

  accApproved
);
router.put(
  "/credit-extension-by-id/:_id",
  jwtMW.authentication,

  deadlineExtendRequest
);
router.put(
  "/request-extension-by-id/:_id",
  jwtMW.authentication,

  requestCreditExtension
);
router.put(
  "/restore-pay-request/:id",
  jwtMW.authentication,

  restoreTrashToDraft
);
router.put(
  "/approval",
  jwtMW.authentication,

  newAppovAccount
);
router.delete(
  "/delete-payrequest/:_id",
  jwtMW.authentication,

  deletePayRequestById
);
router.put(
  "/update-pay-request/:_id",
  jwtMW.authentication,

  editPayRequestById
); //update pay request
router.get(
  "/get-pay-request",
  jwtMW.authentication,

  getPayRequestById
); //get pay request by id
router.get(
  "/get-exceldata",
  jwtMW.authentication,

  excelData
);
router.put(
  "/restorepayrequest/:_id",
  jwtMW.authentication,

  restorepayrequest
);
router.post(
  "/approve-data-send-holdpay",
  jwtMW.authentication,

  approve_pending
);
router.post(
  "/hold-payto-payrequest",
  jwtMW.authentication,

  hold_approve_pending
);
router.put(
  "/update-excel",
  jwtMW.authentication,

  updateExcelData
);
router.get(
  "/get-single-excel-data/:_id",
  jwtMW.authentication,

  getExcelDataById
);
router.get("/get-pay-smry", jwtMW.authentication, getpy);

//adjustment request
router.post(
  "/add-adjustment-request",
  jwtMW.authentication,

  addAdjustmentRequest
);
router.get(
  "/get-adjustment-request",
  jwtMW.authentication,

  getAdjustmentRequest
);
router.delete(
  "/delete-adjustment-request/:_id",
  jwtMW.authentication,

  deleteAdjustmentRequest
);

// add-Bill
router.post("/add-bilL-IT", jwtMW.authentication, addBill);
router.get(
  "/get-all-bilL-IT",
  jwtMW.authentication,

  getBill
);
router.get(
  "/get-paginated-bill",
  jwtMW.authentication,

  getPaginatedBill
);
router.get("/bill", jwtMW.authentication, getAllBill);
router.get(
  "/get-bill-by-id",
  jwtMW.authentication,

  GetBillByID
);
router.put(
  "/update-bill/:_id",
  jwtMW.authentication,

  updatebill
);
router.delete(
  "/delete-credit-amount/:_id",
  jwtMW.authentication,

  deletecredit
);
router.delete(
  "/delete-bill/:_id",
  jwtMW.authentication,

  deleteBill
);
router.put(
  "/accepted-by",
  jwtMW.authentication,

  bill_approved
);
router.get(
  "/get-export-bill",
  jwtMW.authentication,

  exportBills
);
router.put("/manipulatebill", manipulatebill);
//subtractmoney-debitmoney
router.post(
  "/debit-moneY-IT",
  jwtMW.authentication,

  subtractmoney
);
router.get(
  "/get-subtract-amounT-IT",
  jwtMW.authentication,

  getsubtractMoney
);
router.delete(
  "/delete-debit-money/:_id",
  jwtMW.authentication,

  deleteDebitMoney
);
router.put(
  "/recovery-debit/:_id",
  jwtMW.authentication,

  recoveryDebit
); //to test for rrecovery subtract money
router.delete(
  "/delete-subtract-moneY/:_id",
  jwtMW.authentication,

  deleteSubtractMoney
);

//All Balance SUMMARY
router.get(
  "/get-balance-summary",
  jwtMW.authentication,

  all_project_balance
);
router.get(
  "/get-debit-balance",
  jwtMW.authentication,

  all_project_debit
);
router.get(
  "/get-po-balance",
  jwtMW.authentication,

  total_po_balance
);
router.get(
  "/get-total-billed",
  jwtMW.authentication,

  total_billed_value
);
router.post(
  "/get-total-credit-single",
  jwtMW.authentication,

  project_credit_amount
);
router.post(
  "/get-total-debit-single",
  jwtMW.authentication,

  project_debit_amount
);

//commOffer
router.post(
  "/create-offer",
  jwtMW.authentication,

  createOffer
);
router.get(
  "/get-comm-offer",
  jwtMW.authentication,

  getCommOffer
);
router.put(
  "/edit-offer/:_id",
  jwtMW.authentication,

  editOffer
);
router.delete(
  "/delete-offer/:_id",
  jwtMW.authentication,

  deleteOffer
);

//commRate
router.post(
  "/create-rate",
  jwtMW.authentication,

  addCommRate
);
router.get(
  "/get-comm-rate",
  jwtMW.authentication,

  getCommRate
);
router.put(
  "/edit-comm-rate/:_id",
  jwtMW.authentication,

  editCommRate
);
router.delete(
  "/delete-comm-rate/:_id",
  jwtMW.authentication,

  deleteCommRate
);

//commScmRate
router.post(
  "/create-scm-rate",
  jwtMW.authentication,

  addCommScmRate
);
router.put(
  "/edit-scm-rate/:_id",
  jwtMW.authentication,

  editCommScmRate
);
router.get(
  "/get-comm-scm-rate",
  jwtMW.authentication,

  getCommScmRate
);

//commBDRate
router.post(
  "/create-bd-rate",
  jwtMW.authentication,

  addCommBDRate
);
router.put(
  "/edit-bd-rate/:_id",
  jwtMW.authentication,

  editCommBDRate
);
router.get(
  "/get-comm-bd-rate",
  jwtMW.authentication,

  getCommBDRate
);
router.delete(
  "/delete-comm-bd-rate/:_id",
  jwtMW.authentication,

  deleteCommBDRate
);
router.get(
  "/get-bd-rate-history",
  jwtMW.authentication,

  getCommBdRateHistory
);
router.get(
  "/get-bd-rate-by-offer_id",
  jwtMW.authentication,

  getCommBDRateByOfferId
);

//handdoversheet
router.post(
  "/create-hand-over-sheet",
  jwtMW.authentication,

  createhandoversheet
);
router.post(
  "/handover-export",
  jwtMW.authentication,

  getexportToCsv
);
router.get(
  "/get-all-handover-sheet",
  jwtMW.authentication,

  gethandoversheetdata
);
router.put(
  "/edit-hand-over-sheet/:_id",
  jwtMW.authentication,

  edithandoversheetdata
);
router.put(
  "/change-assignee",
  jwtMW.authentication,

  UpdateAssigneTo
);

router.put(
  "/update-status/:_id",
  jwtMW.authentication,

  updatestatus
);
router.post("/check/:_id", jwtMW.authentication, checkid);
router.get(
  "/get-handoversheet",
  jwtMW.authentication,

  getByIdOrLeadId
);
router.get(
  "/search/:letter",
  jwtMW.authentication,

  search
);
router.put(
  "/migrateProject",
  jwtMW.authentication,

  migrateProjectToHandover
);


//module master
router.post(
  "/add-module-master",
  jwtMW.authentication,

  addmoduleMaster
);
router.get(
  "/get-module-master",
  jwtMW.authentication,

  getmoduleMasterdata
);
router.put(
  "/edit-module-master/:_id",
  jwtMW.authentication,

  editmodulemaster
);
router.delete(
  "/delete-module-master/:_id",
  jwtMW.authentication,

  deletemodulemaster
);

//Expense Sheet
router.get(
  "/get-all-expense",
  jwtMW.authentication,

  getAllExpense
);
router.get(
  "/get-expense-by-id",
  jwtMW.authentication,

  getExpenseById
);
router.post(
  "/create-expense",
  jwtMW.authentication,

  upload,
  createExpense
);
router.put(
  "/update-expense/:_id",
  jwtMW.authentication,

  updateExpenseSheet
);
router.put(
  "/update-disbursement-date/:_id",
  jwtMW.authentication,

  updateDisbursementDate
); //update disbursement date
router.put(
  "/:_id/status/overall",
  jwtMW.authentication,

  updateExpenseStatusOverall
);
router.put(
  "/:sheetId/item/:itemId/status",
  jwtMW.authentication,

  updateExpenseStatusItems
);
router.delete(
  "/delete-expense/:_id",
  jwtMW.authentication,

  deleteExpense
);
router.post(
  "/expense-to-csv",
  jwtMW.authentication,

  exportExpenseSheetsCSV
);
//Expense Pdf
router.post(
  "/expense-pdf",
  jwtMW.authentication,

  getExpensePdf
);
router.post(
  "/create-modified-expense",
  jwtMW.authentication,

  upload,
  createModifiedExpense
);
router.get(
  "/get-all-modified-expense",
  jwtMW.authentication,

  getAllModifiedExpense
);
router.get(
  "/get-modified-expense-by-id",
  jwtMW.authentication,
  getModifiedExpenseById
);
router.post("/project-balances/sync-all", syncAllProjectBalances);

module.exports = router;
