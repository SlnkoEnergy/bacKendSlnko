const purchaseRequest = require("../Modells/PurchaseRequest/purchaseRequest");

const statusPriority = {
  draft: 0,
  out_for_delivery: 1,
  delivered: 2,
};

async function updatePurchaseRequestStatus(
  doc,
  statusHistoryKey = "status_history",
  currentStatusKey = "current_status"
) {
  if (!doc) return;

  const history = doc[statusHistoryKey];
  if (history && history.length > 0) {
    doc[currentStatusKey] = history[history.length - 1];
  } else {
    doc[currentStatusKey] = {
      status: "draft",
      remarks: "",
      user_id: null,
    };
  }

  const prId = doc.pr_id;
  if (!prId) return;

  try {
    const PurchaseOrder = require("../Modells/purchaseOrderModells");

    // Fetch all related POs for the given PR
    const relatedPOs = await PurchaseOrder.find({ pr_id: prId });

    const prDoc = await purchaseRequest.findById(prId);
    if (prDoc && Array.isArray(prDoc.items)) {
      const updatedItems = prDoc.items.map((item) => {
        const poForItem = relatedPOs.filter(
          (po) => po.item && po.item.toString() === item.item_id.toString()
        );

        if (poForItem.length > 0) {
          const itemStatuses = poForItem
            .map((po) => po.current_status?.status)
            .filter(Boolean);

          const allSame = itemStatuses.every(
            (status) => status === itemStatuses[0]
          );

          if (allSame) {
            return {
              ...item,
              status: `${itemStatuses[0]}`,
            };
          } else {
            const maxStatus = itemStatuses.reduce((a, b) =>
              statusPriority[a] > statusPriority[b] ? a : b
            );
            return {
              ...item,
              status: `partially_${maxStatus}`,
            };
          }
        }

        return item;
      });

      prDoc.items = updatedItems;
      await prDoc.save();
    }

    const statuses = relatedPOs
      .map((po) => po.current_status?.status)
      .filter(Boolean);

    const allSame = statuses.every((status) => status === statuses[0]);

    const finalStatus = allSame
      ? `${statuses[0]}`
      : `partially_${statuses.reduce((a, b) =>
          statusPriority[a] > statusPriority[b] ? a : b
        )}`;

    await purchaseRequest.findByIdAndUpdate(prId, {
      status: finalStatus,
    });

  } catch (err) {
    console.error("Error updating purchaseRequest status:", err);
  }
}

module.exports = updatePurchaseRequestStatus;
