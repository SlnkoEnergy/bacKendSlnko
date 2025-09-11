const mongoose = require('mongoose');
const conmmOfferModells = new mongoose.Schema({


    offer_id: { type: String },
    client_name: { type: String },
    village: { type: String },
    district: { type: String },
    state: { type: String },
    pincode: { type: String },
    ac_capacity: { type: Number },
    dc_capacity: { type: Number },
    scheme: { type: String },
    component: { type: String },
    rate: { type: Number},
   
    timeline: { type: String },
    module_capacity: { type: Number },
    module_type: { type: String },
    inverter_capacity: { type: Number },
    evacuation_voltage: { type: Number },
    module_orientation: { type: String },
    transmission_length: { type: Number },
    transformer: { type: String },
    column_type: { type: String },
    prepared_by: { type: String },
    created_on: { type: Date, default: Date.now },
    dc_overloading: { type: String },
    mob_number: { type: String },


    
},{timestamps:true});

module.exports = mongoose.model('commOffer', conmmOfferModells);