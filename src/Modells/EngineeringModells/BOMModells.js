const mongoose =require("mongoose");

const bomSchema = new mongoose.Schema({
    category: { type: String },
    make: { type: String },
    rating: { type: String },
    specification: { type: String },
    quantity: { type: String },
    uom: { type: String },
    submitted_by: { type: String },
},{timestamps:true});

module.exports = mongoose.model("bom_engineering", bomSchema);