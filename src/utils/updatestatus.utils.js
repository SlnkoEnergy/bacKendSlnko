function updateStatus(group, defaultStatus) {
    if (!group.status_history || group.status_history.length === 0) {
        group.current_status = {
            status: defaultStatus,
            user_id: null,
            remarks: null,
        };
        return;
    }
    const latestStatus = group.status_history[group.status_history.length - 1];
    console.log({latestStatus})
    const { user_id, status, remarks } = latestStatus;
    group.current_status = {
        user_id: user_id,
        status: status || null,
        remarks: remarks,
    };
}

module.exports = updateStatus;
