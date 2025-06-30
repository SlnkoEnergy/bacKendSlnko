const createDpr = async (req, res) => {
  try {
    const { dprData } = req.body;
    if (!dprData) {
      return res.status(400).json({ message: "DPR data is required" });
    }
    await DPR.create(dprData);
    return res.status(201).json({ message: "DPR created successfully" });
  } catch (error) {
    console.error("Error creating DPR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  createDpr,
};
