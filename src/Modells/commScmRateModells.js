const mongoose = require("mongoose");

const commScmRateSchema = new mongoose.Schema(
  {
    spv_modules: { type: String },
    solar_inverter: { type: String },
    module_mounting_structure: { type: String },
    mounting_hardware: { type: String },
    dc_cable: { type: String },
    ac_cable_inverter_accb: { type: String },
    ac_cable_accb_transformer: { type: String },
    ac_ht_cable: { type: String },
    earthing_station: { type: String },
    earthing_strips: { type: String },
    earthing_strip: { type: String },
    lightening_arrestor: { type: String },
    datalogger: { type: String },
    auxilary_transformer: { type: String },
    ups_ldb: { type: String },
    balance_of_system: { type: String },
    transportation: { type: String },
    transmission_line: { type: String },
    ct_pt: { type: String },
    abt_meter: { type: String },
    vcb_kiosk: { type: String },
    slnko_charges: { type: String },
    installation_commissioing: {
      labour_works: { type: String },
      machinery: { type: String },
      civil_material: { type: String },
    },
    // labour_works: { type: String },
    // machinery: { type: String },
    // civil_material: { type: String },
    submitted_by: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("commScmRate", commScmRateSchema);
