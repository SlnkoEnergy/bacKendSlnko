const mongoose =require("mongoose");
const adjustmentRequestSchema = new mongoose.Schema({
     p_id: { type: Number },
        pay_id: { type: String },
        pay_type: { type: String },
        amount_paid: { type: String },
      
        dbt_date: { type: String },
        paid_for: { type: String },
        vendor: { type: String },
        po_number: { type: String },
        po_value: { type: String },
        adj_type: { type: String },
        adj_amount: { type: String },
        remark: { type: String },
        adj_date: { type: String },
   
      
      
        submitted_by: { type: String },
       
        comment: { type: String },

}, { timestamps: true });

module.exports = mongoose.model("adjustmentRequest", adjustmentRequestSchema);
