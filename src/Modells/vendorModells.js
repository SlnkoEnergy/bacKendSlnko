const { default: mongoose } = require("mongoose");

const vendorSchema= new mongoose.Schema({
    vendorName:{
        type:String
    },
    benificiaryName:{
        type:String
    },
    accountNumber :{
        type :String
    },
    ifscCode:{
        type:String
    },
    bankName:{
        type:String
    }

},{timestamps:true})
module.exports = mongoose.model("Vendor", vendorSchema);