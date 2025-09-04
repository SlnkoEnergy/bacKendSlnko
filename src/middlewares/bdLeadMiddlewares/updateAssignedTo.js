function updateAssignedTo(lead){
    if(!lead.assigned_to || lead.assigned_to.length === 0) return;
    const latestAssigned = lead.assigned_to[lead.assigned_to.length - 1];
    const {user_id, status} = latestAssigned;
    lead.current_assigned = {
        user_id: user_id,
        status: status || null
    };
};

module.exports = updateAssignedTo