const bdmodells = require("../Modells/createBDleadModells");
const initialbdleadModells = require("../Modells/initialBdLeadModells");

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
    loi,
    ppa,
    loa,
    other_remarks,
    submitted_by,
    token_money,
    group,
    reffered_by,
    source,
    remark,
  } = req.body;

  const lastid = await bdmodells.findOne().sort({ id: -1 });
  let nextid;
  if (lastid && lastid.id) {
    const lastNumber = parseInt(lastid.id.split("/").pop(), 10);
    const nextNumber = (lastNumber + 1).toString();
    nextid = `BD/lead/${nextNumber}`;
  } else {
    nextid = "BD/lead/1";
  }

  try {
    let createBDlead = new bdmodells({
      id: nextid,
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
      loi,
      ppa,
      loa,
      other_remarks,

      submitted_by,
      token_money,
      group,
      reffered_by,
      source,
      remark,
    });
    await createBDlead.save();
    let initialbdlead = new initialbdleadModells({
      id: nextid,
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
      loi,
      ppa,
      loa,
      other_remarks,
      submitted_by,
      token_money,
      group,
      reffered_by,
      source,
      remark,
    });
    await initialbdlead.save();
    res
      .status(200)
      .json({
        message: "Data saved successfully",
        Data: createBDlead,
        initialbdlead: initialbdlead,
      });
  } catch (error) {
    res.status(400).json({ error: error });
  }
};

//get all data
const getBDleaddata = async function (req, res) {
  try {
    let getBDlead = await bdmodells.find();
    res
      .status(200)
      .json({ message: "Data fetched successfully", Data: getBDlead });
  } catch (error) {
    res.status(400).json({ error: error });
  }
};

//get all initiAL lead
const getallinitialbdlead = async function (req, res) {
  try {
    let initial = await initialbdleadModells.find();
    res.status(200).json({ msg: "All Initial Bd Lead", data: initial });
  } catch (error) {
    res.status(400).json({ error: error });
  }
};

//edit initial bd lead
const editinitialbdlead = async function (req, res) {
  try {
    let { _id } = req.params;

    let data = req.body;
    let editdata = await initialbdleadModells.findByIdAndUpdate(
      {  _id },
      data,
      { new: true }
    );
    res.status(200).json({ msg: "Data updated successfully", data: editdata });
  } catch (error) {
    res.status(400).json({ error: error });
  }
};

module.exports = {
  createeBDlead,
  getBDleaddata,
  getallinitialbdlead,
  editinitialbdlead,
};
