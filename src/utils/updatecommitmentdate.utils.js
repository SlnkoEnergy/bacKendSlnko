function updateCommitmentDate(group) {
  const latestDate = group.commitment_date_history[group.commitment_date_history.length - 1];
  const {date, remarks, user_id} = latestDate;
  group.current_commitment_date = {
    date: date,
    remarks: remarks,
    user_id: user_id
  };
}

module.exports = updateCommitmentDate;
