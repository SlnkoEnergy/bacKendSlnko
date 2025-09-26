const { default: mongoose } = require("mongoose");
const Activity = require("../models/activities.model");
const ProjectActivity = require("../models/projectactivities.model");

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
    };
    const sort = { name: 1, _id: 1 };

    const [items, total] = await Promise.all([
      Activity.find(filter, projection)
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
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

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid :id" });
    }
    if (!dependencies.length) {
      return res.status(400).json({ message: "No dependencies provided" });
    }

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

    const actor =
      req.user?.userId && mongoose.isValidObjectId(req.user.userId)
        ? new mongoose.Types.ObjectId(req.user.userId)
        : undefined;

    if (isGlobal) {
      const activity = await Activity.findById(id);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      let added = 0;
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
          added++;
        }
      }

      if (added === 0) {
        await activity.save();
        return res.status(200).json({
          message: "No new dependencies to add (duplicates ignored)",
          activity,
        });
      }

      await activity.save();
      return res.status(200).json({
        message: `Dependencies added successfully (${added})`,
        activity,
      });
    } else {
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
    }
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
