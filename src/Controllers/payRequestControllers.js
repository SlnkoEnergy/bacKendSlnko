const payRequestModells = require("../Modells/payRequestModells");
const projectModells =require("../Modells/projectModells");
const holdPayment = require("../Modells/holdPaymentModells");
const holdPaymentModells = require("../Modells/holdPaymentModells");
const NodeCache = require("node-cache");
const nodeCache = new NodeCache();



const  payRrequest = async (req, res) => {
  try {
    const {  id,
      p_id,
      pay_id,
      pay_type,
      amount_paid,
      amt_for_customer,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      po_balance,
      pay_mode,
      paid_to,
      ifsc,
      benificiary,
      acc_number,
      branch,
      created_on,
      submitted_by,
      approved,
      disable,
      acc_match,
      utr,
      total_advance_paid,
      other,
      comment, } = req.body;

    // Check if pay_id exists
    const existingPayment = await payRequestModells.findOne({ pay_id:pay_id });
    if (existingPayment) {
      return res.status(400).json({ msg: 'Payment ID already used!' });
    }


    // Get project details by project ID
    const project = await projectModells.find({ p_id:p_id });
    if (!project) {
      return res.status(400).json({ msg: 'Project ID is invalid!' });
    }

    // Validation: Amount paid should not exceed PO value
    if (amount_paid > po_value) {
      return res.status(400).json({ msg: 'Requested Amount is greater than PO Value!' });
    }

    // Insert new payment request
    const newPayment = new payRequestModells({ 
      id,
      p_id,
      pay_id,
      pay_type,
      amount_paid,
      amt_for_customer,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      po_balance,
      pay_mode,
      paid_to,
      ifsc,
      benificiary,
      acc_number,
      branch,
      created_on,
      submitted_by,
      approved,
      disable,
      acc_match,
      utr,
      total_advance_paid,
      other,
      comment,
      
      
      
    });
    await newPayment.save();

    return res.status(200).json({ msg: 'Payment requested successfully', newPayment });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Failed to request payment. Please try again.', error: error.message });
  }
};






// const recoverypay= async function (req,res) {
  
// try {
//   const { _id } = req.params._id;
//     const deleted = await payRequestModells.findOneAndReplace( _id);
//     console.log(deletedItem);
//      if (!deletedItem) {
//       return res.status(404).json({ message: "Item not found" });
//     }
// const recoveryItemData = new recoverPayModells({
//       id: deleted.id,
//       p_id: deleted.p_id,
//       pay_id: deleted.pay_id,
//       pay_type: deleted.pay_type,
//       amount_paid: deleted.amount_paid,
//       amt_for_customer: deleted.amt_for_customer,
//       dbt_date: deleted.dbt_date,
//       paid_for: deleted.paid_for,
//       vendor: deleted.vendor,
//       po_number: deleted.po_number,
//       po_value: deleted.po_value,
//       po_balance: deleted.po_balance,
//       pay_mode: deleted.pay_mode,
//       paid_to: deleted.paid_to,
//       ifsc: deleted.ifsc,
//       benificiary: deleted.benificiary,
//       acc_number: deleted.acc_number,
//       branch: deleted.branch,
//       created_on: deleted.created_on,
//       submitted_by: deleted.submitted_by,
//       approved: deleted.approved,
//       disable: deleted.disable,
//       acc_match: deleted.acc_match,
//       utr: deleted.utr,
//       total_advance_paid: deleted.total_advance_paid,
//       other: deleted.other,
//   });

//   await recoveryItemData.save();
//   res.json({
//       message: "Item moved to recovery collection successfully",
//       item: recoveryItemData,
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Error processing recovery: " + error });
//   }
// };

// const recoverypay = async function (req, res) {
//   const { _id } = req.params;

//   try {
//     // Validate _id
//     const mongoose = require("mongoose");
//     if (!mongoose.Types.ObjectId.isValid(_id)) {
//       return res.status(400).json({ message: "Invalid _id provided" });
//     }

//     // Fetch and delete the item
//     const deletedItem = await payRequestModells.findByIdAndDelete(_id);
//     if (!deletedItem) {
//       return res.status(404).json({ message: "Item not found" });
//     }

