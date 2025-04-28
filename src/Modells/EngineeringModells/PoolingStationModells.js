const mongoose = require('mongoose');
const poolingStationSchema = new mongoose.Schema({
    category: {
        type: String,
       
    },
    itemName: {
        type: String,
        
    },
    rating: {
        type: String,
        
    },
    technicalSpecification: {
        type: String,
     },
     status: {
        type: String,
     },
     submittedBy: {
        type: String,
     },


}, { timestamps: true });

module.exports = mongoose.model("PoolingStation", poolingStationSchema);