const Activity = require("../models/activities.model");

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
    const dependencies = Array.isArray(req.body.dependencies)
      ? req.body.dependencies
      : [{ model: req.body.model, model_id: req.body.model_id }];

    const activity = await Activity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    dependencies.forEach((dep) => {
      if (dep.model && dep.model_id) {
        activity.dependency.push({
          model: dep.model,
          model_id: dep.model_id,
          updated_by: req.user.userId,
        });
      }
    });

    await activity.save();
    res
      .status(200)
      .json({ message: "Dependencies added successfully", activity });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const deleteDependency = async (req, res) => {
  try {
    const { id, dependencyId } = req.params;
    const activity = await Activity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    activity.dependency.id(dependencyId).remove();
    await activity.save();
    res
      .status(200)
      .json({ message: "Dependency removed successfully", activity });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
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