//     // Create recovery item
//     const recoveryItemData = new recoverPayModells({
//       id: deletedItem.id,
//       p_id: deletedItem.p_id,
//       pay_id: deletedItem.pay_id,
//       pay_type: deletedItem.pay_type,
//       amount_paid: deletedItem.amount_paid,
//       amt_for_customer: deletedItem.amt_for_customer,
//       dbt_date: deletedItem.dbt_date,
//       paid_for: deletedItem.paid_for,
//       vendor: deletedItem.vendor,
//       po_number: deletedItem.po_number,
//       po_value: deletedItem.po_value,
//       po_balance: deletedItem.po_balance,
//       pay_mode: deletedItem.pay_mode,
//       paid_to: deletedItem.paid_to,
//       ifsc: deletedItem.ifsc,
//       benificiary: deletedItem.benificiary,
//       acc_number: deletedItem.acc_number,
//       branch: deletedItem.branch,
//       created_on: deletedItem.created_on,
//       submitted_by: deletedItem.submitted_by,
//       approved: deletedItem.approved,
//       disable: deletedItem.disable,
//       acc_match: deletedItem.acc_match,
//       utr: deletedItem.utr,
//       total_advance_paid: deletedItem.total_advance_paid,
//       other: deletedItem.other,
//     });

//     await recoveryItemData.save();
//     res.json({
//       message: "Item moved to recovery collection successfully",
//       item: recoveryItemData,
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Error processing recovery: " + error.message });
//   }
// };


//Hold payment 
const holdpay = async function(req,res) {

  try{
  const{
    id,
    p_id,
    pay_id,
    pay_type,
    amount_paid,
    amt_for_customer,
    dbt_date,
    paid_for,
    vendor,
    po_number,
    po_value,
    po_balance,
    pay_mode,
    paid_to,
    ifsc,
    benificiary,
    acc_number,
    branch,
    created_on,
    submitted_by,
    approved,
    disable,
    acc_match,
    utr,
    total_advance_paid,
    other,
    comment,

  }=req.body;

  const existingPayment = await payRequestModells.findOne({ pay_id:pay_id });
    if (existingPayment) {
      return res.status(400).json({ msg: 'Payment ID already used!' });
    }


    // Get project details by project ID
    const project = await projectModells.find({ p_id:p_id });
    if (!project) {
      return res.status(400).json({ msg: 'Project ID is invalid!' });
    }

    // Validation: Amount paid should not exceed PO value
    if (amount_paid > po_value) {
      return res.status(400).json({ msg: 'Requested Amount is greater than PO Value!' });
    }

    const holdPayment = new holdPaymentModells({ 
      id,
      p_id,
      pay_id,
      pay_type,
      amount_paid,
      amt_for_customer,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      po_balance,
      pay_mode,
      paid_to,
      ifsc,
      benificiary,
      acc_number,
      branch,
      created_on,
      submitted_by,
      approved,
      disable,
      acc_match,
      utr,
      total_advance_paid,
      other,
      comment,
      
      
      
    });
    await holdPayment.save();

    return res.status(200).json({ msg: 'Hold Payment requested successfully', holdPayment });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Failed to request hold payment. Please try again.', error: error.message });
  }

};

//get alll pay summary
const getPaySummary =async (req,res) => {
  let request;
  if(nodeCache.has("request")){
    request =JSON.parse(nodeCache.get("request"));
  }else{
    request =await payRequestModells.find();
    nodeCache.set("request",JSON.stringify(request))
}

  res.status(200).json({msg:"all-pay-summary",data:request})
  
};

//get all hold pay
const hold = async function(req,res) {
  let data = await holdPaymentModells.find();
  res.status(200).json({msg:"Hold Payment Status",data})
  
};


 const account_matched = async function (req,res) {
  const { pay_id,  acc_number, ifsc } = req.body;
  try {
    const payment = await payRequestModells.findOneAndUpdate(
      { pay_id, acc_number, ifsc }, // Matching criteria
      { $set: { acc_match: 'matched' } }, // Update action
      { new: true } // Return the updated document
    );

    if (payment) {
      res.status(200).json({
        message: 'Account matched successfully!',
        data: payment,
      });
    } else {
      res.status(404).json({
        message: 'No matching record found.',
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'An error occurred while matching the account.',
    });
  }
};
  





  





  module.exports={
    payRrequest,holdpay,
    getPaySummary,
    hold,
    account_matched

    
  }



    
    
