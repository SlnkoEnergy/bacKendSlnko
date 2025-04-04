const mongoose = require('mongoose');
const commScmRateHistorySchema = new mongoose.Schema({
    
    spv_modules_555: { type: String,default:" " },
    spv_modules_580: { type: String,default:" " },
    spv_modules_550: { type: String,default:" " },
    spv_modules_585: { type: String,default:" " },
   
    solar_inverter: { type: String },
    module_mounting_structure: { type: String, default:" "},
   
    mounting_hardware: { type: String },
    dc_cable: { type: String },
    ac_cable_inverter_accb: { type: String },
    ac_cable_accb_transformer: { type: String },
    ac_ht_cable_11KV: { type: String,default:" " },
    ac_ht_cable_33KV: { type: String,default:" " },
    earthing_station: { type: String },
    earthing_strips: { type: String },
    earthing_strip: { type: String },
    lightening_arrestor: { type: String },
    datalogger: { type: String },
    auxilary_transformer: { type: String },
    ups_ldb: { type: String },
    balance_of_system: { type: String },
    transportation: { type: String },
    transmission_line_11kv: { type: String,default:" " },
    transmission_line_33kv: { type: String,default:" "},
  
    ct_pt_11kv_MP: { type: String,default:" " },
    ct_pt_33kv_MP: { type: String,default:" " },
    ct_pt_11kv_Other: { type: String,default:" " },
    ct_pt_33kv_Other: { type: String,default:" " },
     abt_meter_11kv_MP: { type: String,default:" " },
     abt_meter_33kv_MP: { type: String,default:" " },
     abt_meter_11kv_Other: { type: String,default:" " },
     abt_meter_33kv_Other: { type: String,default:" " },
    
    vcb_kiosk: { type: String },
    slnko_charges_scm: { type: String },
    installation_commissioing: {
      labour_works: { type: String },
      machinery: { type: String },
      civil_material: { type: String },
    },
  
    submitted_by_scm: { type: String },

},{timestamps:true});
module.exports = mongoose.model('commScmRateHistory', commScmRateHistorySchema);