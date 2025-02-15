const mongoose = require('mongoose');
 const commBDRateSchema = new mongoose.Schema({

    spv_modules_555: { type: String,default:" " },
    spv_modules_580: { type: String,default:" " },
    spv_modules_550: { type: String,default:" " },
    spv_modules_585: { type: String,default:" " },
    offer_id: { type: String,default:" " },
    
    module_mounting_structure: { type: String},
  
    transmission_line_11kv: { type: String,default:" " },
    transmission_line_33kv: { type: String,default:" "},
   
    
    
    slnko_charges: { type: String },
    
    submitted_by: { type: String },


 },{timestamps:true});

 module.exports = mongoose.model('commBDRate', commBDRateSchema);