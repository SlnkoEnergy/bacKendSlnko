const { default: mongoose } = require("mongoose");
const updateStatusGroup = require("../../utils/updateStatusGroup");

const groupSchema = new mongoose.Schema(
  {
    group_code: {
      type: String,
    },
    groupName: {
      type: String,
    },
    company_name:{
      type:String
    },
    project_details: {
      capacity: {
        type: String,
        required: true,
      },
      scheme: {
        type: String,
      },
    },
    source: {
      from: { type: String, required: true },
      sub_source: { type: String, required: false },
    },
    contact_details: {
      email: String,
      mobile: { type: Array, required: true },
    },
    address: {
      village: { type: String, required: true },
      district: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: String,
      country: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status_history: [
      {
        status: {
          type: String,
          enum: ["open", "closed"],
        },
        remarks: {
          type: String,
        },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    current_status: {
      status: {
        type: String,
        enum: ["open", "closed"],
      },
      remarks: {
        type: String,
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
  },
  { timestamps: true }
);

groupSchema.pre("save", function(next) {
    updateStatusGroup(this); 
    next();
})

module.exports = mongoose.model("group", groupSchema);
