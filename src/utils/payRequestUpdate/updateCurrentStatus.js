function updateCurrentStatus(doc) {
  if (!doc) return;

  // ---------- approval_status sync ----------
  const history = Array.isArray(doc.status_history) ? doc.status_history : [];
  const lastStatus = history[history.length - 1];

  if (lastStatus) {
    doc.approval_status = {
      stage: lastStatus.stage,
      remarks: lastStatus.remarks || "",
      user_id: lastStatus.user_id || null,
      timestamp: lastStatus.timestamp || new Date(),
    };
  } else {
    const defaultStage = doc.credit?.credit_deadline
      ? "Credit Pending"
      : "Draft";
    doc.approval_status = {
      stage: defaultStage,
      remarks: "",
      user_id: null,
      timestamp: new Date(),
    };
  }

  // ---------- UTR history logic ----------
  if (!Array.isArray(doc.utr_history)) doc.utr_history = [];

  const newUtr = doc.utr || "";
  const prevUtr =
    doc.utr_history.length > 0
      ? doc.utr_history[doc.utr_history.length - 1].utr || ""
      : "";

  // A) New document
  if (doc.isNew) {
    if (newUtr) {
      doc.utr_history.push({
        utr: newUtr,
        user_id:
          (doc.$locals && doc.$locals.actorId) ||
          doc.approval_status?.user_id ||
          null,
        status: "Created",
        timestamp: new Date(),
      });
    }
    return;
  }


  const utrChanged =
    typeof doc.isModified === "function" ? doc.isModified("utr") : false;

  
  if (!utrChanged && newUtr && !prevUtr) {
    doc.utr_history.push({
      utr: newUtr,
      user_id:
        (doc.$locals && doc.$locals.actorId) ||
        doc.approval_status?.user_id ||
        null,
      status: "Created",
      timestamp: new Date(),
    });
    return;
  }

  if (!utrChanged) return;

  let status = null;
  if (newUtr && !prevUtr) status = "Created";
  else if (!newUtr && prevUtr) status = "Cleared";
  else if (newUtr && prevUtr && newUtr !== prevUtr) status = "Updated";

  if (status) {
    doc.utr_history.push({
      utr: newUtr,
      user_id:
        (doc.$locals && doc.$locals.actorId) ||
        doc.approval_status?.user_id ||
        null,
      status,
      timestamp: new Date(),
    });
  }
}

module.exports = updateCurrentStatus;
