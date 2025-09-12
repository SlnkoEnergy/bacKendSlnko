const mongoose = require("mongoose");
const modulemasterSchema = new mongoose.Schema({
    make: { type: String },
    power: { type: String },
    type: { type: String },
    model: { type: String },
    vmp: { type: String },
    imp: { type: String },
    voc: { type: String },
    isc: { type: String },
    alpha: { type: String },
    beta: { type: String },
    gamma: { type: String },
    l: { type: String },
    w: { type: String },
    t: { type: String },
    status: { type: String },
    submitted_by: { type: String },
},{timestamps:true});
module.exports = mongoose.model("modulemaster", modulemasterSchema);