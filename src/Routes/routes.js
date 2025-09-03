const router = require("express").Router();
const jwtMW = require("../middlewares/auth");
const {
  addMoney,
  getCreditAmount,
  allbill,
  credit_amount,
  deletecredit,
  deleteCreditAmount,
} = require("../Controllers/addMoneyController");
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
} = require("../Controllers/userController");

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
  updateExcelData,
  recoverypayrequest,
  restorepayrequest,
  getPay,
  deadlineExtendRequest,
  requestCreditExtension,
  approve_pending,
  hold_approve_pending,
  updateExceData,
  getExcelDataById,
  getpy,
  getTrashPayment,
} = require("../Controllers/payRequestControllers");

const {
  addAdjustmentRequest,
  getAdjustmentRequest,
  deleteAdjustmentRequest,
} = require("../Controllers/adjustmentRequestController");

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
} = require("../Controllers/bill.controller");
const {
  subtractmoney,
  getsubtractMoney,
  deleteDebitMoney,
  recoveryDebit,
  deleteSubtractMoney,
} = require("../Controllers/subtractMoneyController");

const {
  all_project_balance,
  all_project_debit,
  total_po_balance,
  total_billed_value,
  total_project_billValue,
  project_credit_amount,
  project_debit_amount,
} = require("../Controllers/balanceController");

const {
  createOffer,
  getCommOffer,
  editOffer,
  deleteOffer,
} = require("../Controllers/commOfferController");

const {
  addCommRate,
  getCommRate,
  editCommRate,
  deleteCommRate,
} = require("../Controllers/commRateController");

const {
  addCommScmRate,
  editCommScmRate,
  getCommScmRate,
} = require("../Controllers/commScmRateController");
const {
  addCommBDRate,
  editCommBDRate,
  getCommBDRate,
  deleteCommBDRate,
  getCommBdRateHistory,
  getCommBDRateByOfferId,
} = require("../Controllers/coomBDRateController");

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
} = require("../Controllers/handoversheet.controller.js");
const {
  addmoduleMaster,
  getmoduleMasterdata,
  editmodulemaster,
  deletemodulemaster,
} = require("../Controllers/moduleMasterController");
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
} = require("../Controllers/expenseSheetControllers/ModifiedexpenseSheetController");


const upload = require("../middlewares/multer.js");

// Admin router
router.post("/user-registratioN-IT", userRegister);
router.post("/logiN-IT", login);
router.put("/logout", jwtMW.authentication, jwtMW.authorization, logout);
router.post("/session-verify", finalizeBdLogin);
router.get(
  "/get-all-useR-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  getalluser
);
router.post("/sendOtp", forgettpass);
router.post("/verifyOtp", verifyOtp);
router.post("/resetPassword", verifyandResetPassword);
router.delete(
  "/delete-useR-IT/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteUser
);
router.get(
  "/get-single-useR-IT/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getSingleUser
);
router.get(
  "/all-user",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllUserByDepartment
);

router.put(
  "/edit-user/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  editUser
);

router.get(
  "/all-dept",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllDepartment
);

//project router
router.post(
  "/add-new-projecT-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  createProject
);
router.put(
  "/update-projecT-IT/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateProject
);
router.get(
  "/get-all-projecT-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  getallproject
);
router.delete(
  "/delete-by-iD-IT/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteProjectById
);
router.get(
  "/get-project-iD-IT/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getProjectById
);
router.get(
  "/project",
  jwtMW.authentication,
  jwtMW.authorization,
  getProjectbyPId
);
router.get(
  "/project-dropdown",
  jwtMW.authentication,
  jwtMW.authorization,
  getProjectDropwdown
);
router.get("/project-search", jwtMW.authentication, getProjectNameSearch);

//addMoney APi
router.post(
  "/Add-MoneY-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  addMoney
);
router.get("/all-bilL-IT", jwtMW.authentication, jwtMW.authorization, allbill);
router.post(
  "/get-bilL-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  credit_amount
);
router.delete(
  "/delete-crdit-amount/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteCreditAmount
);

