const cron = require('node-cron');
const projectModel = require('../../models/project.model');

cron.schedule('0 0 * * *', async () => {
  try {
    const projects = await projectModel.find({});
    for (const project of projects) {
      const dates = [
        project.project_completion_date,
        project.bd_commitment_date,
        project.completion_date,
      ].filter(Boolean);

      if (dates.length === 0) continue;

      const minDate = new Date(Math.min(...dates.map(d => new Date(d).getTime())));
      const today = new Date();
      const remainingDays = Math.ceil((minDate - today) / (1000 * 60 * 60 * 24));

      await projectModel.findByIdAndUpdate(project._id, { remaining_days: remainingDays });
    }
  } catch (err) {
    console.error('Error in project deadline cron:', err);
  }
});