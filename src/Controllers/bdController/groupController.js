const group = require("../../Modells/bdleads/group");

const createGroup = async (req, res) => {
  try {
    const { data } = req.body;
    const user_id = req.user.userId;
    const requiredFields = [
      "name",
      "contact_details.mobile",
      "address.village",
      "address.district",
      "address.state",
      "project_details.capacity",
      "source.from",
      "source.sub_source",
    ];

    const isMissing = requiredFields.some((path) => {
      const keys = path.split(".");
      let current = data;
      for (const key of keys) {
        current = current?.[key];
        if (!current) return true;
      }
      return false;
    });

    if (isMissing) {
      return res
        .status(400)
        .json({ error: "Please fill all required fields." });
    }

    const lastLead = await group.aggregate([
      { $match: { id: { $regex: /^BD\/Lead\// } } },
      {
        $addFields: {
          numericId: {
            $toInt: { $arrayElemAt: [{ $split: ["$id", "/"] }, -1] },
          },
        },
      },
      { $sort: { numericId: -1 } },
      { $limit: 1 },
    ]);

    const lastNumber = lastLead?.[0]?.numericId || 0;
    const nextId = `BD/Group/${lastNumber + 1}`;

    const payload = {
      ...data,
      group_code: nextId,
      createdBy: user_id,
    };

    const groupData = new group(payload);
    await groupData.save();
    res.status(200).json({
      message: "Group created successfully",
      data: groupData,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Something went wrong" });
  }
};

module.exports = {
  createGroup,
};
