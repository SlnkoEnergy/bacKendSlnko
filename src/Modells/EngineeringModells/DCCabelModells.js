const mongoose = require('mongoose');
const dccabelSchema = new mongoose.Schema({
    make: { type: String },
    size: { type: String },
   
    rated_ac_voltage: { type: String },
    nominal_dc_voltage: { type: String },
    core: { type: String },
   
    status:{type:String},
    submitted_by:{type:String},
}, { timestamps: true });

module.exports = mongoose.model("dccabel", dccabelSchema);