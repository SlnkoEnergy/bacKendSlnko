const mongoose = require('mongoose');

const boqCategorySchema = new mongoose.Schema({
    name: {type: String, required: true},
    description: {type: String, required: true},
    headers:[
        { 
            _id: false, 
            name: {type: String, required: true},
            key: {type: String, required: true},
            input_type: {type: String, required: true}, 
            required: {type: Boolean, default: false},
            placeholder: {type: String}
        }
    ],
    is_active: {type: Boolean, default: true},
},{ timestamps: true });

module.exports = mongoose.model('BoqCategory', boqCategorySchema);