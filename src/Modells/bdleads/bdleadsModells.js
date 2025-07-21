const mongoose = require("mongoose");
const updateLeadStatus = require("../../middlewares/bdLeadMiddlewares/updateLeadStatus");
const updateAssignedTo = require("../../middlewares/bdLeadMiddlewares/updateAssignedTo");

const bdleadsSchema = new mongoose.Schema(
  {
    id: String,
    name: { type: String, required: false },
    company_name: String,
    contact_details: {
      email: String,
      mobile: { type: Array, required: false },
    },
    group: {
      type: String,
    },
    address: {
      line1: String,
      line2: String,
      village: { type: String, required: false },
      district: { type: String, required: false },
      state: { type: String, required: false },
      postalCode: String,
      country: String,
    },
    project_details: {
      capacity: { type: String, required: false },
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
    expected_closing_date:{
      type:Date
    },
    source: {
      from: { type: String, required: false },
      sub_source: { type: String, required: false },
    },
    comments: { type: String, required: false },
    status_history: [
      {
        name: {
          type: String,
          enum: ["initial", "follow up", "warm", "won", "dead"],
        },
        stage: {
          type: String,
          enum: ["", "loi", "loa", "ppa", "token money", "others", "as per choice"],
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
        enum: ["","initial", "follow up", "warm", "won", "dead"],
        default: "initial",
      },
      stage: {
        type: String,
        enum: ["","loi", "loa", "ppa", "token money", "others", "as per choice"],
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
          enum: ["","initial", "follow up", "warm", "won", "dead"],
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
        enum: ["","initial", "follow up", "warm", "won", "dead"],
      },
    },
    submitted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    documents:[
      {
        name:{
          type:String,
          enum:["loi", "ppa", "loa", "aadhaar", "other"]
        },
        attachment_url:{
          type:String
        },
        user_id:{
          type:mongoose.Schema.Types.ObjectId,
          ref:"User"
        },
        remarks:{
          type: String
        },
         updatedAt: { type: Date, default: Date.now },
      }
    ]
  },
  { timestamps: true }
);

bdleadsSchema.pre("save", function (next) {
  updateLeadStatus(this);
  next();
});

bdleadsSchema.pre("save", function(next){
  updateAssignedTo(this);
  next();
})

module.exports = mongoose.model("bdleads", bdleadsSchema);
