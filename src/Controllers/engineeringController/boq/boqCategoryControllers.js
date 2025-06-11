const boqCategory = require("../../../Modells/EngineeringModells/boq/boqCategory");
const moduleTemplates = require("../../../Modells/EngineeringModells/engineeringModules/moduleTemplate");
const MaterialCategory = require("../../../Modells/EngineeringModells/materials/materialCategoryModells");
const Material = require("../../../Modells/EngineeringModells/materials/materialModells");
const mongoose = require("mongoose");

const createBoqCategory = async (req, res) => {
  try {
    const { module_template } = req.query;

    const boqData = new boqCategory(req.body);
    await boqData.save();

    if (module_template) {
      await moduleTemplates.findByIdAndUpdate(
        module_template,
        {
          $addToSet: { "boq.template_category": boqData._id }, 
        },
        { new: true }
      );
    }

    res.status(201).json({
      message: "Boq Category created successfully",
      data: boqData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


const getBoqCategoryById = async (req, res) => {
  try {
    const BoqData = await boqCategory.findById(req.params._id);
    if (!BoqData) {
      return res.status(404).json({
        message: "Boq Category not found",
      });
    }
    res.status(200).json({
      message: "Boq Category Retrieved Successfully",
      data: BoqData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getBoqCategory = async(req, res)=>{
  try {
    const BoqData = await boqCategory.find();
    if(!BoqData || BoqData.length === 0) {
      return res.status(404).json({
        message: "No Boq Category found",
      });
    }
    res.status(200).json({
      message: "Boq Category Retrieved Successfully",
      data: BoqData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    })
  }
}

const updateBoqCategory = async (req, res) => {
  try {
    const data = await boqCategory.findByIdAndUpdate(
      req.params._id,
      req.body,
      { new: true}
    )

    if (!data) {
      return res.status(404).json({
        message: "Boq Category not found",
      });
    }
    res.status(200).json({
      message: "Boq Category updated successfully",
      data: data,
    });

  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getBoqCategoryByNameandID = async (req, res) => {
  try {
    const { _id } = req.query;

    // 1. Validate _id
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(400).json({ message: "Invalid BOQ ID format" });
    }

    // 2. Fetch the BOQ by _id
    const boq = await boqCategory.findById(_id);
    if (!boq) {
      return res.status(404).json({ message: "BOQ not found" });
    }

    // 3. Extract name from headers key (which is an array)
    const headers = boq.headers;
    if (!Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({ message: "No headers found in BOQ" });
    }

    // Take first header with valid name
    const headerWithName = headers.find(h => h.name && typeof h.name === 'string');
    if (!headerWithName) {
      return res.status(400).json({ message: "No valid 'name' found in headers" });
    }

    const name = headerWithName.name;
    

    // 4. Find material category by name
    const category = await MaterialCategory.find({ name });
    if (!category) {
      return res.status(404).json({ message: "Material category not found for name: " + name });
    }

    // 5. Aggregate material values matching category and name
    const matchedMaterials = await Material.aggregate([
      {
        $match: {
          category: category._id,
        },
      },
      {
        $unwind: "$data",
      },
      {
        $match: {
          "data.name": name,
          "data.value": { $exists: true, $ne: null },
        },
      },
      {
        $project: {
          _id: 0,
          value: "$data.value",
        },
      },
    ]);

    const values = matchedMaterials.map(m => m.value);

    res.status(200).json({ success: true, data: values });

  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};




module.exports = {
  createBoqCategory,
  getBoqCategoryById,
  getBoqCategory,
  updateBoqCategory,
 getBoqCategoryByNameandID,
};