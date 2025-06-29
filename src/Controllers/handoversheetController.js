const moduleCategory = require("../Modells/EngineeringModells/engineeringModules/moduleCategory");
const hanoversheetmodells = require("../Modells/handoversheetModells");
const projectmodells = require("../Modells/projectModells");

const createhandoversheet = async function (req, res) {
  try {
    const {
      id,
      p_id,
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
      p_id,
      customer_details,
      order_details,
      project_detail,
      commercial_details,
      other_details,
      invoice_detail,
      status_of_handoversheet: req.body.status_of_handoversheet || "draft",
      submitted_by,
    });

    cheched_id = await hanoversheetmodells.findOne({ id: id });
    if (cheched_id) {
      return res.status(400).json({ message: "Handoversheet already exists" });
    }

    if (req.body.status_of_handoversheet === "Approved" && req.body.is_locked === "locked") {
      const projectData = await projectmodells.findOne({ p_id: p_id });
      if (!projectData) {
        return res.status(404).json({ message: "Project not found" });
      }

      const moduleCategoryData = new moduleCategory({
        project_id: projectData._id,
      });

      await moduleCategoryData.save();
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
    const search = req.query.search || "";
    const statusFilter = req.query.status; 

    const matchConditions = { $and: [] };

    // Keyword search
    if (search) {
      matchConditions.$and.push({
        $or: [
          { "customer_details.code": { $regex: search, $options: "i" } },
          { "customer_details.name": { $regex: search, $options: "i" } },
          { "customer_details.state": { $regex: search, $options: "i" } },
          { "leadDetails.scheme": { $regex: search, $options: "i" } },
        ],
      });
    }

    // Status filter
    if (statusFilter) {
      const statuses = statusFilter
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (statuses.length === 1) {
        matchConditions.$and.push({ status_of_handoversheet: statuses[0] });
      } else if (statuses.length > 1) {
        matchConditions.$and.push({
          status_of_handoversheet: { $in: statuses },
        });
      }
    }

    const finalMatch = matchConditions.$and.length > 0 ? matchConditions : {};

    const pipeline = [
      {
        $addFields: {
          id: { $toString: "$id" },
        },
      },
      {
        $lookup: {
          from: "wonleads",
          localField: "id",
          foreignField: "id",
          as: "leadDetails",
        },
      },
      {
        $unwind: {
          path: "$leadDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "projectdetails", 
          localField: "p_id",
          foreignField: "p_id",
          as: "projectInfo",
        },
      },
      {
        $unwind: {
          path: "$projectInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: finalMatch,
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                id: 1,
                createdAt: 1,
                leadId: 1,
                customer_details: 1,
                scheme: "$leadDetails.scheme",
                proposed_dc_capacity: "$project_detail.proposed_dc_capacity",
                project_kwp: "$project_detail.project_kwp",
                total_gst: "$other_details.total_gst",
                service: "$other_details.service",
                submitted_by: "$leadDetails.submitted_by",
                leadDetails: 1,
                status_of_handoversheet: 1,
                is_locked: 1,
                comment: 1,
                p_id: 1,
                project_id: "$projectInfo._id", 
              },
            },
          ],
        },
      },
    ];

    const result = await hanoversheetmodells.aggregate(pipeline);
    const total = result[0].metadata[0]?.total || 0;
    const data = result[0].data;

    res.status(200).json({
      message: "Data fetched successfully",
      meta: {
        total,
        page,
        pageSize: limit,
        count: data.length,
      },
      data,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: error.message });
  }
};


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
    const { status_of_handoversheet, comment } = req.body;

    const updatedHandoversheet = await hanoversheetmodells.findOneAndUpdate(
      { _id: _id },
      { status_of_handoversheet, comment },
      { new: true }
    );

    if (!updatedHandoversheet) {
      return res.status(404).json({ message: "Handoversheet not found" });
    }

    if (
      updatedHandoversheet.status_of_handoversheet === "Approved" &&
      updatedHandoversheet.is_locked === "locked"
    ) {
      const {
        customer_details = {},
        project_detail = {},
        other_details = {},
      } = updatedHandoversheet;

      let projectData;

      if (updatedHandoversheet.p_id) {
        // Update existing project
        projectData = await projectmodells.findOneAndUpdate(
          { p_id: updatedHandoversheet.p_id },
          {
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
            service: other_details.service || "",
            billing_type: other_details.billing_type || "",
            updated_on: new Date().toISOString(),
            submitted_by: req?.user?.name || "",
          },
          { new: true }
        );

        return res.status(200).json({
          message: "Status updated, existing project updated",
          handoverSheet: updatedHandoversheet,
          project: projectData,
        });
      } else {
        // Create new project
        const latestProject = await projectmodells.findOne().sort({ p_id: -1 });
        const newPid = latestProject?.p_id ? latestProject.p_id + 1 : 1;

        projectData = new projectmodells({
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
          submitted_by: req?.user?.name || "", 
          billing_type: other_details.billing_type || "",
        });

        await projectData.save();
        updatedHandoversheet.p_id = newPid;
        await updatedHandoversheet.save();

        const moduleCategoryData = new moduleCategory({
          project_id: projectData._id,
        });

        await moduleCategoryData.save();

        return res.status(200).json({
          message: "Status updated, new project and moduleCategory created successfully",
          handoverSheet: updatedHandoversheet,
          project: projectData,
          data: moduleCategoryData
        });
      }
    }

    return res.status(200).json({
      message: "Status updated",
      handoverSheet: updatedHandoversheet
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

//get bd handover sheet data by id or leadId
const getByIdOrLeadId = async function (req, res) {
  try {
    const { id, leadId, p_id } = req.query;

    if (!id && !leadId && !p_id) {
      return res.status(400).json({ message: "id or leadId is required" });
    }

    let query = {};
    if (id) query._id = id;
    if (leadId) query.id = leadId;
    if(p_id) query.p_id = p_id

    const handoverSheet = await hanoversheetmodells.findOne(query);

    if (!handoverSheet) {
      return res.status(404).json({ message: "Data not found" });
    }

    res
      .status(200)
      .json({ message: "Data fetched successfully", data: handoverSheet });
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
  getByIdOrLeadId,
  edithandoversheetdata,
  updatestatus,
  checkid,
  search,
};