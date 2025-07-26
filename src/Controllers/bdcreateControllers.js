const BDNotes = require("../Modells/bdleads/notes");
const bdmodells = require("../Modells/createBDleadModells");
const initialbdleadModells = require("../Modells/initialBdLeadModells");
const userModells = require("../Modells/userModells");

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

  try {
    // 1. Get the latest ID
    const lastid = await bdmodells.aggregate([
      { $match: { id: { $regex: /^BD\/Lead\// } } },
      {
        $addFields: {
          numericId: {
            $toInt: { $arrayElemAt: [{ $split: ["$id", "/"] }, -1] },
          },
        },
      },
      { $sort: { numericId: -1 } },
      { $limit: 1 },
    ]);

    let nextid;
    if (lastid.length > 0 && lastid[0].id) {
      const lastNumber = parseInt(lastid[0].id.split("/").pop(), 10) || 0;
      nextid = `BD/Lead/${lastNumber + 1}`;
    } else {
      nextid = "BD/Lead/1";
    }

    let assigned_to = null;
    if (submitted_by) {
      const user = await userModells.findOne({ name: submitted_by });
      if (user) {
        assigned_to = user._id;
      }
    }

    // 3. Create and save in bdmodells
    const createBDlead = new bdmodells({
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
      assigned_to, // ✅ assign user ID
      token_money,
      group,
      reffered_by,
      source,
      remark,
    });
    await createBDlead.save();

    // 4. Create and save in initialbdleadModells
    const initialbdlead = new initialbdleadModells({
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
      assigned_to, // ✅ assign user ID
      token_money,
      group,
      reffered_by,
      source,
      remark,
    });
    await initialbdlead.save();

    const leadNotes = new BDNotes({
      lead_id: initialbdlead._id,
      user_id: req.user.userId,
      description: comment,
      lead_model: "Initial",
    });

    await leadNotes.save();
    res.status(200).json({
      message: "Data saved successfully",
      Data: createBDlead,
      initialbdlead: initialbdlead,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
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

// get initial bd lead by streams

const getinitalbdleadstreams = async function (req, res) {
  try {
    // Set headers for streaming JSON
    res.setHeader("Content-Type", "application/json");
    res.write('{"msg":"Streaming Initial BD Leads","data":[');

    let isFirst = true;

    const cursor = initialbdleadModells.find().lean().cursor();

    cursor.on("data", (doc) => {
      // Avoid comma before first item
      const json = JSON.stringify(doc);
      if (!isFirst) {
        res.write(",");
      }
      res.write(json);
      isFirst = false;
    });

    cursor.on("end", () => {
      res.write("]}");
      res.end();
    });

    cursor.on("error", (error) => {
      console.error("Cursor stream error:", error);
      res.status(500).json({ error: "Error streaming data" });
    });
  } catch (error) {
    console.error("Error in streaming API:", error);
    res.status(500).json({ error: error.message });
  }
};

//edit initial bd lead
const editinitialbdlead = async function (req, res) {
  try {
    let { _id } = req.params;

    let data = req.body;
    let editdata = await initialbdleadModells.findByIdAndUpdate({ _id }, data, {
      new: true,
    });
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
  getinitalbdleadstreams,
};
