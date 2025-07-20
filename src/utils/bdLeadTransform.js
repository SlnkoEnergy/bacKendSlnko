async function transformAndSaveOldLead(oldLead) {
  const User = require("../Modells/userModells");
  const NewBDLead = require("../Modells/bdleads/bdleadsModells");

  const submittedUser = await User.findOne({ name: oldLead.submitted_by });
  const submittedUserId = submittedUser?._id || null;

  const timestamp = oldLead.createdAt || new Date();

  const newLead = new NewBDLead({
    id: oldLead.id,
    name: oldLead.c_name,
    company_name: oldLead.company,
    contact_details: {
      email: oldLead.email,
      mobile: [oldLead.mobile, oldLead.alt_mobile].filter(Boolean),
    },
    group: oldLead.group,
    address: {
      village: oldLead.village,
      district: oldLead.district,
      state: oldLead.state,
    },
    project_details: {
      capacity: oldLead.capacity,
      distance_from_substation: {
        unit: "km",
        value: oldLead.distance,
      },
      available_land: {
        unit: "km",
        value: oldLead.land?.available_land || "",
      },
      tarrif: oldLead.tarrif,
      land_type: oldLead.land?.land_type || "",
      scheme: oldLead.scheme,
    },
    source: {
      from: oldLead.source,
      sub_source: oldLead.reffered_by,
    },
    comments: oldLead.comment || " ",
    createdAt: timestamp,
    updatedAt: timestamp,

    status_history: [
      {
        name: "dead",
        stage: "",
        remarks: "",
        user_id: submittedUserId,
        updatedAt: timestamp,
      },
    ],
    current_status: {
      name: "dead",
      stage: "",
      remarks: "",
      user_id: submittedUserId,
    },
    assigned_to: [
      {
        user_id: submittedUserId,
        status: "dead",
      },
    ],
    current_assigned:{
      user_id: submittedUserId,
      status: "dead"
    },
    submitted_by: submittedUserId,
  });

  return await newLead.save({ timestamps: false });
}

module.exports = transformAndSaveOldLead;