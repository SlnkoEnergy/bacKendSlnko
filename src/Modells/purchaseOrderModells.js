const { default: mongoose } = require("mongoose");

const purchaseOrderSchema = new mongoose.Schema(
  {
    project_ID: {
      type: String,
    },
    offer_Id:{
        type: String,
    },
    poNumber: {
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
    poValue: {
      type: String,
    },
    totalAdvancePaid: {
      type: String,
    },
    poBalance: {
      type: String,
    },
    vendor: {
      type: String,
    },
    partialBilling: {
      type: String,
    },

    amountPaid: {
      type: String,
    },
    comment: {
      type: String,
    },
    updatedOn: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("purchaseOrder", purchaseOrderSchema);
