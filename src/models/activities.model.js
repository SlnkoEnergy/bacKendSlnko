const mongoose = require("mongoose");
const LinkType = ["FS", "SS", "FF", "SF"];
const activitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["backend", "frontend"],
      default: "frontend",
    },
    order: {
      type: Number,
    },
    dependency: [
      {
        model: { type: String },
        model_id: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "dependency.model",
          required: true,
        },
        model_id_name: { type: String },
        updatedAt: { type: Date, default: Date.now },
        updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    predecessors: [
      {
        activity_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "activities",
        },
        type: { type: String, enum: LinkType, default: "FS" },
        lag: { type: Number, default: 0 },
      },
    ],
    products: [
      {
        product_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Material",
        },
        required_quantity: {
          quantity_formula: { type: String },
          quantity_unit: { type: String },
        },
      },
    ],
    completion_formula: {
      type: String,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("activities", activitySchema);
