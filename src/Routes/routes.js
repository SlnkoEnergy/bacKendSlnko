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

// const { createBDlead, getBDlead, editBDlead, deleteBDlead }=require("../Controllers/createBdLeadcontroller");

const {
  createeBDlead,
  getBDleaddata,
  getallinitialbdlead,
  editinitialbdlead,
} = require("../Controllers/bdcreateControllers");
const {
  initialtofollowup,
  initaltowarmup,
  initialtodead,
  initialtowon,
  getallwon,
  getallfollowup,
  getalldead,
  followuptoall,
  followuptowarm,
  followuptodead,
  followuptowon,
  warmuptowon,
  warmuptodead,
  deadtoinitial,
  deadtofollowup,
  deadtowarm,
  warmtofollowup,
  iniitalbd,
  updateinitialbd,
  updatefollowup,
  updatewarm,
  getallwarm,
  editfollowup,
  editwarm,
  deletedead,
  allbdlead,
} = require("../Controllers/initialbdController");


const{ addtask, getaddtask, editComment, gettaskHistory }=require("../Controllers/addtaskbdController");
const { createhandoversheet, gethandoversheetdata, edithandoversheetdata } =require("../Controllers/handoversheetController");
const { addmoduleMaster, getmoduleMasterdata, editmodulemaster, deletemodulemaster }=require("../Controllers/moduleMasterController");
const { deleteOne } = require("../Modells/moduleMasterModells");

const{ addinveterMaster, getinveterMasterdata }=require("../Controllers/inveterMasterController");

const { addTransformer, getTransformer }=require("../Controllers/engineeringController/transformerController");

// Admin router
router.post("/user-registratioN-IT", userRegister);
router.post("/logiN-IT", login);
router.get("/get-all-useR-IT", getalluser);
router.post("/forget-password-send-otP-IT", forgettpass);
router.post("/received-emaiL-IT", verifyandSendPass);
router.delete("/delete-useR-IT/:_id", deleteUser);
router.get("/get-single-useR-IT/:_id", getSingleUser);

//project router
router.post("/add-new-projecT-IT", createProject);
router.put("/update-projecT-IT/:_id", updateProject);
router.get("/get-all-projecT-IT", getallproject);
router.delete("/delete-by-iD-IT/:_id", deleteProjectById); //delete project by id
router.get("/get-project-iD-IT/:_id", getProjectById); //get project by id

//addMoney APi
router.post("/Add-MoneY-IT", addMoney);
router.get("/all-bilL-IT", allbill);
router.post("/get-bilL-IT", credit_amount);
router.delete("/delete-crdit-amount/:_id", deleteCreditAmount);

//purchase order controller
router.post("/Add-purchase-ordeR-IT", addPo);
router.put("/edit-pO-IT/:_id", editPO);
router.get("/get-pO-IT/:_id", getPO);
router.get("/get-all-pO-IT", getallpo);
router.post("/export-to-csv", exportCSV);
router.put("/remove-to-recovery/:_id", moverecovery);
router.get("/get-po-by-p_id/", getPOByProjectId);
router.delete("/delete-pO-IT/:_id", deletePO);
router.get("/get-po-historY-IT", getpohistory);
router.get("/get-po-history-iD/:_id", getPOHistoryById);

//Add vendor
router.post("/Add-vendoR-IT", addVendor);
router.get("/get-all-vendoR-IT", getVendor);
router.put("/update-vendoR-IT/:_id", updateVendor); //update vendor
router.delete("/delete-vendoR-IT/:_id", deleteVendor); //delete vendor

//item
router.post("/add-iteM-IT", additem);
router.get("/get-iteM-IT", getItem);

//pay Request api
router.get("/get-pay-sumrY-IT", getPay);
router.post("/add-pay-requesT-IT", payRrequest);
router.post("/hold-paymenT-IT", holdpay);
router.get("/get-pay-summarY-IT", getPaySummary);
router.get("/hold-pay-summary-IT", hold);
router.put("/acc-matched", account_matched);
router.put("/utr-update", utrUpdate);
router.put("/account-approve", accApproved);
router.put("/approval", newAppovAccount);
router.delete("/delete-payrequest/:_id", deletePayRequestById);
router.put("/update-pay-request/:_id", editPayRequestById); //update pay request
router.get("/get-pay-request-id/:_id", getPayRequestById); //get pay request by id
router.get("/get-exceldata", excelData);
router.put("/update-excel-data", updateExcelData);
router.put("/restorepayrequest/:_id", restorepayrequest);
router.post("/approve-data-send-holdpay", approve_pending);
router.post("/hold-payto-payrequest", hold_approve_pending);
router.put("/update-excel", updateExceData);
router.get("/get-single-excel-data/:_id", getExcelDataById);
router.get("/get-pay-smry", getpy);

// add-Bill
router.post("/add-bilL-IT", addBill);
router.get("/get-all-bilL-IT", getBill);
router.put("/update-bill/:_id", updatebill);
router.delete("/delete-credit-amount/:_id", deletecredit);
router.delete("/delete-bill/:_id", deleteBill);
router.put("/accepted-by", bill_approved);

