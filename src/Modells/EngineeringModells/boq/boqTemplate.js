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
      fields: [
        {
          _id: false,
          name: { type: String},
          value: { type: String},
        },
      ],
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model('BoqTemplate', boqTemplateSchema);
