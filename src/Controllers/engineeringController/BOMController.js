const bomModells =require("../../Modells/EngineeringModells/BOMModells");


//add BOM
const addBOM = async function (req, res) {
    const { category, make, rating, specification, quantity, uom, submitted_by } = req.body;
    try {
        let bom = new bomModells({
            category,
            make,
            rating,
            specification,
            quantity,
            uom,
            submitted_by
        });
        await bom.save();
        res.status(200).json({ msg: "BOM added successfully", bom: bom });
    } catch (error) {
        return res.status(400).json({ msg: "Server error", error: error.message });
    }
};
//get all BOM
const getBOM = async function (req, res) {
    try {
        const bom = await bomModells.find();
        return res.status(200).json({msg:"bom data",data:bom});
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
};

module.exports = {
    addBOM,
    getBOM,
};