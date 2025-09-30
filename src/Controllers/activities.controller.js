const { default: mongoose } = require("mongoose");
const Activity = require("../models/activities.model");
const ProjectActivity = require("../models/projectactivities.model");

const LINK_TYPES = new Set(["FS", "SS", "FF", "SF"]);

const createActivity = async (req, res) => {
  try {
    const data = req.body;
    const acitvity = new Activity({ ...data, created_by: req.user.userId });
    await acitvity.save();
    res
      .status(201)
      .json({ message: "Activity created successfully", acitvity });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const editActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const activity = await Activity.findByIdAndUpdate(id, data, { new: true });
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    res
      .status(200)
      .json({ message: "Activity updated successfully", activity });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const deleteActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const activity = await Activity.findByIdAndDelete(id);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    res.status(200).json({ message: "Activity deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const namesearchOfActivities = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 7 } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNum - 1) * pageSize;

    const filter = {
      ...(search
        ? {
            name: {
              $regex: search.trim().replace(/\s+/g, ".*"),
              $options: "i",
            },
          }
        : {}),
    };

    const projection = {
      _id: 1,
      name: 1,
      description: 1,
      type: 1,
      dependency: 1,
      predecessors: 1,
    };
    const sort = { name: 1, _id: 1 };

    const [items, total] = await Promise.all([
      Activity.find(filter, projection)
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .populate({
          path: "predecessors.activity_id",
          select: "name",
        })
        .populate({ path: "dependency.model_id", select: "name" }),
      Activity.countDocuments(filter),
    ]);

    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const hasMore = pageNum < totalPages;

    return res.status(200).json({
      message: "Activities retrieved successfully",
      data: items,
      pagination: {
        search,
        page: pageNum,
        pageSize,
        total,
        totalPages,
        hasMore,
        nextPage: hasMore ? pageNum + 1 : null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error searching activities",
      error: error.message,
    });
  }
};

const updateDependency = async (req, res) => {
  try {
    const { id } = req.params;
    const { global, projectId } = req.query;
    const isGlobal = String(global).toLowerCase() === "true";

    const LINK_TYPES =
      typeof globalThis.LINK_TYPES === "object" && globalThis.LINK_TYPES instanceof Set
        ? globalThis.LINK_TYPES
        : new Set(["FS", "SS", "FF"]);

    const dependencies = Array.isArray(req.body.dependencies)
      ? req.body.dependencies
      : req.body.model && req.body.model_id
      ? [
          {
            model: req.body.model,
            model_id: req.body.model_id,
            model_id_name: req.body.model_id_name,
          },
        ]
      : [];

    const predecessors = Array.isArray(req.body.predecessors)
      ? req.body.predecessors
      : req.body.activity_id
      ? [
          {
            activity_id: req.body.activity_id,
            type: req.body.type,
            lag: req.body.lag,
          },
        ]
      : [];

    const hasFormulaUpdate = Object.prototype.hasOwnProperty.call(
      req.body,
      "completion_formula"
    );
    const completion_formula = hasFormulaUpdate
      ? String(req.body.completion_formula ?? "")
      : undefined;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid :id" });
    }

    if (!isGlobal && hasFormulaUpdate) {
      return res.status(400).json({
        message:
          "completion_formula can only be updated in global scope (global=true).",
      });
    }

    // If none of the 3 are provided, nothing to do
    if (!dependencies.length && !predecessors.length && !hasFormulaUpdate) {
      return res.status(400).json({
        message:
          "Nothing to update. Provide dependencies, predecessors, or completion_formula.",
      });
    }

    // Validate dependencies
    for (const d of dependencies) {
      if (!d?.model || !d?.model_id) {
        return res
          .status(400)
          .json({ message: "Each dependency needs { model, model_id }" });
      }
      if (!mongoose.isValidObjectId(d.model_id)) {
        return res
          .status(400)
          .json({ message: `Invalid model_id: ${d.model_id}` });
      }
    }

    // Validate + normalize predecessors
    for (const p of predecessors) {
      if (!p?.activity_id || !mongoose.isValidObjectId(p.activity_id)) {
        return res.status(400).json({
          message: `Invalid predecessor activity_id: ${p?.activity_id}`,
        });
      }
      const t = String(p.type || "FS").toUpperCase();
      p.type = LINK_TYPES.has(t) ? t : "FS";
      const lagNum = Number(p.lag);
      p.lag = Number.isFinite(lagNum) ? lagNum : 0;
    }

    const actor =
      req.user?.userId && mongoose.isValidObjectId(req.user.userId)
        ? new mongoose.Types.ObjectId(req.user.userId)
        : undefined;

    if (isGlobal) {
      const activity = await Activity.findById(id);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      // Dependencies (global master)
      let depsAdded = 0;
      for (const dep of dependencies) {
        const exists = activity.dependency?.some(
          (d) =>
            d.model === dep.model && String(d.model_id) === String(dep.model_id)
        );
        if (!exists) {
          activity.dependency.push({
            model: dep.model,
            model_id: dep.model_id,
            model_id_name: dep.model_id_name,
            updated_by: actor,
            updatedAt: new Date(),
          });
          depsAdded++;
        }
      }

      // Predecessors (global master)
      let predsAdded = 0;
      let predsUpdated = 0;

      if (predecessors.length) {
        if (!Array.isArray(activity.predecessors)) activity.predecessors = [];
        for (const pred of predecessors) {
          const idx = activity.predecessors.findIndex(
            (x) => String(x.activity_id) === String(pred.activity_id)
          );
          if (idx === -1) {
            activity.predecessors.push({
              activity_id: pred.activity_id,
              type: pred.type,
              lag: pred.lag,
            });
            predsAdded++;
          } else {
            const cur = activity.predecessors[idx];
            let changed = false;
            if (cur.type !== pred.type) {
              cur.type = pred.type;
              changed = true;
            }
            if (Number(cur.lag) !== Number(pred.lag)) {
              cur.lag = pred.lag;
              changed = true;
            }
            if (changed) predsUpdated++;
          }
        }
      }

      // NEW: completion_formula (global only)
      let formulaChanged = false;
      if (hasFormulaUpdate) {
        const before = activity.completion_formula ?? "";
        if (before !== completion_formula) {
          activity.completion_formula = completion_formula;
          formulaChanged = true;
        }
      }

      await activity.save();

      const parts = [];
      if (dependencies.length) {
        parts.push(
          depsAdded > 0
            ? `Dependencies added successfully (${depsAdded})`
            : "No new dependencies to add (duplicates ignored)"
        );
      }
      if (predecessors.length) {
        parts.push(
          `Predecessors processed (added: ${predsAdded}, updated: ${predsUpdated})`
        );
      }
      if (hasFormulaUpdate) {
        parts.push(
          formulaChanged
            ? "Completion formula updated"
            : "Completion formula unchanged"
        );
      }

      return res.status(200).json({
        message: parts.join("; "),
        activity,
      });
    }

    // ---- Project scope (embedded activity) ----
    if (predecessors.length) {
      return res.status(400).json({
        message: "Predecessors can only be updated in global scope.",
      });
    }
    if (hasFormulaUpdate) {
      return res.status(400).json({
        message: "completion_formula can only be updated in global scope.",
      });
    }

    const project_id = projectId;
    if (!project_id || !mongoose.isValidObjectId(project_id)) {
      return res.status(400).json({
        message: "projectId (valid ObjectId) is required when global=false",
      });
    }

    const projAct = await ProjectActivity.findOne({ project_id });
    if (!projAct) {
      return res
        .status(404)
        .json({ message: "ProjectActivity not found for given project_id" });
    }

    const idx = (projAct.activities || []).findIndex(
      (a) => String(a.activity_id) === String(id)
    );
    if (idx === -1) {
      return res.status(404).json({
        message:
          "Embedded activity not found in projectActivities.activities for provided :id",
      });
    }

    if (!Array.isArray(projAct.activities[idx].dependency)) {
      projAct.activities[idx].dependency = [];
    }

    let added = 0;
    for (const dep of dependencies) {
      const exists = projAct.activities[idx].dependency.some(
        (d) =>
          d.model === dep.model && String(d.model_id) === String(dep.model_id)
      );
      if (!exists) {
        projAct.activities[idx].dependency.push({
          model: dep.model,
          model_id: dep.model_id,
          model_id_name: dep.model_id_name,
          updated_by: actor,
          updatedAt: new Date(),
        });
        added++;
      }
    }

    await projAct.save();
    return res.status(200).json({
      message:
        added > 0
          ? `Dependencies added successfully (${added})`
          : "No new dependencies to add (duplicates ignored)",
      projectActivity: projAct,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


const deleteDependency = async (req, res) => {
  try {
    const { id, dependencyId } = req.params;
    const { global, projectId } = req.query;
    const isGlobal = String(global).toLowerCase() === "true";

    if (
      !mongoose.isValidObjectId(id) ||
      !mongoose.isValidObjectId(dependencyId)
    ) {
      return res.status(400).json({ message: "Invalid id or dependencyId" });
    }

    if (isGlobal) {
      const activity = await Activity.findById(id);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      const before = activity.dependency.length;
      activity.dependency = activity.dependency.filter(
        (dep) => dep._id.toString() !== dependencyId
      );

      if (activity.dependency.length === before) {
        return res
          .status(404)
          .json({ message: "Dependency not found in activity" });
      }

      await activity.save();
      return res.status(200).json({
        message: "Dependency removed successfully",
        activity,
      });
    } else {
      if (!projectId || !mongoose.isValidObjectId(projectId)) {
        return res.status(400).json({
          message: "projectId is required and must be valid when global=false",
        });
      }

      const projAct = await ProjectActivity.findOne({ project_id: projectId });
      if (!projAct) {
        return res.status(404).json({ message: "ProjectActivity not found" });
      }

      const idx = projAct.activities.findIndex(
        (a) => String(a.activity_id) === String(id)
      );
      if (idx === -1) {
        return res.status(404).json({
          message:
            "Embedded activity not found in projectActivities.activities",
        });
      }

      const act = projAct.activities[idx];
      const before = act.dependency.length;

      act.dependency = act.dependency.filter(
        (dep) => dep._id.toString() !== dependencyId
      );

      if (act.dependency.length === before) {
        return res
          .status(404)
          .json({ message: "Dependency not found in project activity" });
      }

      await projAct.save();
      return res.status(200).json({
        message: "Dependency removed successfully",
        projectActivity: projAct,
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createActivity,
  editActivity,
  deleteActivity,
  namesearchOfActivities,
  updateDependency,
  deleteDependency,
};
