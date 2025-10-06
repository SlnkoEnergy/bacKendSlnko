const materialCategory = require("../models/materialcategory.model");
const scopeModel = require("../models/scope.model");
const Counter = require("../models/materialcategorycounter.model");
const mongoose = require("mongoose");
const materialcategoryModel = require("../models/materialcategory.model");
const materialModel = require("../models/material.model");

const addMaterialCategory = async (req, res) => {
  try {
    const { name, description, fields, type, status, order } = req.body;
    const userId = req.user?.userId;

    if (!name || !description || !type) {
      return res.status(404).json({
        message: "Please fill all the required fields",
      });
    }

    // Generate sequential category code
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
      status,
      order,
      createdBy: userId,
      updatedBy: userId,
    });

    await newMaterialCategory.save();

    let scopesUpdated = 0;

    if (String(newMaterialCategory.status).toLowerCase() === "active") {
      const newScopeItem = {
        item_id: new mongoose.Types.ObjectId(newMaterialCategory._id),
        name: newMaterialCategory.name,
        type: newMaterialCategory.type,
        pr_status: false,
      };

      const result = await scopeModel.updateMany(
        { "items.item_id": { $ne: newMaterialCategory._id } },
        { $push: { items: newScopeItem } }
      );

      scopesUpdated = result?.modifiedCount || 0;
    }

    return res.status(201).json({
      message: "Material Category added successfully",
      data: newMaterialCategory,
      scopesUpdated,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error adding Material Category",
      error: error.message,
    });
  }
};

