const mongoose = require("mongoose");
const updateAttachmentUrlStatus = require("../middlewares/updateattachementurlstatus.middleware");

const boqProjectSchema = new mongoose.Schema({
  project_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "projectDetail",
  },
  items: [
    {
      boq_template: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BoqTemplate",
      },
      module_template: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "moduleTemplates",
      },
      current_data: [
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
      data_history: [
        [
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
      ],
    },
  ],
});

boqProjectSchema.pre("save", function(next){
  updateAttachmentUrlStatus(this, "data_history", "current_data");
  next();
})

module.exports = mongoose.model("BoqProject", boqProjectSchema);
