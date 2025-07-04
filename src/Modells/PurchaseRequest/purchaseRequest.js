const mongoose = require("mongoose");
const updateCurrentStatusItems = require("../../utils/statusUpdateUtils/updateCurrentStatusItems");

const purchaseRequestSchema = new mongoose.Schema({
  project_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "projectDetail",
  },
  items: [{
    item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MaterialCategory",
    },
    status_history:[{
      status: {
        type: String,
        enum: ["advance_paid","po_created", "payment_done", "draft","out_for_delivery", "delivered"],
      },
      remarks: {
        type: String,
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    }],
    current_status: {
      status:{
        type: String,
      enum: ["advance_paid","po_created", "payment_done", "draft","out_for_delivery", "delivered"],
      },
      remarks: {
        type: String,
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
  }],
  pr_no: {
    type: String,
  },
  created_by:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
  }
});

purchaseRequestSchema.pre("save", function(next){
  updateCurrentStatusItems(this, "status_history", "current_status");
  next();
})

module.exports = mongoose.model("PurchaseRequest", purchaseRequestSchema);