const getAllMaterialCategories = async (req, res) => {
  try {
    const page =
      parseInt(req.query.page, 10) > 0 ? parseInt(req.query.page, 10) : 1;
    const pageSizeParam =
      req.query.pageSize != null ? req.query.pageSize : req.query.limit;
    const pageSize =
      parseInt(pageSizeParam, 10) > 0 ? parseInt(pageSizeParam, 10) : 10;
    const skip = (page - 1) * pageSize;

    // filters
    const search = (req.query.search || "").trim();
    const type = (req.query.type || "").trim().toLowerCase();
    const statusQ = (req.query.status || "").trim().toLowerCase();

    // sort
    const sortBy = (req.query.sortBy || "createdAt").trim();
    const sortOrder =
      (req.query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const query = {};

    if (type === "inactive" && !statusQ) {
      query.status = "inactive";
    } else {
      if (["supply", "execution"].includes(type)) {
        query.type = type;
      }
      if (["active", "inactive"].includes(statusQ)) {
        query.status = statusQ;
      }
    }

    if (search) {
      const re = new RegExp(search, "i");
      query.$or = [
        { name: { $regex: re } },
        { category_code: { $regex: re } },
        { description: { $regex: re } },
      ];
    }

    // fetch
    const [items, total] = await Promise.all([
      materialCategory
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .lean(),
      materialCategory.countDocuments(query),
    ]);

    res.status(200).json({
      message: "Material Categories retrieved successfully",
      meta: {
        total,
        page,
        pageSize,
        count: items.length,
      },
      data: items,
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
    const { search = "", page = 1, limit = 7, pr = "false", project_id } = req.query;

    const prFlag = String(pr).toLowerCase() === "true";
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 7, 1);
    const skip = (pageNum - 1) * pageSize;

    const toIdStrings = (arr) => {
      if (!Array.isArray(arr)) return [];
      const out = [];
      for (const v of arr) {
        if (!v) continue;
        if (typeof v === "string") out.push(v);
        else if (v._id && typeof v._id === "string") out.push(v._id);
        else if (v._id && v._id.toString) out.push(v._id.toString());
        else if (v.model_id && typeof v.model_id === "string") out.push(v.model_id);
        else if (v.model_id && v.model_id._id) {
          out.push(
            typeof v.model_id._id === "string"
              ? v.model_id._id
              : v.model_id._id.toString?.()
          );
        }
      }
      return out.filter(Boolean);
    };

    const toObjectIds = (ids) =>
      ids
        .filter((s) => mongoose.Types.ObjectId.isValid(s))
        .map((s) => new mongoose.Types.ObjectId(s));

    let meta = { filteredByProjectScope: false, scopeType: null };

    let finalFilter = { status: "active" };

    if (prFlag && project_id && mongoose.Types.ObjectId.isValid(project_id)) {
      const scopeDoc = await scopeModel
        .findOne(
          { project_id: new mongoose.Types.ObjectId(project_id) },
          { items: 1, _id: 0 }
        )
        .lean();

      const scopeStrings = toIdStrings(
        (scopeDoc?.items || []).filter((it) => it?.scope === "slnko")
      );
      const scopeObjectIds = toObjectIds(scopeStrings);

      if (scopeObjectIds.length > 0) {
        finalFilter._id = { $in: scopeObjectIds };
        meta.filteredByProjectScope = true;
        meta.scopeType = "slnko";
      }
    }

    // ---- Add search filter if provided ----
    if (search && search.trim().length > 0) {
      finalFilter.name = {
        $regex: search.trim().replace(/\s+/g, ".*"),
        $options: "i",
      };
    }

    const projection = { _id: 1, name: 1, description: 1 };
    const sort = { name: 1, _id: 1 };

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
      message: "Active material categories retrieved successfully",
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
      meta,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error searching active material categories",
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
    if (!mongoose.Types.ObjectId.isValid(project_id)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    const scopeData = await scopeModel
      .findOne(
        { project_id: new mongoose.Types.ObjectId(project_id) },
        { items: 1 }
      )
      .lean();

    if (!scopeData) {
      return res
        .status(404)
        .json({ message: "Scope not found for given project" });
    }

    const slnkoItemIds = [
      ...new Set(
        (scopeData.items || [])
          .filter(
            (item) => item?.scope?.toLowerCase() === "slnko" && item?.item_id
          )
          .map((item) => item.item_id.toString())
      ),
    ];

    if (slnkoItemIds.length === 0) {
      return res.status(200).json({
        message: "Material Categories retrieved successfully",
        data: [],
        meta: {
          filteredByProjectScope: true,
          scopeType: "slnko",
          reason: "no_slnko_items_in_scope",
        },
      });
    }

    // 🔒 Hard-enforce active only
    const query = {
      _id: { $in: slnkoItemIds.map((id) => new mongoose.Types.ObjectId(id)) },
      status: "active",
    };

    const categories = await materialCategory
      .find(query, "_id name")
      .sort({ name: 1, _id: 1 })
      .lean();

    return res.status(200).json({
      message: "Material Categories retrieved successfully",
      data: categories,
      meta: { filteredByProjectScope: true, scopeType: "slnko" },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error retrieving Material Categories",
      error: error.message,
    });
  }
};

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

const updateMaterialCategory = async (req, res) => {
  try {
    const { name, description, fields, type, status } = req.body;
    const id = req.params._id || req.params.id;
    const userId = req.user?.userId;

    if (!id) {
      return res.status(400).json({ message: "Material Category ID is required" });
    }

    const updatedMaterialCategory = await materialCategory.findByIdAndUpdate(
      id,
      { name, description, status, type, fields, updatedBy: userId },
      { new: true }
    );

    if (!updatedMaterialCategory) {
      return res.status(404).json({ message: "Material Category not found" });
    }

    let scopesUpdated = 0;

    if (String(updatedMaterialCategory.status).toLowerCase() === "active") {
      const newScopeItem = {
        item_id: new mongoose.Types.ObjectId(updatedMaterialCategory._id),
        name: updatedMaterialCategory.name,
        type: updatedMaterialCategory.type,
        pr_status: false,
      };

      const result = await scopeModel.updateMany(
        { "items.item_id": { $ne: updatedMaterialCategory._id } },
        { $push: { items: newScopeItem } }
      );

      scopesUpdated = result?.modifiedCount || 0;
    }

    return res.status(200).json({
      message: "Material Category updated successfully",
      data: updatedMaterialCategory,
      scopesUpdated,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error updating Material Category",
      error: error.message,
    });
  }
};

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

const searchNameAllCategory = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 7 } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 7, 1);
    const skip = (pageNum - 1) * pageSize;

    const query = {
      status: "active",
      ...(search && { name: { $regex: search.trim(), $options: "i" } }),
    };

    const sort = { name: 1, _id: 1 };

    const [items, total] = await Promise.all([
      materialcategoryModel
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      materialcategoryModel.countDocuments(query),
    ]);

    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const hasMore = pageNum < totalPages;

    return res.status(200).json({
      message: "Active material categories retrieved successfully",
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
      message: "Error searching material categories",
      error: error.message,
    });
  }
};

const searchNameAllProduct = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 7, categoryId = "" } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 7, 1);
    const skip = (pageNum - 1) * pageSize;
    const term = String(search || "").trim();
    const escapeRegex = (s = "") =>
      s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = term ? new RegExp(escapeRegex(term), "i") : null;

    // Build query
    const query = {};
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
      query.category = new mongoose.Types.ObjectId(categoryId);
    }
    if (rx) {
      query.$or = [
        { name: rx },     // if you store a top-level "name"
        { sku_code: rx }, // if you store "sku_code"
        // If your product's display name is in data[]:
        // { data: { $elemMatch: { name: "Product Name", "values.input_values": rx } } },
      ];
    }

    const sort = { name: 1, _id: 1 };

    const [items, total] = await Promise.all([
      materialModel.find(query).sort(sort).skip(skip).limit(pageSize).lean(),
      materialModel.countDocuments(query),
    ]);

    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const hasMore = pageNum < totalPages;

    return res.status(200).json({
      message: "Products retrieved successfully",
      data: items,
      pagination: {
        search: term,
        categoryId: categoryId || undefined,
        page: pageNum,
        pageSize,
        total,
        totalPages,
        hasMore,
        nextPage: hasMore ? pageNum + 1 : null,
      },
    });
  } catch (error) {
    console.error("searchNameAllProduct error:", error);
    return res.status(500).json({
      message: "Error searching products",
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
  searchNameAllCategory,
  searchNameAllProduct
};
