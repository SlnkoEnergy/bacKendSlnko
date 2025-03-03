const createBdleadModells = require('../Modells/createBDleadModells');

const createBDlead = async function (req, res) {
    const {
        id,
        c_name,
        email,
        mobile,
        alt_mobile,
        company,
        village,
        district,
        state,
        scheme,
        capacity,
        distance,
        tarrif,
        land,
        entry_dtae,
        submitted_by,
    } = req.body;
    try {
        let createBDlead = new createBdleadModells({
            id,
            c_name,
            email,
            mobile,
            alt_mobile,
            company,
            village,
            district,
            state,
            scheme,
            capacity,
            distance,
            tarrif,
            land,
            entry_dtae,
            submitted_by,
        });
        await createBDlead.save();
        res.status(200).json({ message: "Data saved successfully",Data :createBDlead});
    } catch (error) {
        res.status(400).json({ error: error });
    }
};
//get all BDlead

const getBDlead = async function (req, res) {
    try {
        const data = await createBdleadModells.find();
        res.status(200).json({ data: data });
    } catch (error) {
        res.status(500).json({ error: error });
    }
};
//edit BDlead
const editBDlead = async function (req, res) {
    const { _id } = req.params;
    const updateData = req.body;
    try {
        const data = await createBdleadModells.findByIdAndUpdate(_id, updateData, { new: true });
        if (!data) {
            return res.status(404).json({ msg: "Data not found" });
        }
        res.status(200).json({msg:"BD Lead Updated Sucessfully",  data: data });
    } catch (error) {
        res.status(400).json({ error: error });
    }
};
//delete BDlead

const deleteBDlead = async function (req, res) {
    const { _id } = req.params;
    try {
        const data = await createBdleadModells.findByIdAndDelete(_id);
        if (!data) {
            return res.status(404).json({ msg: "Data not found" });
        }
        res.status(200).json({ msg: "Data deleted successfully",Data:data });
    } catch (error) {
        res.status(400).json({ error: error });
    }
};

module.exports = { createBDlead, getBDlead, editBDlead, deleteBDlead }; 