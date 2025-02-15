var router = require("express").Router();

const {
  addMoney,
  getCreditAmount,
  getAllBill,
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
} = require("../Controllers/ProjectController");
const {
  userRegister,
  login,
  getalluser,
  forgettpass,

  verifyandSendPass,
  deleteUser,
  getSingleUser,
} = require("../Controllers/userController");

const {
  addPo,
  editPO,
  getPO,
  getallpo,
  exportCSV,
  moverecovery,
  getPOByProjectId,
  deletePO,
  getpohistory,
  getPOHistoryById,
 
} = require("../Controllers/purchaseOrderController");
const {
  addVendor,
  getVendor,
  updateVendor,
  deleteVendor,
} = require("../Controllers/addVenderController");
const { additem, getItem } = require("../Controllers/itemController");
const {
  payRrequest,
  holdpay,
  getPaySummary,
  hold,
  account_matched,
  utrUpdate,
  accApproved,
  newAppovAccount,
  deletePayRequestById,
  editPayRequestById,
  getPayRequestById,
  excelData,
  updateExcelData,
  recoverypayrequest,
  restorepayrequest,
  getPay,
  approve_pending,
  hold_approve_pending,
  updateExceData,
  getExcelDataById,
  getpy,
  
} = require("../Controllers/payRequestControllers");

const {
  addBill,
  getBill,
  updatebill,
  deleteBill,
  bill_approved,
} = require("../Controllers/billController");
const {
  subtractmoney,
  getsubtractMoney,
  deleteDebitMoney,
  recoveryDebit,
  deleteSubtractMoney,
} = require("../Controllers/subtractMoneyController");



const { all_project_balance, all_project_debit, total_po_balance, total_billed_value, total_project_billValue, project_credit_amount, project_debit_amount, } = require("../Controllers/balanceController");

const{ createOffer, getCommOffer, editOffer, deleteOffer }=require("../Controllers/commOfferController");

const{ addCommRate, getCommRate, editCommRate, deleteCommRate }=require("../Controllers/commRateController");

const { addCommScmRate, editCommScmRate, getCommScmRate } =require("../Controllers/commScmRateController");
const{ addCommBDRate, editCommBDRate, getCommBDRate, deleteCommBDRate }=require("../Controllers/coomBDRateController");







// Admin router
router.post("/user-registratioN", userRegister);
router.post("/logiN", login);
router.get("/get-all-useR", getalluser);
router.post("/forget-password-send-otP", forgettpass);
router.post("/received-emaiL", verifyandSendPass);
router.delete("/delete-useR/:_id", deleteUser);
router.get("/get-single-useR/:_id", getSingleUser);

//project router
router.post("/add-new-projecT", createProject);
router.put("/update-projecT/:_id", updateProject);
router.get("/get-all-projecT", getallproject);
router.delete("/delete-by-iD/:_id", deleteProjectById); //delete project by id
router.get("/get-project-iD/:_id", getProjectById); //get project by id

//addMoney APi
router.post("/Add-Money", addMoney);
router.get("/all-bill", allbill);
router.post("/get-bill", credit_amount);
router.delete("/delete-crdit-amount/:_id",deleteCreditAmount);


//purchase order controller
router.post("/Add-purchase-order", addPo);
router.put("/edit-po/:_id", editPO);
router.get("/get-po/:_id", getPO);
router.get("/get-all-po", getallpo);
router.post("/export-to-csv", exportCSV);
router.put("/remove-to-recovery/:_id", moverecovery);
router.get("/get-po-by-p_id/", getPOByProjectId);
router.delete("/delete-po/:_id",deletePO);
router.get ("/get-po-history",getpohistory);
router.get("/get-po-history-id/:_id", getPOHistoryById);

//Add vendor
router.post("/Add-vendor", addVendor);
router.get("/get-all-vendor", getVendor);
router.put("/update-vendor/:_id", updateVendor); //update vendor
router.delete("/delete-vendor/:_id", deleteVendor); //delete vendor

//item
router.post("/add-item", additem);
router.get("/get-item", getItem);

//pay Request api
router.get("/get-pay-sumry",getPay);
router.post("/add-pay-request", payRrequest);
router.post("/hold-payment", holdpay);
router.get("/get-pay-summary", getPaySummary);
router.get("/hold-pay-summary", hold);
router.put("/acc-matched", account_matched);
router.put("/utr-update", utrUpdate);
router.put("/account-approve", accApproved);
router.put("/approval", newAppovAccount);
router.delete("/delete-payrequest/:_id", deletePayRequestById);
router.put("/update-pay-request/:_id", editPayRequestById); //update pay request
router.get("/get-pay-request-id/:_id", getPayRequestById); //get pay request by id
router.get("/get-exceldata",excelData);
router.put("/update-excel-data",updateExcelData);
router.put("/restorepayrequest/:_id",restorepayrequest); 
router.post("/approve-data-send-holdpay",approve_pending);
router.post("/hold-payto-payrequest", hold_approve_pending);
router.put("/update-excel",updateExceData);
router.get("/get-single-excel-data/:_id", getExcelDataById);
router.get("/get-pay-smry",getpy);

// add-Bill
router.post("/add-bill", addBill);
router.get("/get-all-bill", getBill);
router.put("/update-bill/:_id", updatebill);
router.delete("/delete-credit-amount/:_id", deletecredit);
router.delete("/delete-bill/:_id", deleteBill);
router.put("/accepted-by",bill_approved);

//subtractmoney-debitmoney
router.post("/debit-money", subtractmoney);
router.get("/get-subtract-amount", getsubtractMoney);
router.delete("/delete-debit-money/:_id", deleteDebitMoney);
router.put("/recovery-debit/:_id", recoveryDebit);//to test for rrecovery subtract money
router.delete("/delete-subtract-money/:_id", deleteSubtractMoney);



//All Balance SUMMARY
router.get("/get-balance-summary", all_project_balance);
router.get("/get-debit-balance",all_project_debit);
router.get("/get-po-balance", total_po_balance); 
router.get("/get-total-billed", total_billed_value);
router.post("/get-total-credit-single", project_credit_amount);
router.post("/get-total-debit-single",project_debit_amount);
// router.post("/get-group-balance", group_blanace);
// router.get("/get-balance",groupbalance);

//commOffer
router.post("/create-offer", createOffer);
router.get("/get-comm-offer", getCommOffer);
router.put("/edit-offer/:_id",editOffer);
router.delete("/delete-offer/:_id", deleteOffer);



//commRate
router.post("/create-rate", addCommRate);
router.get("/get-comm-rate", getCommRate);
router.put("/edit-comm-rate/:_id", editCommRate);
router.delete("/delete-comm-rate/:_id",deleteCommRate);


//commScmRate
router.post("/create-scm-rate",addCommScmRate );
router.put("/edit-scm-rate/:_id", editCommScmRate );
router.get("/get-comm-scm-rate", getCommScmRate);


//commBDRate
router.post("/create-bd-rate",addCommBDRate );
router.put("/edit-bd-rate/:_id", editCommBDRate );
router.get("/get-comm-bd-rate",getCommBDRate);
router.delete("/delete-comm-bd-rate/:_id", deleteCommBDRate);





module.exports = router;
