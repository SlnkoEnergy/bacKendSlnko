const scopeModel = require("../Modells/scope.model");
const MaterialCategory = require("../Modells/materialcategory.model");
const projectModells = require("../Modells/projectModells");
const { default: axios } = require("axios");

const createScope = async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ message: "Data is required" });
    }
    const scope = new scopeModel({
      ...data,
      createdBy: req.user.userId,
    });
    await scope.save();
    return res
      .status(201)
      .json({ message: "Scope created successfully", data: scope });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const getScopeById = async (req, res) => {
  try {
    const { project_id } = req.query;

    const scope = await scopeModel
      .findOne({ project_id })
      .populate("current_status.user_id", "_id name")
      .populate("status_history.user_id", "_id name")
      .populate("createdBy", "_id name");

    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }

    const uniqueItems = [];
    const categorySet = new Set();

    for (const item of scope.items) {
      if (!item.category || item.category.trim() === "") {
        continue;
      }
      if (!categorySet.has(item.category)) {
        categorySet.add(item.category);
        uniqueItems.push(item);
      }
    }

    return res.status(200).json({
      message: "Scope and material details retrieved successfully",
      data: {
        ...scope.toObject(),
        items: uniqueItems,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};



const getAllScopes = async (req, res) => {
  try {
    const scopes = await scopeModel.find()
      .populate("current_status.user_id", "name")
      .populate("status_history.user_id", "name");

    return res.status(200).json({
      message: "Materials with scope info retrieved successfully",
      data: scopes
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};


const updateScope = async (req, res) => {
  try {
    const { project_id } = req.query;

    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "No update data provided" });
    }

    const scope = await scopeModel.findOne({ project_id });
    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }

    if (Array.isArray(req.body.items)) {
      req.body.items.forEach((updatedItem) => {
        if (updatedItem.category) {
          scope.items.forEach((item) => {
            if (item.category === updatedItem.category) {
              if (updatedItem.scope) {
                item.scope = updatedItem.scope;
              }
              if (updatedItem.quantity !== undefined) {
                item.quantity = updatedItem.quantity;
              }
              if (updatedItem.uom !== undefined) {
                item.uom = updatedItem.uom;
              }
            }
          });
        }
      });
    }

    scope.status_history.push({
      status: "closed",
      remarks: " ",
      user_id: req.user.userId,
    });

    await scope.save();

    return res.status(200).json({
      message: "Scope updated successfully",
      data: scope,
    });
  } catch (error) {
    console.error("Error updating scope:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const deleteScope = async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    const scope = await scopeModel.findOneAndDelete({ project_id });
    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }
    return res.status(200).json({ message: "Scope deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const updateScopeStatus = async (req, res) => {
  try {
    const { project_id } = req.params;
    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    const scope = await scopeModel.findOne({ project_id });
    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }
    const { status, remarks } = req.body;
    if (!status || !remarks) {
      return res
        .status(400)
        .json({ message: "Status and remarks are required" });
    }
    await scope.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });
    await scope.save();
    return res
      .status(200)
      .json({ message: "Scope status updated successfully", data: scope });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const getScopePdf = async (req, res) => {
  try {
    const { project_id } = req.query;

    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }

    const project = await projectModells
      .findById(project_id)

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const scopeData = await scopeModel
      .find({ project_id })
      .populate("current_status.user_id", "_id name")
      .populate("status_history.user_id", "_id name")
      .populate("createdBy", "_id name")
      .lean();

    if (!scopeData || !scopeData.length) {
      return res.status(404).json({ message: "No scope data found for this project" });
    }

    const processed = scopeData.map((scope) => ({
      ...scope,
      project: project, 
      totalItems: scope.items?.length || 0,
      items: (scope.items || []).map((item) => ({
        category: item.category,
        type: item.type,
        scope: item.scope,
        quantity: item.quantity,
        uom: item.uom,
      })),
    }));

    const apiUrl = `${process.env.PDF_PORT}/scopePdf/scope-pdf`;

    const axiosResponse = await axios({
      method: "post",
      url: apiUrl,
      data: {
        scopes: processed
      },
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.set({
      "Content-Type": axiosResponse.headers["content-type"],
      "Content-Disposition":
        axiosResponse.headers["content-disposition"] ||
        `attachment; filename="Scope_${project?.code || project?._id}.pdf"`,
    });

    axiosResponse.data.pipe(res);
  } catch (error) {
    console.error("Error generating scope PDF:", error);
    res.status(500).json({ message: "Error generating scope PDF", error: error.message });
  }
};



module.exports = {
  createScope,
  getScopeById,
  getAllScopes,
  updateScope,
  deleteScope,
  updateScopeStatus,
  getScopePdf
};
