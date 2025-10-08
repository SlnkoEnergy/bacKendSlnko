const mongoose = require("mongoose");
const LinkType = ["FS", "SS", "FF", "SF"];

const QuantityFormulaVarSchema = new mongoose.Schema(
  {
    model_name: { type: String, required: true, trim: true },
    source: {
      type: String,
      enum:['context', 'custom'],
      required: true,
    },
    key: { type: String, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const RequiredQuantitySchema = new mongoose.Schema(
  {
    formula_raw: { type: String, required: false },
    variables: { type: [QuantityFormulaVarSchema], default: [] },
    quantity_unit: { type: String, default: "" },
    evaluated_at: { type: Date },
  },
  { _id: false }
);

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
        category_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MaterialCategory",
          required: true,
        },
        required_quantity: { type: RequiredQuantitySchema, required: true },
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

activitySchema.pre("save", function (next) {
  try {
    if (Array.isArray(this.products)) {
      for (const p of this.products) {
        if (!p?.required_quantity) continue;
        const rq = p.required_quantity;
        if (!rq.formula_raw && rq.quantity_formula) {
          rq.formula_raw = rq.quantity_formula;
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("activities", activitySchema);
