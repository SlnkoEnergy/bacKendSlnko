const { default: mongoose } = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");

const projectSchema = new mongoose.Schema(
  {
    p_id: { type: Number, default: " " },
    customer: { type: String, default: " " },
    name: { type: String, default: " " },
    p_group: { type: String },
    email: { type: String },
    number: { type: Number },
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
    dc_capacity: { type: String },
    distance: { type: String },
    tarrif: { type: String },
    land: { type: String },
    code: { type: String },
    status_history: [
      {
        status: {
          type: String,
          enum: ["to be started", "ongoing", "completed", "on hold", "delayed"],
        },
        remarks: {
          type: String,
        },
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        updated_at: { type: Date, default: Date.now },
      },
    ],
    current_status: {
      status: {
        type: String,
        enum: ["to be started", "ongoing", "completed", "on hold", "delayed"],
      },
      remarks: { type: String },
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      updated_at: { type: Date, default: Date.now },
    },
    service: { type: String },
    submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    billing_type: {
      type: String,
    },
    project_completion_date: { type: Date },
    bd_commitment_date: { type: Date },
    ppa_expiry_date: { type: Date },
    remaining_days: { type: Number, default: null },
  },
  { timestamps: true }
);

projectSchema.pre("save", function (next) {
  updateStatus(this, "to be started");
  next();
});

module.exports = mongoose.model("projectDetail", projectSchema);
