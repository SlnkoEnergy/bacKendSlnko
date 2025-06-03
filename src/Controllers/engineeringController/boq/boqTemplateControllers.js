const boqTemplate = require("../../../Modells/EngineeringModells/boq/boqTemplate");

const createBoqTemplate = async(req, res) => {
    try {
        const BoqTemplate = new boqTemplate(req.body);
        await BoqTemplate.save();
        res.status(201).json({ message: "Boq Template created successfully", data: BoqTemplate });

    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}

const getBoqTemplateById = async(req, res) => {
    try {
        const BoqTemplate = await boqTemplate.findById(req.params._id).populate('boq_category');
        if (!BoqTemplate) {
            return res.status(404).json({ message: "Boq Template not found" });
        }
        res.status(200).json({ message: "Boq Template retrieved successfully", data: BoqTemplate });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}

const getBoqTemplate = async(req, res)=>{
    try {
        const boqTemplates = await boqTemplate.find().populate('boq_category');
        if (!boqTemplates || boqTemplates.length === 0) {
            return res.status(404).json({ message: "No Boq Templates found" });
        }
        res.status(200).json({ message: "Boq Templates retrieved successfully", data: boqTemplates });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}

const updateBoqTemplate = async(req, res) => {
    try {
        const data = await boqTemplate.findByIdAndUpdate(req.params._id, req.body, { new: true });
        if (!data) {
            return res.status(404).json({ message: "Boq Template not found" });
        }
        res.status(200).json({ message: "Boq Template updated successfully", data: data });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}


module.exports = {
    createBoqTemplate,
    getBoqTemplateById,
    getBoqTemplate,
    updateBoqTemplate
};