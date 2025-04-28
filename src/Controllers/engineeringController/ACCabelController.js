const acCabelModells = require("../../Modells/EngineeringModells/ACCabelModells");

const addaccabel = async (req, res) => {
    try {
        const { make, size, lt_ht, voltage_rating, type, core, status, submitted_by } = req.body;
        const newACCabel = new acCabelModells({
            make,
            size,
            lt_ht,
            voltage_rating,
            type,
            core,
            status,
            submitted_by
        });
        await newACCabel.save();
        res.status(201).json({ message: "AC Cabel added successfully", data: newACCabel });
    } catch (error) {
        res.status(500).json({ message: "Error adding AC Cabel", error: error.message });
    }
}
const getACCabels = async (req, res) => {
    try {
        const acCabels = await acCabelModells.find();
        res.status(200).json({ message: "AC Cabels retrieved successfully", data: acCabels });
    } catch (error) {
        res.status(500).json({ message: "Error retrieving AC Cabels", error: error.message });
    }
}

module.exports = {
    addaccabel,
    getACCabels 
};