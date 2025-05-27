const mongoose = require("mongoose");
const updateLeadStatus = require("../middlewares/bdLeadMiddlewares/updateLeadStatus");

const bdleadsSchema = new mongoose.Schema({
  id: String,
  name: {type: String, required: true},
  company_name: String,
  contact_details: {
    email: String,
    mobile: {type: Array, required: true},
  },
  address: {
    line1: String,
    line2: String,
    city: {type: String, required: true},
    district: {type: String, required: true},
    state: {type: String, required: true},
    postalCode: String,
    country: String,
    geo_codes: {
      latitude: String,
      longitude: String
    }
  },
  project_details: {
    capacity: {type: String, required: true},
    distance_from_substation: {
      unit: {type: String, default: 'km'},
      value: String
    },
    tarrif: String,
    land_type: { type: String, enum: ["Leased", "Owned"] },
    scheme: { type: String, enum: ["KUSUM A", "KUSUM C", "KUSUM C2", "Other"] },
  },
  source: {
    from: { type: String, enum: ["Referred by", "Social Media", "Marketing", "IVR/My Operator", "Others"], required: true },
    sub_source: {type: String, required: true},
  },
  createdAt: { type: Date, default: Date.now, required: true },
  comments: {type: String, required: true},
  status_history: [
    {
      name: {
        type: String,
        enum: ["Initial", "Follow Up", "Warm", "Won", "Dead"],
      },
      stage: {
        type: String,
        enum: ["LOI", "LOA", "PPA","Token Money", "Others"]
      },
      remarks: String,
      documents: [String],
      updatedAt: { type: Date, default: Date.now }
    }
  ],
  current_status: {
    name: {
      type: String,
      enum: ["Initial", "Follow Up", "Warm", "Won", "Dead"],
      default: "Initial"
    },
    stage: {
      type: String,
      enum: ["LOI", "LOA", "PPA","Token Money", "Others"]
    }
  }
},{timestamps:true});

// :stopwatch: Auto-update current_status before save
bdleadsSchema.pre("save", function (next) {
  updateLeadStatus(this);
  next();
});


module.exports = mongoose.model("bdleads", bdleadsSchema);