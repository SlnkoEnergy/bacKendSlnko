const boqCategory = require("../../../Modells/EngineeringModells/boq/boqCategory");

const createBoqCategory = async(req, res) => {
    try {
        const BoqCategory = new boqCategory(req.body);
        await BoqCategory.save();
        res.status(201).json({ message: "Boq Category created successfully", data: BoqCategory });

    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}

const getBoqCategoryById = async(req, res) => {
    try {
        const BoqCategory = await boqCategory.findById(req.params._id).populate('boq_template module_template');
        if (!BoqCategory) {
            return res.status(404).json({ message: "Boq Category not found" });
        }
        res.status(200).json({ message: "Boq Category retrieved successfully", data: BoqCategory });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}

const getBoqCategory = async(req, res)=>{
    try {
        const boqCategories = await boqCategory.find().populate('boq_template module_template');
        if (!boqCategories || boqCategories.length === 0) {
            return res.status(404).json({ message: "No Boq Categories found" });
        }
        res.status(200).json({ message: "Boq Categories retrieved successfully", data: boqCategories });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}

const updateBoqCategory = async(req, res) => {
    try {
        const data = await boqCategory.findByIdAndUpdate(req.params._id, req.body, { new: true });
        if (!data) {
            return res.status(404).json({ message: "Boq Category not found" });
        }
        res.status(200).json({ message: "Boq Category updated successfully", data: data });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}


module.exports = {
    createBoqCategory,
    getBoqCategoryById,
    getBoqCategory,
    updateBoqCategory
};