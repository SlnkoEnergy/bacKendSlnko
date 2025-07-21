function  updateCurrentStatus(lead) {
    if (!lead.status_history || lead.status_history.length === 0) return;
    const latestStatus = lead.status_history[lead.status_history.length - 1];
    const { name, stage, remarks } = latestStatus;
    let derivedStatus = "dead";
    if(name){
      derivedStatus = name;
    }
    if (!stage || stage.trim() === "") {
      derivedStatus = "initial";
    } else if (stage === "loi") {
      derivedStatus = "follow up";
    } else if (stage === "token money") {
      derivedStatus = "won";
    }
    else if(stage === "ppa" || stage === "loa"){
      derivedStatus = "warm";
    }
    if(name){
      lead.current_status = {
        name:derivedStatus,
        stage: "as per choice" || null,
        remarks: remarks
      }
      return;
    } 
    lead.current_status = {
      name: derivedStatus,
      stage: stage || null,
      remarks: remarks
    };
};

module.exports = updateCurrentStatus;
