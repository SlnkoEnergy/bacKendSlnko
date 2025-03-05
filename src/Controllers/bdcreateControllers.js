const bdmodells= require("../Modells/createBDleadModells");

const createeBDlead = async function (req, res) {
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
        entry_date,
        interest,
        comment,
        submitted_by,
    } = req.body;
    try {
        let createBDlead = new bdmodells({
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
        entry_date,
        interest,
        comment,

        submitted_by,
        });
        await createBDlead.save();
        res.status(200).json({ message: "Data saved successfully",Data :createBDlead});
    } catch (error) {
        res.status(400).json({ error: error });
    }
};

//get all data
const getBDleaddata = async function (req, res) {
    try {
        let getBDlead = await bdmodells.find();
        res.status(200).json({ message: "Data fetched successfully", Data: getBDlead });
    } catch (error) {
        res.status(400).json({ error: error });
    }
};


module.exports = { createeBDlead,getBDleaddata };