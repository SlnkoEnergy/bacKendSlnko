const mongoose = require('mongoose');
const acCabelSchema = new mongoose.Schema({
    make:{
        type: String,
      
    },
    size:{
        type: String,
     
    },
    lt_ht:{
        type: String,
       
   
    },
    voltage_rating:{
        type: String,
        
    },
    type:{
        type: String,
        
    },
    core:{
        type: String,
        
    },
    status:{
        type: String,
        
    },
    submitted_by:{
        type: String,
        
    },
    
},{timestamps:true});
module.exports = mongoose.model("ACcabel", acCabelSchema);