  const mongoose = require("mongoose");
  const updateStatus = require("../utils/updatestatus.utils");
const updateCommitmentDate = require("../utils/updatecommitmentdate.utils");

  const scopeSchema = new mongoose.Schema(
    {
      project_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "projectDetail",
      },
      items: [
        {
          item_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MaterialCategory",
          },
          name: {
            type: String,
          },
          type: {
            type: String,
            enum: ["supply", "execution"],
          },
          category: {
            type: String,
          },
          scope: {
            type: String,
            enum: ["slnko", "client"],
          },
          quantity: {
            type: String,
          },
          uom: {
            type: String,
          },
          order: {
            type: Number,
          },
          pr_status: {
            type: Boolean,
            default: false,
          },
          commitment_date_history: [
            {
              date: {
                type: Date,
              },
              remarks: {
                type: String,
              },
              user_id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
              },
              updatedAt: {
                type: Date,
                default: Date.now(),
              },
            },
          ],
          current_commitment_date: {
            date: {
              type: Date,
            },
            remarks: {
              type: String,
            },
            user_id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
            updatedAt: {
              type: Date,
              default: Date.now(),
            },
          },
        },
      ],
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
          updatedAt: {
            type: Date,
            default: Date.now,
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
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    { timestamps: true }
  );

  scopeSchema.pre("save", function (next) {
    updateStatus(this, "open");
    // updateCommitmentDate(this.items);
    next();
  });

  module.exports = mongoose.model("Scope", scopeSchema);
