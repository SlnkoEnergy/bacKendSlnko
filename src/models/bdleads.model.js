const mongoose = require("mongoose");
const updateLeadStatus = require("../middlewares/updateleadstatus.middleware");
const updateAssignedTo = require("../middlewares/updateassignedto.middleware");

const bdleadsSchema = new mongoose.Schema(
  {
    id: String,
    group_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "group",
    },
    name: { type: String, required: true },
    company_name: String,
    contact_details: {
      email: { type: String },
      mobile: { type: Array, required: true },
    },
    group: {
      type: String,
    },
    address: {
      village: { type: String, required: true },
      district: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: String,
      country: String,
    },
    project_details: {
      capacity: { type: String, required: true },
      distance_from_substation: {
        unit: { type: String, default: "km" },
        value: String,
      },
      available_land: {
        unit: { type: String, default: "km" },
        value: String,
      },
      tarrif: String,
      land_type: { type: String },
      scheme: { type: String },
    },
    expected_closing_date: {
      type: Date,
    },
    source: {
      from: { type: String, required: true },
      sub_source: { type: String, required: false },
    },
    comments: { type: String, required: true },
    status_history: [
      {
        name: {
          type: String,
          enum: ["initial", "follow up", "warm", "won", "dead"],
        },
        stage: {
          type: String,
          enum: [
            "",
            "loi",
            "loa",
            "ppa",
            "token money",
            "others",
            "as per choice",
          ],
        },
        remarks: String,
        updatedAt: { type: Date, default: Date.now },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    current_status: {
      name: {
        type: String,
        enum: ["", "initial", "follow up", "warm", "won", "dead"],
        default: "initial",
      },
      stage: {
        type: String,
        enum: [
          "",
          "loi",
          "loa",
          "ppa",
          "token money",
          "others",
          "as per choice",
        ],
      },
      remarks: String,
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    assigned_to: [
      {
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ["", "initial", "follow up", "warm", "won", "dead"],
        },
        updatedAt: {
          type: Date,
          default: Date.now(),
        },
      },
    ],
    current_assigned: {
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      status: {
        type: String,
        enum: ["", "initial", "follow up", "warm", "won", "dead"],
      },
    },
    submitted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status_of_handoversheet: {
      type: String,
      default: "false",
    },
    handover_lock: {
      type: String,
      default: "unlock",
    },
    leadAging: {
      type: Number,
      default: 0,
    },
    inactivedate: {
      type: Date,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "highest"],
    },
    documents: [
      {
        name: {
          type: String,
          enum: ["loi", "ppa", "loa", "aadhaar", "other"],
        },
        attachment_url: {
          type: String,
        },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        remarks: {
          type: String,
        },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

bdleadsSchema.pre("save", function (next) {
  if (!this.inactivedate) {
    this.inactivedate = this.createdAt || new Date();
  }
  updateLeadStatus(this);
  updateAssignedTo(this);
  next();
});

module.exports = mongoose.model("bdleads", bdleadsSchema);
