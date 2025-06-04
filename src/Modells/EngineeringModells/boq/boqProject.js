const mongoose = require("mongoose");

const boqProjectSchema = new mongoose.Schema({
  project_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "projectDetail",
  },
  items: [
    {
      boq_template_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BoqTemplate",
      },
      module_template_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "moduleTemplates",
      },
      data: [
        {
          _id: false,
          name: { type: String },
          values: [
            {
              _id: false,
              input_values: { type: String },
            },
          ],
        },
      ],
    },
  ],
});

module.exports = mongoose.model("BoqProject", boqProjectSchema);