//purchase order controller
router.post(
  "/Add-purchase-ordeR-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  addPo
);
router.put(
  "/edit-pO-IT/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  upload,
  editPO
);
router.get("/get-pO-IT/:_id", jwtMW.authentication, jwtMW.authorization, getPO);
router.get(
  "/get-all-pO-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  getallpo
);
router.get(
  "/get-paginated-po",
  jwtMW.authentication,
  jwtMW.authorization,
  getPaginatedPo
);
router.get(
  "/get-po-basic",
  jwtMW.authentication,
  jwtMW.authorization,
  getPoBasic
);
router.get(
  "/get-export-po",
  jwtMW.authentication,
  jwtMW.authorization,
  getExportPo
);
router.post(
  "/export-to-csv",
  jwtMW.authentication,
  jwtMW.authorization,
  exportCSV
);
router.put(
  "/remove-to-recovery/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  moverecovery
);
router.get(
  "/get-po-by-po_number",
  jwtMW.authentication,
  jwtMW.authorization,
  getPOByPONumber
);
router.get(
  "/get-po-by-id",
  jwtMW.authentication,
  jwtMW.authorization,
  getPOById
);
router.get(
  "/get-po-detail",
  jwtMW.authentication,
  jwtMW.authorization,
  getallpodetail
);
router.delete(
  "/delete-pO-IT/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deletePO
);
router.get(
  "/get-po-historY-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  getpohistory
);
router.get(
  "/get-po-history",
  jwtMW.authentication,
  jwtMW.authorization,
  getPOHistoryById
);
router.put(
  "/updateStatusPO",
  jwtMW.authentication,
  jwtMW.authorization,
  updateStatusPO
);

router.put(
  "/:id/updateEtdOrDelivery",
  jwtMW.authentication,
  jwtMW.authorization,
  updateEditandDeliveryDate
);

//Add vendor
router.post(
  "/Add-vendoR-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  addVendor
);
router.get(
  "/get-all-vendoR-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  getVendor
);
router.put(
  "/update-vendoR-IT/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateVendor
); //update vendor
router.delete(
  "/delete-vendoR-IT/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteVendor
); //delete vendor
router.get(
  "/vendor-dropdown",
  jwtMW.authentication,
  jwtMW.authorization,
  getVendorDropwdown
);
router.get("/vendor-search", jwtMW.authentication, getVendorNameSearch);

//pay Request api
router.get(
  "/get-pay-sumrY-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  getPay
);
router.post(
  "/add-pay-requesT-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  payRrequest
);
router.get(
  "/get-pay-summarY-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  getPaySummary
);
router.get(
  "/hold-pay-summary-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  getTrashPayment
);
router.put(
  "/acc-matched",
  jwtMW.authentication,
  jwtMW.authorization,
  account_matched
);
router.put("/utr-update", jwtMW.authentication, jwtMW.authorization, utrUpdate);
router.put(
  "/account-approve",
  jwtMW.authentication,
  jwtMW.authorization,
  accApproved
);
router.put(
  "/credit-extension-by-id/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deadlineExtendRequest
);
router.put(
  "/request-extension-by-id/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  requestCreditExtension
);
router.put(
  "/restore-pay-request/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  restoreTrashToDraft
);
router.put(
  "/approval",
  jwtMW.authentication,
  jwtMW.authorization,
  newAppovAccount
);
router.delete(
  "/delete-payrequest/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deletePayRequestById
);
router.put(
  "/update-pay-request/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  editPayRequestById
); //update pay request
router.get(
  "/get-pay-request",
  jwtMW.authentication,
  jwtMW.authorization,
  getPayRequestById
); //get pay request by id
router.get(
  "/get-exceldata",
  jwtMW.authentication,
  jwtMW.authorization,
  excelData
);
router.put(
  "/update-excel-data",
  jwtMW.authentication,
  jwtMW.authorization,
  updateExcelData
);
router.put(
  "/restorepayrequest/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  restorepayrequest
);
router.post(
  "/approve-data-send-holdpay",
  jwtMW.authentication,
  jwtMW.authorization,
  approve_pending
);
router.post(
  "/hold-payto-payrequest",
  jwtMW.authentication,
  jwtMW.authorization,
  hold_approve_pending
);
router.put(
  "/update-excel",
  jwtMW.authentication,
  jwtMW.authorization,
  updateExceData
);
router.get(
  "/get-single-excel-data/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getExcelDataById
);
router.get("/get-pay-smry", jwtMW.authentication, jwtMW.authorization, getpy);

