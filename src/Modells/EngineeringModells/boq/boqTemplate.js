const mongoose = require('mongoose');

const boqTemplateSchema = new mongoose.Schema({
  boq_category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BoqCategory',
    required: true,
  },
  data: [
    {
      _id: false,
      name: { type: String},
      values: [
        {
          _id: false,
          input_values: { type: String},
        },
      ],
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model('BoqTemplate', boqTemplateSchema);