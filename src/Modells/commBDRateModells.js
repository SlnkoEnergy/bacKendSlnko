const mongoose = require('mongoose');
 const commBDRateSchema = new mongoose.Schema({

    spv_modules_555_BD: { type: String,default:" " },
    spv_modules_580_BD: { type: String,default:" " },
    spv_modules_550_BD: { type: String,default:" " },
    spv_modules_585_BD: { type: String,default:" " },
    offer_id: { type: String,default:" " },
    
    module_mounting_structure_BD: { type: String},
  
    transmission_line_11kv_BD: { type: String,default:" " },
    transmission_line_33kv_BD: { type: String,default:" "},
   
    
    
    slnko_charges_BD: { type: String },
    
    submitted_by_BD: { type: String },


 },{timestamps:true});

 module.exports = mongoose.model('commBDRate', commBDRateSchema);