//adjustment request
router.post(
  "/add-adjustment-request",
  jwtMW.authentication,
  jwtMW.authorization,
  addAdjustmentRequest
);
router.get(
  "/get-adjustment-request",
  jwtMW.authentication,
  jwtMW.authorization,
  getAdjustmentRequest
);
router.delete(
  "/delete-adjustment-request/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteAdjustmentRequest
);

// add-Bill
router.post("/add-bilL-IT", jwtMW.authentication, jwtMW.authorization, addBill);
router.get(
  "/get-all-bilL-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  getBill
);
router.get(
  "/get-paginated-bill",
  jwtMW.authentication,
  jwtMW.authorization,
  getPaginatedBill
);
router.get("/bill", jwtMW.authentication, getAllBill);
router.get(
  "/get-bill-by-id",
  jwtMW.authentication,
  jwtMW.authorization,
  GetBillByID
);
router.put(
  "/update-bill/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updatebill
);
router.delete(
  "/delete-credit-amount/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deletecredit
);
router.delete(
  "/delete-bill/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteBill
);
router.put(
  "/accepted-by",
  jwtMW.authentication,
  jwtMW.authorization,
  bill_approved
);
router.get(
  "/get-export-bill",
  jwtMW.authentication,
  jwtMW.authorization,
  exportBills
);
router.put('/manipulatebill', manipulatebill)
//subtractmoney-debitmoney
router.post(
  "/debit-moneY-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  subtractmoney
);
router.get(
  "/get-subtract-amounT-IT",
  jwtMW.authentication,
  jwtMW.authorization,
  getsubtractMoney
);
router.delete(
  "/delete-debit-money/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteDebitMoney
);
router.put(
  "/recovery-debit/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  recoveryDebit
); //to test for rrecovery subtract money
router.delete(
  "/delete-subtract-moneY/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteSubtractMoney
);

//All Balance SUMMARY
router.get(
  "/get-balance-summary",
  jwtMW.authentication,
  jwtMW.authorization,
  all_project_balance
);
router.get(
  "/get-debit-balance",
  jwtMW.authentication,
  jwtMW.authorization,
  all_project_debit
);
router.get(
  "/get-po-balance",
  jwtMW.authentication,
  jwtMW.authorization,
  total_po_balance
);
router.get(
  "/get-total-billed",
  jwtMW.authentication,
  jwtMW.authorization,
  total_billed_value
);
router.post(
  "/get-total-credit-single",
  jwtMW.authentication,
  jwtMW.authorization,
  project_credit_amount
);
router.post(
  "/get-total-debit-single",
  jwtMW.authentication,
  jwtMW.authorization,
  project_debit_amount
);

//commOffer
router.post(
  "/create-offer",
  jwtMW.authentication,
  jwtMW.authorization,
  createOffer
);
router.get(
  "/get-comm-offer",
  jwtMW.authentication,
  jwtMW.authorization,
  getCommOffer
);
router.put(
  "/edit-offer/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  editOffer
);
router.delete(
  "/delete-offer/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteOffer
);

//commRate
router.post(
  "/create-rate",
  jwtMW.authentication,
  jwtMW.authorization,
  addCommRate
);
router.get(
  "/get-comm-rate",
  jwtMW.authentication,
  jwtMW.authorization,
  getCommRate
);
router.put(
  "/edit-comm-rate/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  editCommRate
);
router.delete(
  "/delete-comm-rate/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteCommRate
);

