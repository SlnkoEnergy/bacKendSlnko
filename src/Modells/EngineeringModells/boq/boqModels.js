const mongoose = require("mongoose");

const boqSchema = new mongoose.Schema({
    // For project Id
    p_id:{
        type:Number,
        required:true,
    },
    // For Boq classes (Class A,B,C and Pooling Station)
    class_items: {
        type:String,
        required: true,
    },
    // For Boq Categories (Module, Inverter, cable)
    category: {
        type: String,
        required: true,
    },
    // For Boq Item Name (SPV Module, Solar Inverter, DC Cable)
    item_name:{
        type: String,
        required: true,
    },
    // For Boq Item Rating (580 Wp, 1500 Kv)
    rating:{
        type: String,
        required: true,
    },
    // For Boq Technical Specification
    technical_specification: {
        type: String,
        required: true,
    },
    // For Boq Tentative Make Decided By Engineering
    tentative_make:{
        type: String,
        required: true,
    },
    // For Boq Quantity
    quantity:{
        type: Number,
        required: true,
    },
    // For Boq Unit of Measurement
    uom:{
        type: String,
        required: true,
    },
    // For Boq scope of work(decided By CAM)
    scope:{
        type: String,
    },
    // For Boq final Make (decided By CAM)
    final_make:{
        type: String,
    },
    // For Boq Status Item Wise(decided By Cam)
    status:{
        type: Boolean,
        default: false,
        required: true,
    },
    // For Boq Created By
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    // for Boq Updated By
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
});

module.exports = mongoose.model("Boq", boqSchema);