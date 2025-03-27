const mongoose = require('mongoose');
const transformerSchema = new mongoose.Schema({
    make:{
        type: String,
       default:"",
    },
    size:{
        type: String,
        default:"",
    },
    type:{
        type: String,
        default:"",
    },
    vector_group:{
        type: String,
        default:"",
    },
    cooling_type:{
        type: String,
        default:"",
    },primary_voltage:{
        type: String,
        default:"",
    },
    secondary_voltage:{
        type: String,
        default:"",
    },
    voltage_ratio:{
        type: String,
        default:"",
    },
    voltage_variation:{
        type: String,
        default:"",
    },
    ratedCurrentHV:{
        type: String,
        default:"",
    },
    ratedCurrentLV1:{
        type: String,
        default:"",
    },
    ratedCurrentLV2:{
        type: String,
        default:"",
    },
    impedance:{
        type: String,
        default:"",
    },
    winding_material:{
        type: String,
        default:"",
    },
    status:{
        type: String,
        default:"",
    },
    submitted_By:{
        type: String,
        default:"",
    },
    comment:{
        type: String,
        default:"",
    }





},{timestamps: true});
module.exports = mongoose.model('transformerMaster', transformerSchema);