//commScmRate
router.post(
  "/create-scm-rate",
  jwtMW.authentication,
  jwtMW.authorization,
  addCommScmRate
);
router.put(
  "/edit-scm-rate/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  editCommScmRate
);
router.get(
  "/get-comm-scm-rate",
  jwtMW.authentication,
  jwtMW.authorization,
  getCommScmRate
);

//commBDRate
router.post(
  "/create-bd-rate",
  jwtMW.authentication,
  jwtMW.authorization,
  addCommBDRate
);
router.put(
  "/edit-bd-rate/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  editCommBDRate
);
router.get(
  "/get-comm-bd-rate",
  jwtMW.authentication,
  jwtMW.authorization,
  getCommBDRate
);
router.delete(
  "/delete-comm-bd-rate/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteCommBDRate
);
router.get(
  "/get-bd-rate-history",
  jwtMW.authentication,
  jwtMW.authorization,
  getCommBdRateHistory
);
router.get(
  "/get-bd-rate-by-offer_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getCommBDRateByOfferId
);

//handdoversheet
router.post(
  "/create-hand-over-sheet",
  jwtMW.authentication,
  jwtMW.authorization,
  createhandoversheet
);
router.post(
  "/handover-export",
  jwtMW.authentication,
  jwtMW.authorization,
  getexportToCsv
);
router.get(
  "/get-all-handover-sheet",
  jwtMW.authentication,
  jwtMW.authorization,
  gethandoversheetdata
);
router.put(
  "/edit-hand-over-sheet/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  edithandoversheetdata
);
router.put(
  "/update-status/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updatestatus
);
router.post("/check/:_id", jwtMW.authentication, jwtMW.authorization, checkid);
router.get(
  "/get-handoversheet",
  jwtMW.authentication,
  jwtMW.authorization,
  getByIdOrLeadId
);
router.get(
  "/search/:letter",
  jwtMW.authentication,
  jwtMW.authorization,
  search
);
router.put(
  "/migrateProject",
  jwtMW.authentication,
  jwtMW.authorization,
  migrateProjectToHandover
);

//module master
router.post(
  "/add-module-master",
  jwtMW.authentication,
  jwtMW.authorization,
  addmoduleMaster
);
router.get(
  "/get-module-master",
  jwtMW.authentication,
  jwtMW.authorization,
  getmoduleMasterdata
);
router.put(
  "/edit-module-master/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  editmodulemaster
);
router.delete(
  "/delete-module-master/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deletemodulemaster
);

//Expense Sheet
router.get(
  "/get-all-expense",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllExpense
);
router.get(
  "/get-expense-by-id",
  jwtMW.authentication,
  jwtMW.authorization,
  getExpenseById
);
router.post(
  "/create-expense",
  jwtMW.authentication,
  jwtMW.authorization,
  upload,
  createExpense
);
router.put(
  "/update-expense/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateExpenseSheet
);
router.put(
  "/update-disbursement-date/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateDisbursementDate
); //update disbursement date
router.put(
  "/:_id/status/overall",
  jwtMW.authentication,
  jwtMW.authorization,
  updateExpenseStatusOverall
);
router.put(
  "/:sheetId/item/:itemId/status",
  jwtMW.authentication,
  jwtMW.authorization,
  updateExpenseStatusItems
);
router.delete(
  "/delete-expense/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteExpense
);
router.post(
  "/expense-to-csv",
  jwtMW.authentication,
  jwtMW.authorization,
  exportExpenseSheetsCSV
);
//Expense Pdf
router.post(
  "/expense-pdf",
  jwtMW.authentication,
  jwtMW.authorization,
  getExpensePdf
);
router.post(
  "/create-modified-expense",
  jwtMW.authentication,
  jwtMW.authorization,
  upload,
  createModifiedExpense
);
router.get(
  "/get-all-modified-expense",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllModifiedExpense
);
router.get(
  "/get-modified-expense-by-id",
  jwtMW.authentication,
  jwtMW.authorization,
  getModifiedExpenseById
);


module.exports = router;