//subtractmoney-debitmoney
router.post("/debit-moneY-IT", subtractmoney);
router.get("/get-subtract-amounT-IT", getsubtractMoney);
router.delete("/delete-debit-money/:_id", deleteDebitMoney);
router.put("/recovery-debit/:_id", recoveryDebit); //to test for rrecovery subtract money
router.delete("/delete-subtract-moneY/:_id", deleteSubtractMoney);

//All Balance SUMMARY
router.get("/get-balance-summary", all_project_balance);
router.get("/get-debit-balance", all_project_debit);
router.get("/get-po-balance", total_po_balance);
router.get("/get-total-billed", total_billed_value);
router.post("/get-total-credit-single", project_credit_amount);
router.post("/get-total-debit-single", project_debit_amount);

//commOffer
router.post("/create-offer", createOffer);
router.get("/get-comm-offer", getCommOffer);
router.put("/edit-offer/:_id", editOffer);
router.delete("/delete-offer/:_id", deleteOffer);

//commRate
router.post("/create-rate", addCommRate);
router.get("/get-comm-rate", getCommRate);
router.put("/edit-comm-rate/:_id", editCommRate);
router.delete("/delete-comm-rate/:_id", deleteCommRate);

//commScmRate
router.post("/create-scm-rate", addCommScmRate);
router.put("/edit-scm-rate/:_id", editCommScmRate);
router.get("/get-comm-scm-rate", getCommScmRate);

//commBDRate
router.post("/create-bd-rate", addCommBDRate);
router.put("/edit-bd-rate/:_id", editCommBDRate);
router.get("/get-comm-bd-rate", getCommBDRate);
router.delete("/delete-comm-bd-rate/:_id", deleteCommBDRate);
router.get("/get-bd-rate-history", getCommBdRateHistory);
router.get("/get-bd-rate-by-offer_id", getCommBDRateByOfferId);

//createBdLead
// router.post("/create-bd-lead", createBDlead);
// router.get("/get-all-bd-lead", getBDlead);
// router.put("/edit-bd-lead/:_id", editBDlead);
// router.delete("/delete-bd-lead/:_id", deleteBDlead);

//createBdLead
router.post("/create-bd-lead", createeBDlead);
router.get("/get-all-bd-lead", getBDleaddata);
router.put("/edit-initial-bd-lead/:_id",editinitialbdlead);
router.get("/get-all-lead",allbdlead);

//initialbd lead
router.post("/initial-to-followup", initialtofollowup);
router.post("/inital-to-warmup", initaltowarmup);
router.post("/inital-to-dead", initialtodead);
router.post("/initial-to-won", initialtowon);
router.get("/get-all-won-lead", getallwon);
router.get("/get-all-followup-lead", getallfollowup);
router.get("/get-all-dead-lead", getalldead);
router.get("/get-all-warm",getallwarm);

//followup to all
router.post("/followup-to-all", followuptoall);
router.post("/followup-to-warm", followuptowarm);
router.post("/followup-to-dead", followuptodead);
router.post("/follow-up-to-won", followuptowon);
router.post("/warmup-to-won", warmuptowon);
router.post("/warmup-to-followup", warmtofollowup);//warm to followup
router.post("/warmup-to-dead", warmuptodead);
router.get("/get-all-inital-bd-lead", getallinitialbdlead);

//Dead to all
router.post("/dead-to-initial", deadtoinitial);
router.post("/dead-to-followup", deadtofollowup);
router.post("/dead-to-warm", deadtowarm);
router.delete("/delete-dead-lead/:_id",deletedead);


//add task
router.post("/add-task",addtask);
router.get("/get-all-task",getaddtask);
router.put("/edit-comment/:_id",editComment);
router.get("/get-task-history",gettaskHistory);


//post bd lead

router.post("/create-initial-bd-lead",iniitalbd);
router.put("/update-inital",updateinitialbd);
router.put("/update-followup",updatefollowup);
router.put("/update-warm",updatewarm);

//edit all bd lead
router.put("/edit-followup/:_id", editfollowup)
router.put("/edit-warm/:_id",editwarm);


//handdoversheet 
router.post("/create-hand-over-sheet",createhandoversheet);
router.get("/get-all-handover-sheet",gethandoversheetdata);
router.put("/edit-hand-over-sheet/:_id",edithandoversheetdata);


//module master
router.post("/add-module-master",addmoduleMaster);
router.get("/get-module-master",getmoduleMasterdata);
router.put("/edit-module-master/:_id",editmodulemaster);
router.delete("/delete-module-master/:_id",deletemodulemaster);



//inveter master
router.post("/add-inveter-master",addinveterMaster);
router.get("/get-master-inverter",getinveterMasterdata);


//transformer master
router.post("/add-transformer-master",addTransformer);
router.get("/get-transformer",getTransformer);

module.exports = router;

