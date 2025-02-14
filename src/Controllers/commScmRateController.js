const commScmRateModells = require("../Modells/commScmRateModells");

//add commScmRate
const addCommScmRate = async function (req, res) {
  const {
    spv_modules_555,
    spv_modules_580,
    spv_modules_550,
    spv_modules_585,
    // offer_id,
    solar_inverter,
    module_mounting_structure_4LX6,
    module_mounting_structure_2PX24,
    module_mounting_structure_2PX12,
    mounting_hardware,
    dc_cable,
    ac_cable_inverter_accb,
    ac_cable_accb_transformer,
    ac_ht_cable_11KV,
    ac_ht_cable_33KV,
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
    // transmission_line_internal,
    // transmission_line_print,
    ct_pt_11kv_MP,
    ct_pt_33kv_MP,
    ct_pt_11kv_Other,
    ct_pt_33kv_Other,
    abt_meter_11kv_MP,
    abt_meter_33kv_MP,
    abt_meter_11kv_Other,
    abt_meter_33kv_Other,
    vcb_kiosk,
    slnko_charges,
    installation_commissioing, 
    submitted_by,
  } = req.body;
  try {
    let commScmRate = new commScmRateModells({
      spv_modules_555,
      spv_modules_580,
      spv_modules_550,
      spv_modules_585,
      // offer_id,
      solar_inverter,
      module_mounting_structure_4LX6,
      module_mounting_structure_2PX24,
      module_mounting_structure_2PX12,
      mounting_hardware,
      dc_cable,
      ac_cable_inverter_accb,
      ac_cable_accb_transformer,
      ac_ht_cable_11KV,
      ac_ht_cable_33KV,
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
      // transmission_line_internal,
      // transmission_line_print,
      ct_pt_11kv_MP,
      ct_pt_33kv_MP,
      ct_pt_11kv_Other,
      ct_pt_33kv_Other,
      abt_meter_11kv_MP,
      abt_meter_33kv_MP,
      abt_meter_11kv_Other,
      abt_meter_33kv_Other,
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
