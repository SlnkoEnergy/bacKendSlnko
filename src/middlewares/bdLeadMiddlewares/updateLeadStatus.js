function  updateCurrentStatus(lead) {
    if (!lead.status_history || lead.status_history.length === 0) return;
    const latestStatus = lead.status_history[lead.status_history.length - 1];
    const { stage, remarks } = latestStatus;
    let derivedStatus = "Dead";
    if (!stage || stage.trim() === "") {
      derivedStatus = "Initial";
    } else if (stage === "LOI") {
      derivedStatus = "Follow Up";
    } else if (stage === "Token Money") {
      derivedStatus = "Won";
    } 
    lead.current_status = {
      name: derivedStatus,
      stage: stage || null,
      remarks: remarks
    };
};

module.exports = updateCurrentStatus;
