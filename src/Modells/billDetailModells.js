const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  id: { 
    type: String, },
    
  po_number: { 
   
    type: String, 
  },
  bill_number: { 
    type: String, 
    
  },
  bill_date: { 
    type:String, 
   
  },
  bill_value: { 
    type: Number, 
   
  },
  type: { 
    type: String, 
  
  },
  status: { 
    type: String, 
   
  },
  submitted_by: { 
    type: String, 
    
  },
  approved_by: { 
    type: String, 
   
  },
  created_on: { 
    type: String, 
   
    default: Date.now // Sets the default value to the current date/time
  },
},{timestamps:true});

module.exports=  mongoose.model('biilDetail', billSchema);


