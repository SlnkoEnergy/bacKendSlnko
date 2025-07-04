const mongoose = require("mongoose");
const updateCurrentStatus = require("../../utils/statusUpdateUtils/updateCurrentStatus");

const materialSupplySchema = new mongoose.Schema({
  project_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "projectDetail",
  },
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MaterialCategory",
  },
  po_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "purchaseOrder",
  },
  scope_history: [
    {
      status: {
        type: String,
        enum: ["slnko", "client", "draft"],
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      remarks: {
        type: String,
      },
    },
  ],
  current_scope:{
    status:{
        type:String,
        enum:["slnko", "client", "draft"],
      },
      user_id:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
      },
      remarks:{
        type:String
      }
  },
  pr_no: {
    type: String,
  },
  etd: {
    type: Date,
  },
  delivery_date: {
    type: Date,
  },
});

materialSupplySchema.pre("save", function(next){
  updateCurrentStatus(this, "scope_history", "current_scope");
  next();
})

module.exports = mongoose.model("MaterialSupply", materialSupplySchema);
