const materialCategory = require("../Modells/materialcategory.model");
const scopeModel = require("../Modells/scope.model");
const Counter = require("../Modells/materialcategorycounter.model");
const mongoose = require("mongoose");

const addMaterialCategory = async (req, res) => {
  try {
    const { name, description, fields, type } = req.body;
    const userId = req.user?.userId;

    if (!name || !description || !type) {
      return res.status(404).json({
        message: "Please fill all the required fields",
      });
    }

    const counter = await Counter.findOneAndUpdate(
      { name: "material_category_code" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    const categoryCode = `CAT${String(counter.seq).padStart(4, "0")}`;

    const newMaterialCategory = new materialCategory({
      name,
      description,
      type,
      category_code: categoryCode,
      fields,
      createdBy: userId,
      updatedBy: userId,
    });

    await newMaterialCategory.save();

    res.status(201).json({
      message: "Material Category added successfully",
      data: newMaterialCategory,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error adding Material Category",
      error: error.message,
    });
  }
};

// Get all material categories
const getAllMaterialCategories = async (req, res) => {
  try {
    const materialCategories = await materialCategory
      .find()
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");
    res.status(200).json({
      message: "Material Categories retrieved successfully",
      data: materialCategories,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error retrieving Material Categories",
      error: error.message,
    });
  }
};

const namesearchOfMaterialCategories = async (req, res) => {
  try {
    const {
      search = "",
      page = 1,
      limit = 7,
      pr = "false",
      project_id,
    } = req.query;

    const prFlag = String(pr).toLowerCase() === "true";
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 7, 1);
    const skip = (pageNum - 1) * pageSize;

    // Base filter from search
    const baseFilter = search
      ? { name: { $regex: search.trim().replace(/\s+/g, ".*"), $options: "i" } }
      : {};

    let scopeIds = null;

    // If pr=true and project_id is valid, try to narrow by scope
    if (prFlag && project_id && mongoose.Types.ObjectId.isValid(project_id)) {
      const scopeDoc = await scopeModel
        .findOne(
          { project_id: new mongoose.Types.ObjectId(project_id) },
          { items: 1, _id: 0 }
        )
        .lean();

      // Collect only slnko item_ids
      const ids =
        scopeDoc?.items
          ?.filter((it) => it?.item_id && it.scope === "slnko")
          .map((it) => it.item_id.toString()) || [];

      scopeIds = [...new Set(ids)];

      if (!scopeDoc || scopeIds.length === 0) {
        return res.status(200).json({
          message: "Material categories retrieved successfully",
          data: [],
          pagination: {
            search,
            page: pageNum,
            pageSize,
            total: 0,
            totalPages: 1,
            hasMore: false,
            nextPage: null,
          },
          meta: {
            filteredByProjectScope: false,
            scopeType: "slnko",
            reason: !scopeDoc
              ? "no_scope_for_project"
              : "no_slnko_items_in_scope",
          },
        });
      }
    }

    // Build final filter
    const finalFilter =
      prFlag && project_id
        ? {
            ...baseFilter,
            _id: { $in: scopeIds.map((id) => new mongoose.Types.ObjectId(id)) },
          }
        : baseFilter;

    // Projection / sort
    const projection = { _id: 1, name: 1, description: 1 };
    const sort = { name: 1, _id: 1 };

    // Query + count
    const [items, total] = await Promise.all([
      materialCategory
        .find(finalFilter, projection)
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      materialCategory.countDocuments(finalFilter),
    ]);

    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const hasMore = pageNum < totalPages;

    return res.status(200).json({
      message: "Material categories retrieved successfully",
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
      meta: {
        filteredByProjectScope: Boolean(prFlag && project_id),
        scopeType: prFlag ? "slnko" : null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error searching material categories",
      error: error.message,
    });
  }
};

const getAllMaterialCategoriesDropdown = async (req, res) => {
  try {
    const { project_id } = req.query;

    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }

    const materialCategories = await materialCategory.find({}, "_id name");

    const scopeData = await scopeModel.findOne({ project_id });

    if (!scopeData) {
      return res
        .status(404)
        .json({ message: "Scope not found for given project" });
    }

    const slnkoItemIds = new Set(
      scopeData.items
        .filter((item) => item.scope?.toLowerCase() === "slnko")
        .map((item) => item.item_id?.toString())
    );

    const filteredCategories = materialCategories.filter((cat) =>
      slnkoItemIds.has(cat._id.toString())
    );

    res.status(200).json({
      message: "Material Categories retrieved successfully",
      data: materialCategories,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error retrieving Material Categories",
      error: error.message,
    });
  }
};

// Get Material Categories By Id
const getMaterialCategoryById = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ message: "id is required" });
    }

    let query = {};
    if (id) query._id = id;

    const materialCategories = await materialCategory.findOne(query);

    if (!materialCategories) {
      return res.status(404).json({ message: "Data not found" });
    }

    res.status(200).json({
      message: "Data fetched Successfully",
      data: materialCategories,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update material category
const updateMaterialCategory = async (req, res) => {
  try {
    const { name, description, fields } = req.body;
    const id = req.params._id;

    const updatedMaterialCategory = await materialCategory.findByIdAndUpdate(
      id,
      { name, description, fields, updatedBy: id },
      { new: true }
    );

    if (!updatedMaterialCategory) {
      return res.status(404).json({ message: "Material Category not found" });
    }

    res.status(200).json({
      message: "Material Category updated successfully",
      data: updatedMaterialCategory,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating Material Category",
      error: error.message,
    });
  }
};
// Delete material category
const deleteMaterialCategory = async (req, res) => {
  try {
    const id = req.params._id;
    const deletedMaterialCategory =
      await materialCategory.findByIdAndDelete(id);
    if (!deletedMaterialCategory) {
      return res.status(404).json({ message: "Material Category not found" });
    }
    res.status(200).json({
      message: "Material Category deleted successfully",
      data: deletedMaterialCategory,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting Material Category",
      error: error.message,
    });
  }
};



module.exports = {
  addMaterialCategory,
  getAllMaterialCategories,
  getMaterialCategoryById,
  updateMaterialCategory,
  deleteMaterialCategory,
  getAllMaterialCategoriesDropdown,
  namesearchOfMaterialCategories,
};
