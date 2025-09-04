const { default: mongoose } = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: " ",
    },
    name: {
      type: String,
    },
    Beneficiary_Name: {
      type: String,
    },
    Account_No: {
      type: mongoose.Schema.Types.Mixed,
    },
    IFSC_Code: {
      type: String,
    },
    Bank_Name: {
      type: String,
    },
  },
  { timestamps: true }
);
module.exports = mongoose.model("Vendor", vendorSchema);
