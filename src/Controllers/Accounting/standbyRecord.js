const holdpayModells = require("../../Modells/holdPaymentModells");

const standbyRecord = async function (req, res) {
   try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;
    const searchTerm = (req.query.search || "").trim().toLowerCase();

    // Build the $match filter
    const matchFilter = { approved: "Pending" };
    const searchFilters = [];
    if (searchTerm) {
      const regex = new RegExp(searchTerm, "i");
      searchFilters.push({ pay_id: regex }, { "projectData.customer": regex });
    }

    // Aggregation pipeline
    const pipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "projectData",
        },
      },
      { $unwind: { path: "$projectData", preserveNullAndEmptyArrays: true } },
      ...(searchFilters.length ? [{ $match: { $or: searchFilters } }] : []),
      { $sort: { dbt_date: -1 } },
      {
        $facet: {
          paginatedResults: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "total" }],
        },
      },
      {
        $project: {
          data: "$paginatedResults",
          total: { $ifNull: [{ $arrayElemAt: ["$totalCount.total", 0] }, 0] },
        },
      },
    ];

    const [aggResult] = await holdpayModells.aggregate(pipeline).exec();
    const total = aggResult.total;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: aggResult.data.map(doc => ({
        pay_id: doc.pay_id,
        request_Date: doc.created_on,
        paid_to: doc.benificiary,
        Client_Name: doc.projectData?.customer || null,
        amount: doc.amount_paid,
        utr: doc.utr,
        dbt_date: doc.dbt_date,
      })),
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching standby records",
      error: error.message,
    });
  }
};

module.exports = { standbyRecord };
