const mongoose = require('mongoose');
const followupbdSchema = new mongoose.Schema({
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
    land: {
        available_land: { type: String },
        land_type: { type: String },
    },
    entry_date: { type: String },
    interest: { type: String },
    comment: { type: String, default: " " },
    loi: { type: String, default: " " },
    ppa: { type: String, default: " " },
    loa: { type: String, default: " " },
    other_remarks: { type: String, default: " " },
    submitted_by: { type: String },
}, { timestamps: true });   

module.exports = mongoose.model('followUpBdlead', followupbdSchema);
