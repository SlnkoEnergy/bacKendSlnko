function getComputedLeadFieldsPipeline() {
  return [
    {
      $lookup: {
        from: "handoversheets",
        let: { leadId: "$id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [
                  { $trim: { input: { $toString: "$id" } } },
                  { $trim: { input: { $toString: "$$leadId" } } },
                ],
              },
            },
          },
          { $project: { _id: 1, status_of_handoversheet: 1 } },
        ],
        as: "handover_info",
      },
    },
    {
      $addFields: {
        handover_status: {
          $cond: [
            { $gt: [{ $size: "$handover_info" }, 0] },
            {
              $switch: {
                branches: [
                  {
                    case: {
                      $eq: [
                        {
                          $toLower: {
                            $getField: {
                              field: "status_of_handoversheet",
                              input: { $arrayElemAt: ["$handover_info", 0] },
                            },
                          },
                        },
                        "draft",
                      ],
                    },
                    then: "in process",
                  },
                  {
                    case: {
                      $eq: [
                        {
                          $toLower: {
                            $getField: {
                              field: "status_of_handoversheet",
                              input: { $arrayElemAt: ["$handover_info", 0] },
                            },
                          },
                        },
                        "submitted",
                      ],
                    },
                    then: "completed",
                  },
                  {
                    case: {
                      $eq: [
                        {
                          $toLower: {
                            $getField: {
                              field: "status_of_handoversheet",
                              input: { $arrayElemAt: ["$handover_info", 0] },
                            },
                          },
                        },
                        "rejected",
                      ],
                    },
                    then: "rejected",
                  },
                ],
                default: "unknown",
              },
            },
            "pending",
          ],
        },
      },
    },
  ];
}
module.exports = getComputedLeadFieldsPipeline;