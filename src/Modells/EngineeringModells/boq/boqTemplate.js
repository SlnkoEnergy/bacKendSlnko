const mongoose = require('mongoose');

const boqTemplateSchema = new mongoose.Schema({
    boq_category:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BoqCategory',
        required: true
    },
    data:[
        {
            _id: false,  // prevent auto _id for each object in data array
            name: { type: String, required: true },
            value: { type: String, required: true },
        }
    ],
    
}, { timestamps: true });

module.exports = mongoose.model('BoqTemplate', boqTemplateSchema);