const htpanelModells= require("../../Modells/EngineeringModells/HTPanelsModells");


const addHTPanel = async (req, res) => {
    try {
        const { make, vcb_make, pt_ratio, vcb_rating, ct_make, ct_ratio, cabel_size_incoming, pt_make,status,submitted_by } = req.body;
        const newHTPanel = new htpanelModells({
            make,
            vcb_make,
            pt_ratio,
            vcb_rating,
            ct_make,
            ct_ratio,
            cabel_size_incoming,
            pt_make,
            status,
            submitted_by
        });
        await newHTPanel.save();
        res.status(201).json({ message: "HT Panel added successfully", data: newHTPanel });
    } catch (error) {
        res.status(500).json({ message: "Error adding HT Panel", error: error.message });
    }
}
const getHTPanels = async (req, res) => {
    try {
        const htPanels = await htpanelModells.find();
        res.status(200).json({ message: "HT Panels retrieved successfully", data: htPanels });
    } catch (error) {
        res.status(500).json({ message: "Error retrieving HT Panels", error: error.message });
    }
}

module.exports = {
    addHTPanel,
    getHTPanels 
};
