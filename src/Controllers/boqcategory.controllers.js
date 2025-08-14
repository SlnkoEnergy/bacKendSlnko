const boqCategory = require("../Modells/boqcategory.model");
const moduleTemplates = require("../Modells/moduletemplate.model");
const MaterialCategory = require("../Modells/materialcategory.model");
const Material = require("../Modells/material.model");
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
const getBoqCategoryByIdAndKey = async (req, res) => {
  try {
    const { _id, keyname } = req.query;

    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(400).json({ message: "Invalid BOQ ID format" });
    }
    if (!keyname || typeof keyname !== 'string' || !keyname.trim()) {
      return res.status(400).json({ message: "Missing or invalid 'keyname'" });
    }

    const result = await boqCategory.aggregate([
      // 1. Match the specified BOQ by _id
      { $match: { _id: new mongoose.Types.ObjectId(_id) } },
      { $unwind: '$headers' },

      // 2. Keep only headers whose `key` equals the requested keyname
      { $match: { 'headers.key': keyname } },

      // 3. Lookup in MaterialCategory matching only by headers.name
      {
        $lookup: {
          from: 'materialcategories',
          localField: 'name',
          foreignField: 'name',
          as: 'matchedMatCat'
        }
      },
      { $unwind: { path: '$matchedMatCat', preserveNullAndEmptyArrays: false } },

      // 4. Lookup in Materials collection using category ID & data.name
      {
        $lookup: {
          from: 'materials',
          let: { catId: '$matchedMatCat._id', hName: '$headers.name' },
          pipeline: [
            { $match: { $expr: { $eq: ['$category', '$$catId'] } } },
            { $unwind: '$data' },
            { $match: { $expr: { $eq: ['$data.name', '$$hName'] } } },
            { $unwind: '$data.values' },
            {
              $project: {
                _id: 0,
                value: '$data.values.input_values'
              }
            }
          ],
          as: 'materialValues'
        }
      },

      // 5. Final projection
      {
        $project: {
          _id: 0,
          header: '$headers',
          materialValues: 1
        }
      }
    ]);

    if (!result.length) {
      return res.status(404).json({
        message: `No BOQ header found for ID '${_id}' with key '${keyname}', or no matching materials`
      });
    }

    const { header, materialValues } = result[0];
    const values = materialValues.map(v => v.value);

    res.json({ success: true, header, data: values });
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
 getBoqCategoryByIdAndKey,
};