const mongoose = require("mongoose");
const createBDleadSchema = new mongoose.Schema({
    id: { type: String },
    c_name: { type: String },
    email: { type: String },
    mobile: { type: String },
    alt_mobile: { type: String },
    company: { type: String },
    village: { type: String },
    district: { type: String },
    state: { type: String },
    scheme: { type: String },
    capacity: { type: String },
    distance: { type: String },
    tarrif: { type: String },
    land: { type: String },
    entry_dtae: { type: String },
    submitted_by: { type: String },
}, { timestamps: true });
module.exports = mongoose.model("createBDlead", createBDleadSchema);
   
