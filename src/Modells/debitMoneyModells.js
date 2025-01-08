const { default: mongoose } = require("mongoose");

const debitmoneySchema= new mongoose.Schema({
    p_id: {
        type: Number,
        
      },
      p_group: {
        type: String,
       
      },
      pay_type: {
        type: String,
        
      },
      amount_paid: {
        type: Number,
       
      },
      amt_for_customer: {
        type: Number,
        
      },
      dbt_date: {
        type: Date,
       
      },
      paid_for: {
        type: String,
        
      },
      other: {
        type: String,
      
      },
      vendor: {
        type: String,
        
      },
      po_number: {
        type: String,
      
      },
      pay_mode: {
        type: String,
      
      },
      dbt_acc_number: {
        type: String,
       
      },
      cr_acc_number: {
        type: String,
      
      },
      utr: {
        type: String,
      
      },
      trans_details: {
        type: String,
        
      },
      submitted_by: {
        type: String,
     
      },
      t_id: {
        type: String,
       
      },


},{timestamps:true})

module.exports= mongoose.model("subtract money",debitmoneySchema);