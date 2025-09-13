const mongoose = require("mongoose");
const inveterMasterSchema = new mongoose.Schema(
  {
    inveter_model: { type: String, default: "" },
    inveter_size: { type: String, default: "" },
    inveter_type: { type: String, default: "" },
    inveter_make: { type: String },
    max_pv_input_voltage: { type: String },
    mpp_voltage_range: { type: String },
    mppt: { type: String },
    pre_mppt_input: { type: String },
    total_input: { type: String },
    max_pv_input_current_per_mppt: { type: String },
    max_dc_short_circuit_current_per_mppt: { type: String },
    ac_output_power: { type: String },
    max_ac_output_current: { type: String },
    nominal_ac_voltage: { type: String },
    status: { type: String },
    submitted_by: { type: String },
  },
  { timestamps: true }
);
module.exports = mongoose.model("inveterMaster", inveterMasterSchema);
