// updateCurrentStatus.js

function updateCurrentStatus(lead) {
  if (!lead.status_history || lead.status_history.length === 0) return;

  const latestStatus = lead.status_history[lead.status_history.length - 1];
  const { stage, documents = [] } = latestStatus;

  let derivedStatus = "Dead";

  if (!stage || stage.trim() === "") {
    derivedStatus = "Initial";
  } else if (stage === "LOI") {
    derivedStatus = "Follow Up";
  } else if (stage === "Token Money") {
    derivedStatus = "Won";
  } else if (documents.some(doc => /LOA|PPA/i.test(doc))) {
      derivedStatus = "Warm";

  }

  lead.current_status = {
    name: derivedStatus,
    stage: stage || null
  };
}

module.exports = updateCurrentStatus;
