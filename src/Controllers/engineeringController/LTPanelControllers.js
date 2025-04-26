const ltPnaelModells =require("../../Modells/EngineeringModells/LTPanelsModells");

// Add LT Panel data
const addLTPanel = async (req, res) => {
    try {
        const { make, type, voltage, status, outgoing, incoming, submitted_by } = req.body;

        // Create a new LT Panel entry
        const newLTPanel = new ltPnaelModells({
            make, type, voltage, status, outgoing, incoming, submitted_by
        });

        // Save to database
        await newLTPanel.save();
        res.status(201).json({ message: "LT Panel added successfully", newLTPanel });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" +error});
    }
};
// Get all LT Panel data

const getLTPanel = async (req, res) => {
    try {
        const ltPanel = await ltPnaelModells.find();
        res.json(ltPanel);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = { addLTPanel, getLTPanel };