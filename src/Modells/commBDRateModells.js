const mongoose = require('mongoose');
 const commBDRateSchema = new mongoose.Schema({

    spv_modules:{ type: String,default:" " },
   
    offer_id: { type: String,default:" " },
    
    module_mounting_structure: { type: String},
  
    transmission_line: { type: String,default:" " },
  
   
    
    
    slnko_charges: { type: String },
    
    submitted_by_BD: { type: String },


 },{timestamps:true});

 module.exports = mongoose.model('commBDRate', commBDRateSchema);