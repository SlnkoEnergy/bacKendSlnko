const mongoose = require('mongoose');

const boqCategorySchema = new mongoose.Schema({
    boq_template:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BoqTemplate',
        required: true
    },
    module_template:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'moduleTemplates',
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

module.exports = mongoose.model('BoqCategory', boqCategorySchema);