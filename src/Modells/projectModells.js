const { default: mongoose, } = require("mongoose");

const projectSchema = new mongoose.Schema(
  { 
  p_id: { type: String, required: true },
  customer: { type: String, required: true },
  name: { type: String, required: true },
  p_group: { type: String },
  email: { type: String },
  number: { type: String },
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
  project_category:{
    type: String,

  },
  plantCapacity: { type: String },
  subStationDistance: { type: String },
  tarrif: { type: String },
  landAvailable: { type: String },
  SLnkoServiceCharges: { type: String },
  project_status: { type: String },
  projectSubmmitedBy: { type: String },
    
  },
  { timestamps: true }
);

module.exports = mongoose.model("projectDetail", projectSchema);
