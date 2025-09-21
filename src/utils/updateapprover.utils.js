function updateApprover(approval) {
  if (approval.approvers && approval.approvers.length > 0) {
    // Sort approvers by sequence to ensure correct order
    approval.approvers.sort((a, b) => a.sequence - b.sequence);
    const nextApprover = approval.approvers.find(
      (approver) =>
        approver.status === "pending" || approver.status === "rejected"
    );
    if (nextApprover) {
      approval.current_approver = nextApprover;
    } else {
      // All approvers have approved
      approval.current_approver = null;
    }
  } else {
    approval.current_approver = null;
  }
}

module.exports = updateApprover;
