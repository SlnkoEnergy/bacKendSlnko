const { default: mongoose } = require("mongoose");

const vendorSchema= new mongoose.Schema({
    id:{
        type:String
    },
    

    name:{
        type:String
    },
   
Beneficiary_Name:{
        type:String
    },
    
Account_No :{
        type :String
    },
    
IFSC_Code:{
        type:String
    },
    
Bank_Name:{
        type:String
    }

},{timestamps:true})
module.exports = mongoose.model("Vendor", vendorSchema);