const handoversheetModells = require("../Modells/handoversheetModells");
const hanoversheetmodells = require("../Modells/handoversheetModells");
const projectmodells = require("../Modells/projectModells");

const createhandoversheet = async function (req, res) {
  try {
    const {
      id,
      customer_details,
      order_details,
      project_detail,
      commercial_details,
      other_details,
      invoice_detail,
      submitted_by,
    } = req.body;

    const handoversheet = new hanoversheetmodells({
      id,

      customer_details,
      order_details,
      project_detail,
      commercial_details,
      other_details,

      invoice_detail,
      status_of_handoversheet: "draft",
      submitted_by,
    });
    
    cheched_id = await hanoversheetmodells.findOne({ id: id });
    if (cheched_id) {
      return res.status(400).json({ message: "Handoversheet already exists" });
    }

    await handoversheet.save();

    res.status(200).json({
      message: "Data saved successfully",
      handoversheet,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// get  bd handover sheet data
const gethandoversheetdata = async function (req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 10; 
    const skip = (page - 1) * limit;

    let getbdhandoversheet = await hanoversheetmodells
      .find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res
      .status(200)
      .json({ message: "Data fetched successfully", Data: getbdhandoversheet });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllhandoversheetdata = async (req, res) => {
  try {
     const response = await handoversheetModells.find();
    res.status(200).json({
      message: "All handover sheets fetched successfully",
      Data: response,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
}

//edit handover sheet data
const edithandoversheetdata = async function (req, res) {
  try {
    let id = req.params._id;
    let data = req.body;
    if (!id) {
      res.status(400).json({ message: "id not found" });
    }
    let edithandoversheet = await hanoversheetmodells.findByIdAndUpdate(
      id,
      data,
      { new: true }
    );

    res.status(200).json({
      message: "Status updated successfully",
      handoverSheet: edithandoversheet,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// update status of handovesheet
const updatestatus = async function (req, res) {
  try {
    const _id = req.params._id;
    const { status_of_handoversheet,comment } = req.body;

  
    const updatedHandoversheet = await hanoversheetmodells.findOneAndUpdate(
      { _id: _id },
      { status_of_handoversheet,comment },
      { new: true }
    );

    if (!updatedHandoversheet) {
      return res.status(404).json({ message: "Handoversheet not found" });
    }
    if (updatedHandoversheet.status_of_handoversheet === "Approved" && updatedHandoversheet.is_locked ==="locked") {
      const latestProject = await projectmodells.findOne().sort({ p_id: -1 });
      const newPid =
        latestProject && latestProject.p_id ? latestProject.p_id + 1 : 1;

    
      const {
        customer_details = {},
        project_detail = {},
        other_details = {},
      } = updatedHandoversheet;

      // Construct the project data
      const projectData = new projectmodells({
        p_id: newPid,
        customer: customer_details.customer || "",
        name: customer_details.name || "",
        p_group: customer_details.p_group || "",
        email: customer_details.email || "",
        number: customer_details.number || "",
        alt_number: customer_details.alt_number || "",
        billing_address: {
          village_name: customer_details.billing_address?.village_name || "",
          district_name: customer_details.billing_address?.district_name || "",
        },
        site_address: {
          village_name: customer_details.site_address?.village_name || "",
          district_name: customer_details.site_address?.district_name || "",
        },
        state: customer_details.state || "",
        project_category: project_detail.project_category || "",
        project_kwp: project_detail.project_kwp || "",
        distance: project_detail.distance || "",
        tarrif: project_detail.tarrif || "",
        land: project_detail.land || "",
        code: customer_details.code || "",
        project_status: "",
        updated_on: new Date().toISOString(),
        service: other_details.service || "",
        submitted_by: req?.user?.name || "", // Adjust based on your auth
        billing_type: other_details.billing_type || "",
      
      });

      // Save the new project
      await projectData.save();
      updatedHandoversheet.p_id = newPid;
      await updatedHandoversheet.save();

      return res.status(200).json({
        message: "Status updated and project created successfully",
        handoverSheet: updatedHandoversheet,
        project: projectData,
      });
    }
    res.status(200).json({
      message: "Status updated successfully",
      Data: updatedHandoversheet,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const checkid = async function (req, res) {
  try {
    let _id = req.params._id;

    let checkid = await projectmodells.findOne({ _id: _id });
    if (checkid) {
      return res.status(200).json({ status: true });
    } else {
      return res.status(404).json({ status: false });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//get bd handover sheet data by id
const getbyid = async function (req, res) {
  try {
    let id = req.params._id;
    if (!id) {
      return res.status(400).json({ message: "id not found" });
    }
    let getbdhandoversheet = await hanoversheetmodells.findById(id);
    if (!getbdhandoversheet) {
      return res.status(404).json({ message: "Data not found" });
    }
    res
      .status(200)
      .json({ message: "Data fetched successfully", Data: getbdhandoversheet });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//sercher api

const search = async function (req, res) {
  const letter = req.params.letter;
  try {
    const regex = new RegExp("^" + letter, "i"); // Case-insensitive regex
    const items = await hanoversheetmodells
      .find({
        $or: [
          { "customer_details.name": { $regex: regex } },
          { "customer_details.code": { $regex: regex } },
        ],
      })
      .sort({ "customer_details.name": 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createhandoversheet,
  gethandoversheetdata,
  getAllhandoversheetdata,
  edithandoversheetdata,
  updatestatus,
  checkid,
  getbyid,
  search,
};
