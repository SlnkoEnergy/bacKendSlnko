const materialCategory = require("../Modells/materialcategory.model");
const scopeModel = require("../Modells/scope.model");
const Counter = require("../Modells/materialcategorycounter.model");
const mongoose = require("mongoose");

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
        category: newMaterialCategory.category_code,       
        scope: "client",                                
        quantity: "",
        uom: "",
        order:
          typeof newMaterialCategory.order === "number"
            ? newMaterialCategory.order
            : 0,
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

    // 🔒 Hard-enforce active only
    const baseFilter = {
      status: "active",
      ...(search
        ? {
            name: {
              $regex: search.trim().replace(/\s+/g, ".*"),
              $options: "i",
            },
          }
        : {}),
    };

    let scopeIds = null;

    if (prFlag && project_id && mongoose.Types.ObjectId.isValid(project_id)) {
      const scopeDoc = await scopeModel
        .findOne(
          { project_id: new mongoose.Types.ObjectId(project_id) },
          { items: 1, _id: 0 }
        )
        .lean();

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
            filteredByProjectScope: true,
            scopeType: "slnko",
            reason: !scopeDoc
              ? "no_scope_for_project"
              : "no_slnko_items_in_scope",
          },
        });
      }
    }

    const finalFilter =
      prFlag && project_id
        ? {
            ...baseFilter,
            _id: { $in: scopeIds.map((id) => new mongoose.Types.ObjectId(id)) },
          }
        : baseFilter;

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
    const id = req.params._id;
    const userId = req.user?.userId;

    if (!id) {
      return res
        .status(400)
        .json({ message: "Material Category ID is required" });
    }

    const updatedMaterialCategory = await materialCategory.findByIdAndUpdate(
      id,
      { name, description, status, type, fields, updatedBy: userId },
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
