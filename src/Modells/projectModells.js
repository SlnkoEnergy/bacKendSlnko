const { default: mongoose, } = require("mongoose");

const projectSchema = new mongoose.Schema(
  { project_ID: { type: String, required: true },
  customerName: { type: String, required: true },
  projectName: { type: String, required: true },
  projectGroup: { type: String },
  emailID: { type: String },
  mobileNumber: { type: String },
  alternateMobilenumber: { type: String },
  billingAddress: {
    villageName: {
      type: String,
      
    },
    districtName: {
      type: String,
      
    },
  },

  siteAddress: {
    villageName: {
      type: String,
      
    },
    districtName: {
      type: String,
    
    },
  },
  state: { type: String },
  plantCapacity: { type: String },
  subStationDistance: { type: String },
  tarrif: { type: String },
  landAvailable: { type: String },
  SLnkoServiceCharges: { type: String },
  projectStatus: { type: String },
  projectSubmmitedBy: { type: String },
    
  },
  { timestamps: true }
);

module.exports = mongoose.model("projectDetail", projectSchema);
