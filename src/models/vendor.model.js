const { default: mongoose } = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["person", "company"],
    },
    name: {
      type: String,
      required: true,
      unique: true,
    },
    company_name: {
      type: String,
    },
    Beneficiary_Name: {
      type: String,
      required: true,
    },
    Account_No: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    IFSC_Code: {
      type: String,
      required: true,
    },
    Bank_Name: {
      type: String,
      required: true,
    },
    contact_details: {
      email: { type: String, required: true, unique: true },
      phone: String,
    },
    address: {
      line1: String,
      line2: String,
      pincode: String,
      city: String,
      state: String,
    },
    profile_image: {
      type: String,
    },
    attachments: [
      {
        filename: String,
        fileUrl: String,
        fileType: String,
      },
    ],
  },
  { timestamps: true }
);
module.exports = mongoose.model("Vendor", vendorSchema);
