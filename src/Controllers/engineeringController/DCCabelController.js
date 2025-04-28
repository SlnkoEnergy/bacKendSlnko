const dccabelModells =require("../../Modells/EngineeringModells/DCCabelModells");

const add_dc_cabel = async (req, res) => {
    try {
        const { make, size, rated_ac_voltage, nominal_dc_voltage, core, status, submitted_by } = req.body;
        const newDCCabel = new dccabelModells({
            make,
            size,
            rated_ac_voltage,
            nominal_dc_voltage,
            core,
            status,
            submitted_by
        });
        await newDCCabel.save();
        res.status(201).json({ message: "DC Cabel added successfully", data: newDCCabel });
    } catch (error) {
        res.status(500).json({ message: "Error adding DC Cabel", error: error.message });
    }
};

const get_dc_cabels = async (req, res) => {
    try {
        const dcCabels = await dccabelModells.find();
        res.status(200).json({ message: "DC Cabels retrieved successfully", data: dcCabels });
    } catch (error) {
        res.status(500).json({ message: "Error retrieving DC Cabels", error: error.message });
    }
}

module.exports = {
    add_dc_cabel,
    get_dc_cabels

};