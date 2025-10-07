const { default: mongoose } = require("mongoose");
const moduleCategory = require("../models/modulecategory.model");
const hanoversheetmodells = require("../models/handoversheet.model");
const projectmodells = require("../models/project.model");
const { Parser } = require("json2csv");
const handoversheetModells = require("../models/handoversheet.model");
const userModells = require("../models/user.model");
const materialCategoryModells = require("../models/materialcategory.model");
const scopeModel = require("../models/scope.model");
const bdleadsModells = require("../models/bdleads.model");
const { getnovuNotification } = require("../utils/nouvnotification.utils");
const postsModel = require("../models/posts.model");
const activitiesModel = require("../models/activities.model");
const projectactivitiesModel = require("../models/projectactivities.model");
const { triggerLoanTasksBulk } = require("../utils/triggerLoanTask");

const migrateProjectToHandover = async (req, res) => {
  try {
    const lastHandover = await hanoversheetmodells
      .findOne({ id: { $regex: /^BD\/LEAD\// } })
      .sort({ createdAt: -1 });

    let lastIdNum = 1000;
    if (lastHandover && lastHandover.id) {
      const parts = lastHandover.id.split("/");
      lastIdNum = parseInt(parts[2]);
    }
    const existingPids = await hanoversheetmodells.distinct("p_id");

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
    } = req.body;

    const userId = req.user.userId;
    const user = await userModells.findById(userId);

    other_details.submitted_by_BD = userId;

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
      submitted_by: userId,
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

    const lead = await bdleadsModells.findOne({ id: id });
    lead.status_of_handoversheet = req.body.status_of_handoversheet || "draft";
    lead.handover_lock = req.body.handover_lock || "locked";
    await lead.save();
    await handoversheet.save();

    // Notification for Creating Handover
    try {
      const workflow = "handover-submit";
      const Ids = await userModells
        .find({ department: "Internal", role: "manager" })
        .select("_id")
        .lean()
        .then((users) => users.map((u) => u._id));
      const data = {
        message: `${user?.name} submitted the handover for Lead ${lead.id} on ${new Date().toLocaleString()}.`,
        link: `leadProfile?id=${lead._id}&tab=handover`,
        type: "sales",
        link1: `/sales`,
      };
      setImmediate(() => {
        getnovuNotification(workflow, Ids, data).catch((err) =>
          console.error("Notification error:", err)
        );
      });
    } catch (error) {
      console.log(error);
    }
    res.status(200).json({
      message: "Data saved successfully",
      handoversheet,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const gethandoversheetdata = async function (req, res) {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip  = (page - 1) * limit;
    const search = req.query.search || "";
    const statusFilter = req.query.status;

    const userId = req.user.userId;
    const userDoc = await userModells.findById(userId).lean();
    const isBD = userDoc?.role === "BD";

    const matchConditions = { $and: [] };
    if (isBD) {
      const uid = new mongoose.Types.ObjectId(userId);
      matchConditions.$and.push({
        $or: [
          { "other_details.submitted_by_BD": uid },
          { submitted_by: uid },
          { assigned_to: uid }, 
        ],
      });
    }

    if (search) {
      matchConditions.$and.push({
        $or: [
          { "customer_details.code":     { $regex: search, $options: "i" } },
          { "customer_details.name":     { $regex: search, $options: "i" } },
          { "customer_details.customer": { $regex: search, $options: "i" } },
          { "customer_details.state":    { $regex: search, $options: "i" } },
          { "customer_details.p_group":  { $regex: search, $options: "i" } },
          { "leadDetails.id":            { $regex: search, $options: "i" } },
          { "leadDetails.scheme":        { $regex: search, $options: "i" } },
        ],
      });
    }

    const statuses =
      statusFilter?.split(",").map((s) => s.trim()).filter(Boolean) || [];

    const hasHandoverPending = statuses.includes("handoverpending");
    const hasScopePending    = statuses.includes("scopepending");
    const hasScopeOpen       = statuses.includes("scopeopen");

    const actualStatuses = statuses.filter(
      (s) => s !== "handoverpending" && s !== "scopepending" && s !== "scopeopen"
    );

    if (actualStatuses.length === 1) {
      matchConditions.$and.push({ status_of_handoversheet: actualStatuses[0] });
    } else if (actualStatuses.length > 1) {
      matchConditions.$and.push({ status_of_handoversheet: { $in: actualStatuses } });
    }

    if (hasHandoverPending) {
      matchConditions.$and.push({ status_of_handoversheet: "submitted" });
    }

    if (hasScopeOpen) {
      matchConditions.$and.push({ scope_status: "open" });
    }

    const finalMatch = matchConditions.$and.length > 0 ? matchConditions : {};

    const pipeline = [
      { $addFields: { id: { $toString: "$id" } } },
      {
        $lookup: {
          from: "bdleads",
          localField: "id",
          foreignField: "id",
          as: "leadDetails",
        },
      },
      { $unwind: { path: "$leadDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "projectInfo",
        },
      },
      { $unwind: { path: "$projectInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "scopes",
          localField: "projectInfo._id",
          foreignField: "project_id",
          as: "scopeInfo",
        },
      },
      { $unwind: { path: "$scopeInfo", preserveNullAndEmptyArrays: true } },
      { $addFields: { scope_status: "$scopeInfo.current_status.status" } },
      {
        $lookup: {
          from: "users",
          localField: "submitted_by",
          foreignField: "_id",
          as: "submittedByUser",
        },
      },
      { $unwind: { path: "$submittedByUser", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "other_details.submitted_by_BD",
          foreignField: "_id",
          as: "submittedByBDUser",
        },
      },
      { $unwind: { path: "$submittedByBDUser", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          let: {
            assignedIds: {
              $cond: [
                { $and: [ { $isArray: "$assigned_to" }, { $gt: [ { $size: "$assigned_to" }, 0 ] } ] },
                "$assigned_to.user_id",
                [ "$assigned_to" ] 
              ]
            }
          },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$assignedIds"] } } },
            { $project: { _id: 1, name: 1, email: 1 } }
          ],
          as: "assignedUsers"
        }
      },
      { $match: finalMatch },
    ];
    if (hasScopePending) {
      const matchedDocs = await hanoversheetmodells.aggregate([
        ...pipeline,
        { $project: { project_id: "$projectInfo._id", _id: 1 } },
      ]);

      const projectIds = matchedDocs.map((doc) => doc.project_id).filter(Boolean);

      const scopes = await scopeModel
        .find(
          {
            project_id: { $in: projectIds },
            $or: [{ status_history: { $exists: false } }, { status_history: { $size: 0 } }],
          },
          { project_id: 1 }
        )
        .lean();

      const pendingScopeIds = scopes.map((s) => s.project_id.toString());

      pipeline.push({
        $match: {
          "projectInfo._id": {
            $in: pendingScopeIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
        },
      });
    }

    pipeline.push({
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
              status_of_handoversheet: 1,
              is_locked: 1,
              comment: 1,
              p_id: 1,
              project_id: "$projectInfo._id",
              scope_status: 1,
              leadDetails: 1,
              submitted_by: {
                $let: {
                  vars: { u: "$submittedByUser" },
                  in: { $ifNull: ["$$u.name", "$$u.email"] }
                }
              },
              "other_details.submitted_by_BD": {
                $let: {
                  vars: { u: "$submittedByBDUser" },
                  in: { $ifNull: ["$$u.name", "$$u.email"] }
                }
              },
              assigned_to: {
                $cond: [
                  { $isArray: "$assigned_to" },
                  {
                    $map: {
                      input: "$assigned_to",
                      as: "a",
                      in: {
                        name: {
                          $let: {
                            vars: {
                              matched: {
                                $first: {
                                  $filter: {
                                    input: "$assignedUsers",
                                    as: "u",
                                    cond: { $eq: ["$$u._id", "$$a.user_id"] }
                                  }
                                }
                              }
                            },
                            in: { $ifNull: ["$$matched.name", "$$matched.email"] }
                          }
                        },
                        status: "$$a.status"
                      }
                    }
                  },
                  {
                    $let: {
                      vars: { u: { $first: "$assignedUsers" } },
                      in: { $ifNull: ["$$u.name", "$$u.email"] }
                    }
                  }
                ]
              },
            },
          },
        ],
      },
    });

    const result = await hanoversheetmodells.aggregate(pipeline);
    const total = result?.[0]?.metadata?.[0]?.total || 0;
    const data  = result?.[0]?.data || [];

    res.status(200).json({
      message: "Data fetched successfully",
      meta: { total, page, pageSize: limit, count: data.length },
      data,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const edithandoversheetdata = async function (req, res) {
  try {
    const id = req.params._id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Valid _id param is required" });
    }

    const body = req.body || {};

    const update = {
      ...body,
      submitted_by: req?.user?.userId,
    };

    const handoverSheet = await hanoversheetmodells.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!handoverSheet) {
      return res.status(404).json({ message: "Handover sheet not found" });
    }
    const leadUpdate = {};
    if (typeof body.is_locked !== "undefined") {
      leadUpdate.handover_lock = body.is_locked;
    }
    if (typeof body.status_of_handoversheet !== "undefined") {
      leadUpdate.status_of_handoversheet = body.status_of_handoversheet;
    }

    if (Object.keys(leadUpdate).length) {
      await bdleadsModells.findOneAndUpdate(
        { id: handoverSheet.id },
        { $set: leadUpdate },
        { new: true }
      );
    }

    return res.status(200).json({
      message: "Status updated successfully",
      handoverSheet,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

function parseFraction(formula) {
  if (!formula) return null;
  const m = String(formula)
    .trim()
    .match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetweenCeil(from, to) {
  const DAY = 24 * 60 * 60 * 1000;
  const diffMs = (to?.getTime?.() ?? 0) - (from?.getTime?.() ?? 0);
  return Math.max(0, Math.ceil(diffMs / DAY));
}

function addDays(date, days) {
  const DAY = 24 * 60 * 60 * 1000;
  return new Date(date.getTime() + days * DAY);
}

function minDate(...dates) {
  const valid = dates.filter((d) => d instanceof Date && !isNaN(d));
  if (valid.length === 0) return null;
  return new Date(Math.min(...valid.map((d) => d.getTime())));
}

async function getLoanManagers(session = null) {
  const deptOrTeamLoan = { $or: [{ department: /loan/i }, { team: /loan/i }] };
  const roleIsManager = {
    $or: [
      { role: /manager/i },
      { designation: /manager/i },
      { title: /manager/i },
    ],
  };

  let managers = await userModells
    .find({ $and: [deptOrTeamLoan, roleIsManager] })
    .select("_id")
    .session(session)
    .lean();

  if (!managers?.length) {
    managers = await userModells
      .find(deptOrTeamLoan)
      .select("_id")
      .session(session)
      .lean();
  }
  return (managers || []).map((u) => u._id);
}

function buildLoanTaskPayloadsForActivity({
  projectActivityDoc,
  activityRow,
  createdByUserId,
  assignedToIds,
  activityName,
}) {
  // ensure dates present
  if (!activityRow?.planned_start || !activityRow?.planned_finish) return [];

  const activityId = activityRow.activity_id;
  const common = {
    sourceKey: `PA:LOAN_DOC:${projectActivityDoc._id}:${activityId}`,
    source: {
      type: "Loan",
      model_id: new mongoose.Types.ObjectId(activityId),
      activityId: new mongoose.Types.ObjectId(activityId),
      projectActivityId: projectActivityDoc._id,
      phase: "documentation",
    },
    title: "Loan Task",
    description:
      `Auto task for loan process` +
      (activityName ? ` (Activity: ${activityName})` : ""),
    project_id: projectActivityDoc.project_id,
    userId: createdByUserId,
    assigned_to: assignedToIds,
    deadline: activityRow.planned_finish,
    status_history: [
      {
        status: "pending",
        remarks: "Task created for Loan team by system",
        user_id: null,
        updatedAt: new Date(),
      },
    ],
  };

  return [
    {
      ...common,
    },
  ];
}

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

    const lead = await bdleadsModells.findOne({ id: updatedHandoversheet.id });
    lead.status_of_handoversheet = status_of_handoversheet;
    lead.handover_lock = updatedHandoversheet.is_locked;
    await lead.save();
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
            submitted_by: req.user.userId,
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
          submitted_by: req.user.userId || "",
          billing_type: other_details.billing_type || "",
          project_completion_date: project_detail.project_completion_date || "",
          ppa_expiry_date: project_detail.ppa_expiry_date || "",
          bd_commitment_date: project_detail.bd_commitment_date || "",
        });

        await projectData.save();
        updatedHandoversheet.p_id = newPid;
        await updatedHandoversheet.save();

        const moduleCategoryData = new moduleCategory({
          project_id: projectData._id,
        });

        await moduleCategoryData.save();

        const allMaterialCategories = await materialCategoryModells
          .find(
            { status: { $ne: "inactive" } },
            { _id: 1, name: 1, type: 1, order: 1 }
          )
          .sort({ order: 1, name: 1 })
          .lean();

        const items = allMaterialCategories.map((mc) => ({
          item_id: mc._id,
          name: mc.name || "",
          type: mc.type,
          order: Number.isFinite(mc.order) ? mc.order : 0,
          scope: "client",
          quantity: "",
          uom: "",
        }));

        const scopeDoc = new scopeModel({
          project_id: projectData._id,
          items,
          createdBy: req.user.userId,
        });

        await scopeDoc.save();

        const posts = new postsModel({
          project_id: projectData._id,
        });

        await posts.save();

        const earliestProjectDate = minDate(
          projectData?.ppa_expiry_date,
          projectData?.bd_commitment_date,
          projectData?.project_completion_date
        );
        const startOfDay = startOfToday;
        const todayStart = startOfDay(new Date());
        const totalDaysToEarliest = earliestProjectDate
          ? Math.max(0, daysBetweenCeil(todayStart, earliestProjectDate))
          : null;

        const activities = await activitiesModel
          .find({})
          .select(
            "name completion_formula dependency.model dependency.model_id dependency.model_id_name predecessors.activity_id predecessors.type predecessors.lag"
          )
          .lean();

        const activitiesMapById = new Map(
          activities.map((a) => [String(a._id), a])
        );

        const activitiesArray = activities.map((act) => {
          let planned_start = undefined;
          let planned_finish = undefined;

          if (totalDaysToEarliest !== null) {
            const frac = parseFraction(act?.completion_formula);
            console.log({ frac });
            if (frac !== null) {
              const durationDays = Math.max(
                0,
                Math.ceil(totalDaysToEarliest * frac)
              );
              planned_start = new Date(todayStart);
              planned_finish = addDays(todayStart, durationDays);
              console.log({ planned_start, planned_finish, durationDays });
            }
          }

          return {
            activity_id: act._id,
            dependency: Array.isArray(act.dependency)
              ? act.dependency.map((d) => ({
                model: d.model,
                model_id: d.model_id,
                model_id_name: d.model_id_name,
                updatedAt: d.updatedAt || new Date(),
                updated_by: d.updated_by || req.user.userId,
              }))
              : [],
            predecessors: Array.isArray(act.predecessors)
              ? act.predecessors.map((p) => ({
                activity_id: p.activity_id,
                type: p.type,
                lag: p.lag,
              }))
              : [],
            planned_start,
            planned_finish,
          };
        });

        // Create the ProjectActivities doc
        const projectActivityDoc = new projectactivitiesModel({
          project_id: projectData._id,
          activities: activitiesArray,
          created_by: req.user.userId,
          status: "project",
        });
        await projectActivityDoc.save();

        const createdByUserId = req.user.userId;
        const loanManagers = await getLoanManagers();
        const assignedTo = loanManagers?.length ? loanManagers : [];

        const loanTaskPayloads = projectActivityDoc.activities
          .filter((a) => a.planned_start && a.planned_finish)
          .flatMap((a) => {
            const master = activitiesMapById.get(String(a.activity_id));
            const activityName = master?.name || null;
            return buildLoanTaskPayloadsForActivity({
              projectActivityDoc,
              activityRow: a,
              createdByUserId,
              assignedToIds: assignedTo,
              activityName,
            });
          });

        if (loanTaskPayloads.length) {
          await triggerLoanTasksBulk(loanTaskPayloads);
        }

        return res.status(200).json({
          message:
            "Status updated, new project and moduleCategory created successfully",
          handoverSheet: updatedHandoversheet,
          project: projectData,
          data: moduleCategoryData,
        });
      }
    }

    try {
      const owner = await userModells.find({ name: submitted_by });

      senders = [owner._id];
      workflow = "handover-submit";
      data = {
        Module: "Handover Status",
        sendBy_Name: owner.name,
        message: `Handover Sheet status updated for Lead #${updatedHandoversheet.id}`,
        link: `leadProfile?id=${_id}&tab=handover`,
        type: "sales",
        link1: `/sales`,
      };

      setImmediate(() => {
        getnovuNotification(workflow, senders, data).catch((err) =>
          console.error("Notification error:", err)
        );
      });
    } catch (error) {
      console.log(error);
    }
    return res.status(200).json({
      message: "Status updated",
      handoverSheet: updatedHandoversheet,
    });
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

    const handoverSheet = await hanoversheetmodells
      .findOne(query)
      .populate("other_details.submitted_by_BD", "_id name")
      .populate("submitted_by", "_id name");

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
          module_capacity: "$project_detail.module_type",
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

const listUsersNames = async function (req, res) {
  try {
    const users = await userModel.find({}, "_id name").sort({ name: 1 }).lean();

    res.status(200).json({
      message: "Users fetched",
      users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateAssignedTo = async function (req, res) {
  try {
    const { handoverIds, AssignedTo } = req.body;

    if (
      !handoverIds ||
      !Array.isArray(handoverIds) ||
      handoverIds.length === 0
    ) {
      return res.status(400).json({ message: "Handover Required" });
    }

    if (!AssignedTo) {
      return res.status(400).json({ message: "Assignee is Required" });
    }

    const result = await handoversheetModells.updateMany(
      { _id: { $in: handoverIds } },
      { $set: { assigned_to: AssignedTo } }
    );

    return res.status(200).json({
      message: "Assignee updated successfully",
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    });
  } catch (error) {
    console.error("Error updating assignee:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const ManipulateHandoverSubmittedBy = async (req, res) => {
  try {

    const handovers = await handoversheetModells.find();

    // comment out this part 
    for (let h of handovers) {

      if (h.submitted_by && mongoose.Types.ObjectId.isValid(h.submitted_by)) {
        await handoversheetModells.updateOne(
          { _id: h._id },
          { $set: { submitted_by: new mongoose.Types.ObjectId(h.submitted_by) } }
        );
        console.log(`Migrated submitted_by for ${h._id}`);
      }
    }

    // // comment out this part and update model
    for (let h of handovers) {

      if (h.submitted_by && mongoose.Types.ObjectId.isValid(h.submitted_by)) {

        await handoversheetModells.updateOne(
          { _id: h._id },
          { $set: { assigned_to: new mongoose.Types.ObjectId(h.submitted_by) } }
        );
        console.log(`ADD assigned To in handover ${h._id} `)
      }
      else {
        console.log(`Error ${h._id}`)
      }
    }

    for (let h of handovers) {

      if (h.other_details.submitted_by_BD && mongoose.Types.ObjectId.isValid(h.other_details.submitted_by_BD)) {
        await handoversheetModells.updateOne(
          { _id: h._id },
          { $set: { "other_details.submitted_by_BD": new mongoose.Types.ObjectId(h.other_details.submitted_by_BD) } }
        );
        console.log(`Migrated submitted_by for Other detail ${h._id}`);
      }
    }


    res.status(200).json({ message: "Data Manipulate Successfully" })
  } catch (error) {
    res.status(500).json({ message: "ERRor", error: error })
  }
}
const ManipulateHandover = async (req, res) => {
  try {
    const handovers = await handoversheetModells.find();


    // change submitted by  into string object 

    for (let h of handovers) {
      if (mongoose.Types.ObjectId.isValid(h.submitted_by)) continue;

      if (typeof h.submitted_by !== "string" || h.submitted_by.trim() === "") continue;

      const submittedByName = h.submitted_by?.trim();

      if (!submittedByName) continue;

      const objectId = mongoose.Types.ObjectId.isValid(submittedByName)
        ? new mongoose.Types.ObjectId(submittedByName)
        : null;

      const user = await userModells.findOne({
        $or: [
          { name: { $regex: `^${submittedByName}`, $options: "i" } },
          ...(objectId ? [{ _id: objectId }] : [])
        ]
      }).select("_id");

      if (user) {
        await handoversheetModells.updateOne(
          { _id: h._id },
          { $set: { submitted_by: user._id } }
        )
        console.log(`Update handover ${h._id} with user ${user._id}`);
      } else {
        console.log(`No user found for handover ${h._id} with name ${submittedByName}`);
      }
    }

    for (let h of handovers) {
      if (mongoose.Types.ObjectId.isValid(h.other_details.submitted_by_BD)) continue;

      if (typeof h.other_details.submitted_by_BD !== "string" || h.other_details.submitted_by_BD.trim() === "") continue;

      const submittedByName = h.other_details.submitted_by_BD?.trim();

      if (!submittedByName) continue;

      const objectId = mongoose.Types.ObjectId.isValid(submittedByName)
        ? new mongoose.Types.ObjectId(submittedByName)
        : null;

      const user = await userModells.findOne({
        $or: [
          { name: { $regex: `^${submittedByName}`, $options: "i" } },
          ...(objectId ? [{ _id: objectId }] : [])
        ]
      }).select("_id");

      if (user) {
        await handoversheetModells.updateOne(
          { _id: h._id },
          { $set: { "other_details.submitted_by_BD": user._id } }
        )
        console.log(`Update handover Other detail ${h._id} with user ${user._id}`);
      } else {
        console.log(`No user found for handover other detail ${h._id} with name ${submittedByName}`);
      }
    }


    return res.status(200).json({ message: "Updated Successfully" })
  } catch (err) {
    console.error(err);
  }
};





module.exports = {
  createhandoversheet,
  gethandoversheetdata,
  getByIdOrLeadId,
  edithandoversheetdata,
  updatestatus,
  getexportToCsv,
  migrateProjectToHandover,
  updateAssignedTo,
  listUsersNames,
  ManipulateHandover,
  ManipulateHandoverSubmittedBy,
};
