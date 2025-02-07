const commScmRateModells = require("../Modells/commScmRateModells");

//add commScmRate
const addCommScmRate = async function (req, res) {
  const {
    spv_modules,
    solar_inverter,
    module_mounting_structure,
    mounting_hardware,
    dc_cable,
    ac_cable_inverter_accb,
    ac_cable_accb_transformer,
    ac_ht_cable,
    earthing_station,
    earthing_strips,
    earthing_strip,
    lightening_arrestor,
    datalogger,
    auxilary_transformer,
    ups_ldb,
    balance_of_system,
    transportation,
    transmission_line,
    ct_pt,
    abt_meter,
    vcb_kiosk,
    slnko_charges,
    installation_commissioing, 
    submitted_by,
  } = req.body;
  try {
    let commScmRate = new commScmRateModells({
      spv_modules,
      solar_inverter,
      module_mounting_structure,
      mounting_hardware,
      dc_cable,
      ac_cable_inverter_accb,
      ac_cable_accb_transformer,
      ac_ht_cable,
      earthing_station,
      earthing_strips,
      earthing_strip,
      lightening_arrestor,
      datalogger,
      auxilary_transformer,
      ups_ldb,
      balance_of_system,
      transportation,
      transmission_line,
      ct_pt,
      abt_meter,
      vcb_kiosk,
      slnko_charges,
      installation_commissioing,
      submitted_by,
    });
    await commScmRate.save();
    res
      .status(200)
      .json({
        msg: "Comm Scm Rate added successfully",
        commScmRate: commScmRate,
      });
  } catch (error) {
    return res.status(400).json({ msg: "Server error", error: error.message });
  }
};

//get all commScmRate
const getCommScmRate = async function (req, res) {
  try {
    const commScmRate = await commScmRateModells.find();
    return res.status(200).json(commScmRate);
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

//edit commScmRate
const editCommScmRate = async function (req, res) {
  try {
    let { _id } = req.params;
    let updateData = req.body;
    let data = await commScmRateModells.findByIdAndUpdate(_id, updateData, {
      new: true,
    });
    if (!data) {
      return res.status(404).json({ msg: "user not found" });
    }

    return res
      .status(200)
      .json({ msg: "Comm Scm Rate updated successfully", data: data });
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

module.exports = { addCommScmRate, getCommScmRate, editCommScmRate };
