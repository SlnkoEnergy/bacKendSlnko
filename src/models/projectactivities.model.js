// models/projectActivities.model.js
const mongoose = require("mongoose");
const updateStatus = require("../utils/updatestatus.utils");

const StatusEnum = ["not started", "in progress", "completed"];
const LinkType = ["FS", "SS", "FF", "SF"];

function recomputeAssignedEngineersFlat(doc) {
  const set = new Set();
  const acts = Array.isArray(doc.activities) ? doc.activities : [];
  for (const a of acts) {
    const arr = Array.isArray(a.assigned_to) ? a.assigned_to : [];
    for (const uid of arr) {
      const s = String(uid);
      if (mongoose.Types.ObjectId.isValid(s)) set.add(s);
    }
  }
  doc.assigned_engineers = Array.from(set).map(
    (s) => new mongoose.Types.ObjectId(s)
  );
}

const projectActivitySchema = new mongoose.Schema(
  {
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: "projectDetail" },
    name: String,
    description: String,

    template_code: { type: String, unique: true, index: true },
    activities: [
      {
        activity_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "activities",
          required: true,
        },
        order: Number,
        planned_start: Date,
        planned_finish: Date,
        actual_start: Date,
        actual_finish: Date,
        duration: Number,
        percent_complete: { type: Number, min: 0, max: 100, default: 0 },
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
        successors: [
          {
            activity_id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "activities",
            },
            type: { type: String, enum: LinkType, default: "FS" },
            lag: { type: Number, default: 0 },
          },
        ],
        current_status: {
          status: { type: String, enum: StatusEnum, default: "not started" },
          updated_at: { type: Date, default: Date.now },
          user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          remarks: String,
        },
        assigned_status: {
          type: String,
          enum: ["Assigned", "Removed", "Partial"],
        },
        assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        assigned_to: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        status_history: [
          {
            status: { type: String, enum: StatusEnum },
            updated_at: { type: Date, default: Date.now },
            user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            remarks: String,
            assigned_status: {
              type: String,
              enum: ["Assigned", "Removed", "Partial"],
            },
            assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            assigned_to: [
              { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            ],
            assigned_added: [
              { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            ],
            assigned_removed: [
              { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            ],
          },
        ],
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
            status_history: [
              {
                status: {
                  type: String,
                  enum: [
                    "approved",
                    "approval_pending",
                    "rejected",
                    "allowed",
                    "not allowed",
                  ],
                },
                remarks: { type: String },
                updatedAt: { type: Date, default: Date.now },
                user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
              },
            ],
            current_status: {
              status: {
                type: String,
                enum: [
                  "approved",
                  "approval_pending",
                  "rejected",
                  "allowed",
                  "not allowed",
                ],
              },
              remarks: { type: String },
              updatedAt: { type: Date, default: Date.now },
              user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            },
          },
        ],
        resources: [
          {
            type: {
              type: String,
              enum: [
                "surveyor",
                "civil engineer",
                "civil i&c",
                "electric engineer",
                "electric i&c",
                "soil testing team",
                "tline engineer",
                "tline subcontractor",
              ],
            },
            number: {
              type: Number,
            },
          },
        ],
      },
    ],

    status: { type: String, enum: ["template", "project"] },
    status_history: [
      {
        status: {
          type: String,
          enum: ["freeze", "unfreeze"],
        },
        remarks: {
          type: String,
        },
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    current_status: {
      status: {
        type: String,
        enum: ["freeze", "unfreeze"],
      },
      remarks: {
        type: String,
      },
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      updatedAt: { type: Date, default: Date.now },
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assigned_engineers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    ],
  },
  { timestamps: true }
);

projectActivitySchema.pre("save", async function (next) {
  try {
    let prevAssignedMap = new Map();
    if (!this.isNew) {
      const prevDoc = await this.constructor
        .findById(this._id)
        .select("activities.activity_id activities.assigned_to")
        .lean();

      if (prevDoc && Array.isArray(prevDoc.activities)) {
        prevDoc.activities.forEach((a) => {
          if (!a || !a.activity_id) return;
          prevAssignedMap.set(
            String(a.activity_id),
            (a.assigned_to || []).map((x) => String(x))
          );
        });
      }
    }

    if (Array.isArray(this.activities)) {
      this.activities.forEach((activity, idx) => {
        updateStatus(activity, "not started");

        if (Array.isArray(activity.dependency)) {
          activity.dependency.forEach((dep) =>
            updateStatus(dep, "not allowed")
          );
        }

        if (
          activity.order === undefined ||
          activity.order === null ||
          Number.isNaN(activity.order)
        ) {
          activity.order = idx;
        }
        if (activity.assigned_status) {
          const currIds = (activity.assigned_to || []).map((x) => String(x));
          const prevIds = this.isNew
            ? []
            : prevAssignedMap.get(String(activity.activity_id)) || [];

          const prevSet = new Set(prevIds);
          const currSet = new Set(currIds);

          const removed = prevIds.filter((id) => !currSet.has(id));
          const added = currIds.filter((id) => !prevSet.has(id));

          const assignmentChanged = added.length > 0 || removed.length > 0;

          if (assignmentChanged) {
            let computed;
            if (currSet.size === 0) computed = "Removed";
            else if (added.length > 0 && removed.length === 0)
              computed = "Assigned";
            else computed = "Partial";

            activity.status_history = activity.status_history || [];
            activity.status_history.push({
              status: activity.current_status?.status || "not started",
              updated_at: new Date(),
              assigned_status: computed,
              assigned_by: activity.assigned_by || undefined,
              assigned_to: activity.assigned_to?.length
                ? activity.assigned_to
                : undefined,
              assigned_added: added.length ? added : undefined,
              assigned_removed: removed.length ? removed : undefined,
            });

            activity.assigned_status = computed;
          } else if (this.isNew) {
            activity.status_history = activity.status_history || [];
            activity.status_history.push({
              status: activity.current_status?.status || "not started",
              updated_at: new Date(),
              assigned_status: activity.assigned_status,
              assigned_by: activity.assigned_by || undefined,
              assigned_to: activity.assigned_to?.length
                ? activity.assigned_to
                : undefined,
              assigned_added: currIds.length ? currIds : undefined,
              assigned_removed: undefined,
            });
          }
        }
      });
    }

    updateStatus(this, "unfreeze");
    recomputeAssignedEngineersFlat(this);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("projectActivities", projectActivitySchema);
