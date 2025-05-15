const { default: mongoose } = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    p_id: { type: Number, default: " " },
    customer: { type: String, default: " " },
    name: { type: String, default: " " },
    p_group: { type: String },
    email: { type: String },
    number: { type: String },
    alt_number: {
      type: String,
    },
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
    submitted_by: { type: String },
    billing_type: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("projectDetail", projectSchema);
