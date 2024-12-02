const { default: mongoose } = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    p_id: { type: String, required: true },
    customer: { type: String, required: true },
    name: { type: String, required: true },
    p_group: { type: String },
    email: { type: String },
    number: { type: String },
    alternate_mobile_number: { type: String },
    billing_address: {
      village_name: {
        type: String,
      },
      district_name: {
        type: String,
      },
    },

    site_address: {
      village_name: {
        type: String,
      },
      district_name: {
        type: String,
      },
    },
    state: { type: String },
    project_category: {
      type: String,
    },
   
    project_kwp: { type: String },
    distance: { type: String },
    tarrif: { type: String },
    land: { type: String },
    code: { type: String },
    project_status: { type: String },
    updated_on: { type: String },

    service: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("projectDetail", projectSchema);
