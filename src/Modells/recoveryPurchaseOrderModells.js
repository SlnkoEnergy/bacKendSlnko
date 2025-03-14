const { default: mongoose } = require("mongoose");

const recoveryPurchaseOrder = new mongoose.Schema({
    p_id: {
        type: String,
      },
      offer_Id:{
          type: String,
      },
      
  po_number: {
        type: String,
      },
      date: {
        type: String,
      },
      item: {
        type: String,
       
      },
      other: {
        type: String,
         default:" ",
      },
      po_value: {
        type: String,
      },
      final:{
        type: String,
      },
      po_balance: {
        type: String,
      },
      vendor: {
        type: String,
      },
      partial_billing: {
        type: String,
      },
  
      amount_paid: {
        type: String,
      },
      comment: {
        type: String,
      },
      updated_on: {
        type: String,
      },




},{timestamps:true})

module.exports= mongoose.model("recoveryPurchaseorder",recoveryPurchaseOrder);