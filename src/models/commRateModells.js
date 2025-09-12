
const mongoose = require('mongoose');
const commRateSchema = new mongoose.Schema({
    rate:{
        type:Number,
    },
    Uom:{
        type:String,
    },
    Internal_Qty:{
        type:Number,
    },
    Print_Qty:{
        type:Number,
    },

},{timestamps:true});


module.exports = mongoose.model('commRate', commRateSchema);