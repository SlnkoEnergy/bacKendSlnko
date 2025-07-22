const { default: mongoose } = require("mongoose");
const moduleCategory = require("../Modells/EngineeringModells/engineeringModules/moduleCategory");
const hanoversheetmodells = require("../Modells/handoversheetModells");
const projectmodells = require("../Modells/projectModells");
const { Parser } = require("json2csv");
const handoversheetModells = require("../Modells/handoversheetModells");

const migrateProjectToHandover = async (req, res) => {
  try {
    // 1. Get last handover `id`
    const lastHandover = await hanoversheetmodells
      .findOne({ id: { $regex: /^BD\/LEAD\// } })
      .sort({ createdAt: -1 });

    let lastIdNum = 1000;
    if (lastHandover && lastHandover.id) {
      const parts = lastHandover.id.split("/");
      lastIdNum = parseInt(parts[2]);
    }

    // 2. Get all existing p_ids in handoversheet
    const existingPids = await hanoversheetmodells.distinct("p_id");

    // 3. Get all projects that are not already in handoversheet
    const projects = await projectmodells.find({
      p_id: { $nin: existingPids },
    });

    const handoversToInsert = [];
    const moduleCategoriesToInsert = [];

    for (const project of projects) {
      lastIdNum += 1;
      const newId = `BD/LEAD/${lastIdNum}`;

      const handoverData = {
        id: " ",
        p_id: project.p_id,
        customer_details: {
          customer: project.customer || "",
          name: project.name || "",
          p_group: project.p_group || "",
          email: project.email || "",
          number: parseInt((project.number || "").replace(/\D/g, "")) || 0,
          alt_number:
            parseInt((project.alt_number || "").replace(/\D/g, "")) || 0,
          site_address: {
            village_name: project.site_address?.village_name || "",
            district_name: project.site_address?.district_name || "",
          },
          state: project.state || "",
          code: project.code || "",
        },
        project_detail: {
          project_component: project.project_category || "",
          project_kwp: project.project_kwp || "",
          distance: project.distance || "",
          tarrif: project.tarrif || "",
        },
        other_details: {
          service: project.service || "",
          billing_type: project.billing_type || "",
        },
        submitted_by: project.submitted_by || "",
        is_locked: "locked",
        status_of_handoversheet: "Approved",
      };

      handoversToInsert.push(handoverData);

      // Create moduleCategory record
      moduleCategoriesToInsert.push({
        project_id: project._id,
      });
    }

    if (handoversToInsert.length > 0) {
      await hanoversheetmodells.insertMany(handoversToInsert);
      await moduleCategory.insertMany(moduleCategoriesToInsert);
    }

    res.status(200).json({
      message: `${handoversToInsert.length} project(s) migrated to handoversheet.`,
    });
  } catch (error) {
    console.error("Migration Error:", error);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

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

    if (
      req.body.status_of_handoversheet === "Approved" &&
      req.body.is_locked === "locked"
    ) {
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
          { "customer_details.customer": { $regex: search, $options: "i" } },
          { "customer_details.state": { $regex: search, $options: "i" } },
          { "customer_details.p_group": { $regex: search, $options: "i" } },
          { "leadDetails.id": { $regex: search, $options: "i" } },
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
          from: "bdleads",
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
              village_name:
                customer_details.billing_address?.village_name || "",
              district_name:
                customer_details.billing_address?.district_name || "",
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
            district_name:
              customer_details.billing_address?.district_name || "",
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
          message:
            "Status updated, new project and moduleCategory created successfully",
          handoverSheet: updatedHandoversheet,
          project: projectData,
          data: moduleCategoryData,
        });
      }
    }

    return res.status(200).json({
      message: "Status updated",
      handoverSheet: updatedHandoversheet,
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
    if (p_id) query.p_id = p_id;

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

const getexportToCsv = async (req, res) => {
  try {
    const { Ids } = req.body;

    const pipeline = [
      {
        $match: {
          _id: { $in: Ids.map((id) => new mongoose.Types.ObjectId(id)) },
        },
      },
      {
        $project: {
          id: 1,
          p_id: 1,
          customer_code: "$customer_details.code",
          customer_name: "$customer_details.name",
          customer: "$customer_details.customer",
          epc_developer: "$customer_details.epc_developer",
          site_address_village: "$customer_details.site_address.village_name",
          site_address_district: "$customer_details.site_address.district_name",
          number: "$customer_details.number",
          p_group: "$customer_details.p_group",
          state: "$customer_details.state",
          alt_number: "$customer_details.alt_number",
          email: "$customer_details.email",
          pan_no: "$customer_details.pan_no",
          andharNumbre_of_loa_hoder:
            "$customer_details.adharNumber_of_loa_holder",
          type_business: "$order_details.type_business",
          discom_name: "$order_details.discom_name",
          design_date: "$order_details.design_date",
          feeder_code: "$order_details.feeder_code",
          feeder_name: "$order_details.feeder_name",

          project_type: "$project_detail.project_type",
          module_make_capacity: "project_detail.module_make_capacity",
          module_make: "$project_detail.module_make",
          module_capacity: "$project_detail.module_capacity",
          module_type: "$project_detail.module_type",
          module_make_other: "$project_detail.madule_make_other",
          inverter_make_capacity: "$project_detail.inverter_make_capacity",
          inverter_size: "$project_detail.inverter_size",
          inverter_make_other: "$project_detail.inverter_make_other",
          inverter_type_other: "$project_detail.inverter_type_other",
          topography_survey: "$project_detail.topography_survey",
          soil_test: "$project_detail.soil_test",
          purchase_supply_net_meter:
            "$project_detail.purchase_supply_net_meter",
          liaisoning_net_metering: "$project_detail.liaisoning_net_metering",
          ceig_ceg: "$project_detail.ceig_ceg",
          project_completion_date: "$project_detail.project_completion_date",
          proposed_dc_capacity: "$project_detail.propsed_dc_capacity",
          project_component: "$project_detail.project_component",
          project_component_other: "$project_detail.project_component_other",
          distance: "$project_detail.distance",
          tarrif: "$project_detail.tarrif",
          land: "$project_detail.land",
          overloading: "$project_detail.overloading",
          module_category: "$project_detail.module_category",
          transmission_scope: "$project_detail.transmission_scope",
          loan_scope: "$project_detail.loan_scope",
          agreement_date: "$project_detail.agreement_date",
          inverter_make: "$project_detail.inverter_make",
          inverter_type: "$project_detail.inverter_type",
          evacuation_voltage: "$project_detail.evacuation_voltage",
          work_by_slnko: "$project_detail.work_by_slnko",
          project_kwp: "$project_detail.project_kwp",
          substation_name: "$project_detail.substation_name",

          cam_member_name: "$other_details.cam_member_name",
          service: "$other_details.service",
          slnko_basic: "$other_details.slnko_basic",
          billing_by: "$other_details.billing_by",
          remark: "$other_details.remark",
          remarks_for_slnko: "$other_details.remarks_for_slnko",
          total_gst: "$other_details.total_gst",
          project_status: "$other_details.project_status",
          loa_number: "$other_details.loa_number",
          ppa_number: "$other_details.ppa_number",
          submitted_by_BD: "$other_details.submitted_by_BD",
          billing_type: "$other_details.billing_type",

          invoice_recipient: "$invoice_detail.invoice_recipient",
          invoicing_GST_no: "$invoice_detail.invoicing_GST_no",
          invoicing_address: "$invoice_detail.invoicing_address",
          delivery_address: "$invoice_detail.delivery_address",
          msme_reg: "$invoice_detail.msme_reg",
          invoicing_GST_status: "$invoice_detail.invoicing_GST_status",

          comment: 1,
          is_locked: 1,
          status_of_handoversheet: 1,
          submitted_by: 1,
          createdAt: 1,
          commercial_details: 1,
        },
      },
    ];

    const result = await handoversheetModells.aggregate(pipeline);

    const fields = [
      { label: "ID", value: "id" },
      { label: "P ID", value: "p_id" },

      // Customer Details
      { label: "Customer Code", value: "customer_code" },
      { label: "Customer Name", value: "customer_name" },
      { label: "Customer", value: "customer" },
      { label: "EPC Developer", value: "epc_developer" },
      { label: "Village", value: "site_address_village" },
      { label: "District", value: "site_address_district" },
      { label: "Customer Phone Number", value: "number" },
      { label: "Customer P Group", value: "p_group" },
      { label: "State", value: "state" },
      { label: "Alternate Number", value: "alt_number" },
      { label: "Email", value: "email" },
      { label: "PAN No", value: "pan_no" },
      { label: "Aadhar Number", value: "andharNumbre_of_loa_hoder" },

      // Order Details
      { label: "Type of Business", value: "type_business" },
      { label: "Discom Name", value: "discom_name" },
      { label: "Design Date", value: "design_date" },
      { label: "Feeder Code", value: "feeder_code" },
      { label: "Feeder Name", value: "feeder_name" },

      // Project Details
      { label: "Project Type", value: "project_type" },
      { label: "Module Make Capacity", value: "module_make_capacity" },
      { label: "Module Make", value: "module_make" },
      { label: "Module Capacity", value: "module_type" },
      { label: "Module Type", value: "project_detail.module_type" },
      { label: "Module Make Other", value: "module_make_other" },
      { label: "Inverter Make Capacity", value: "inverter_make_capacity" },
      { label: "Inverter Size", value: "inverter_size" },
      { label: "Inverter Make Other", value: "inverter_make_other" },
      { label: "Inverter Type Other", value: "inverter_type_other" },
      { label: "Topography Survey", value: "topography_survey" },
      { label: "Soil Test", value: "soil_test" },
      {
        label: "Purchase Supply Net Meter",
        value: "purchase_supply_net_meter",
      },
      { label: "Liaisoning Net Metering", value: "liaisoning_net_metering" },
      { label: "CEIG/CEG", value: "ceig_ceg" },
      { label: "Project Completion Date", value: "project_completion_date" },
      { label: "Proposed DC Capacity", value: "proposed_dc_capacity" },
      { label: "Project Component", value: "project_component" },
      { label: "Project Component Other", value: "project_component_other" },
      { label: "Distance", value: "distance" },
      { label: "Tariff", value: "tarrif" },
      { label: "Land", value: "land" },
      { label: "Overloading", value: "overloading" },
      { label: "Module Category", value: "module_category" },
      { label: "Transmission Scope", value: "transmission_scope" },
      { label: "Loan Scope", value: "loan_scope" },
      { label: "Agreement Date", value: "agreement_date" },
      { label: "Inverter Make", value: "inverter_make" },
      { label: "Inverter Type", value: "inverter_type" },
      { label: "Evacuation Voltage", value: "evacuation_voltage" },
      { label: "Work by Slnko", value: "work_by_slnko" },
      { label: "Project kWp", value: "project_kwp" },
      { label: "Substation Name", value: "substation_name" },

      // Other Details
      { label: "CAM Member Name", value: "cam_member_name" },
      { label: "Service", value: "service" },
      { label: "Slnko Basic", value: "slnko_basic" },
      { label: "Billing By", value: "billing_by" },
      { label: "Remark", value: "remark" },
      { label: "Remarks for Slnko", value: "remarks_for_slnko" },
      { label: "Total GST", value: "total_gst" },
      { label: "Project Status", value: "project_status" },
      { label: "LOA Number", value: "loa_number" },
      { label: "PPA Number", value: "ppa_number" },
      { label: "Submitted By BD", value: "submitted_by_BD" },
      { label: "Billing Type", value: "billing_type" },

      // Invoice Details
      { label: "Invoice Recipient", value: "invoice_recipient" },
      { label: "Invoicing GST No", value: "invoicing_GST_no" },
      { label: "Invoicing Address", value: "invoicing_address" },
      { label: "Delivery Address", value: "delivery_address" },
      { label: "MSME Reg", value: "msme_reg" },
      { label: "Invoicing GST Status", value: "invoicing_GST_status" },

      // Meta
      { label: "Comment", value: "comment" },
      { label: "Is Locked", value: "is_locked" },
      { label: "Status of Handoversheet", value: "status_of_handoversheet" },
      { label: "Submitted By", value: "submitted_by" },
      { label: "Created At", value: "createdAt" },
      { label: "Commercial Details", value: "commercial_details" },
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(result);
    res.setHeader("Content-disposition", "attachment; filename=data.csv");
    res.set("Content-Type", "text/csv");
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
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
  getexportToCsv,
  migrateProjectToHandover,
};
