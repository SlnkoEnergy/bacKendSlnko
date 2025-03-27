const transformerModells =require("../../Modells/EngineeringModells/transformerModells");



// Add transformer data
const addTransformer = async (req, res) => {
    
        try {
            const {
                make, size, type, vector_group, cooling_type,
                primary_voltage, secondary_voltage, voltage_ratio,voltage_variation,
                ratedCurrentHV, ratedCurrentLV1, ratedCurrentLV2,
                impedance, winding_material, status, submitted_By, comment
            } = req.body;
    
            // Create a new transformer entry
            const newTransformer = new transformerModells({
                make, size, type, vector_group, cooling_type,
                primary_voltage, secondary_voltage, voltage_ratio,voltage_variation,
                ratedCurrentHV, ratedCurrentLV1, ratedCurrentLV2,
                impedance, winding_material, status, submitted_By, comment
            });
    
            // Save to database
            await newTransformer.save();
            res.status(201).json({ message: "Transformer added successfully", newTransformer });

        
    } catch (error) {
        
        res.status(500).json({ message: "Internal server error" +error});
        
    }
};

// Get all transformer data
const getTransformer = async (req, res) => {
    try {
        const transformer = await transformerModells.find();
        res.json(transformer);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = { addTransformer, getTransformer };