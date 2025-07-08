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

    const relatedPOs = await PurchaseOrder.find({ pr_id: prId });

    const prDoc = await purchaseRequest.findById(prId);
    if (!prDoc || !Array.isArray(prDoc.items)) return;

    const updatedItems = prDoc.items.map((item) => {
      const poForItem = relatedPOs.filter(
        (po) => po.item && po.item.toString() === item.item_id.toString()
      );

      const itemStatuses = poForItem
        .map((po) => po?.current_status?.status || "draft");

      if (itemStatuses.length === 0) return item;

      const allSame = itemStatuses.every((status) => status === itemStatuses[0]);

      if (allSame) {
        return {
          ...item,
          status: `${itemStatuses[0]}`,
        };
      } else {
        const maxStatus = itemStatuses.reduce((a, b) =>
          statusPriority[a] >= statusPriority[b] ? a : b
        );
        return {
          ...item,
          status: `partially_${maxStatus}`,
        };
      }
    });

    // Save updated items
    prDoc.items = updatedItems;
    await prDoc.save();

    const itemLevelStatuses = updatedItems.map((item) => item.status);

    const allSame = itemLevelStatuses.every((status) => status === itemLevelStatuses[0]);

    let finalStatus;
    if (allSame) {
      finalStatus = itemLevelStatuses[0];
    } else {
      const maxStatus = itemLevelStatuses.reduce((a, b) => {
        const aPure = a.replace("partially_", "");
        const bPure = b.replace("partially_", "");
        return statusPriority[aPure] >= statusPriority[bPure] ? a : b;
      });
      finalStatus = `partially_${maxStatus.replace("partially_", "")}`;
    }

    await purchaseRequest.findByIdAndUpdate(prId, {
      status: finalStatus,
    });

  } catch (err) {
    console.error("Error updating purchaseRequest status:", err);
  }
}

module.exports = updatePurchaseRequestStatus;
