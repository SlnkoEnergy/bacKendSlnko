// controllers/customerSummary.controller.js
const mongoose = require("mongoose");

// === MODELS (your exact filenames) ===
const CustomerSummary = require("../models/customerSummary.model");
const ProjectDetail = require("../models/project.model");

const AddMoney = require("../models/addMoneyModells");                 // credits by p_id
const SubtractMoney = require("../models/debitMoneyModells");          // debits by p_id
const AdjustmentRequest = require("../models/adjustmentRequestModells"); // adjustments by p_id
const PayRequest = require("../models/payRequestModells");             // pay requests by p_id
const PurchaseOrder = require("../models/purchaseorder.model");        // purchase orders by code

// -------------------- mappers (ONLY fields present in customerSummary schema) --------------------
// ---------- helpers ----------
const isOid = (v) => mongoose.isValidObjectId(v);
const asOidOrNull = (v) => (isOid(v) ? new mongoose.Types.ObjectId(v) : null);
const num = (v, d = 0) => (v == null || v === "" || isNaN(Number(v)) ? d : Number(v));

// ---------- mappers (schema-safe) ----------
function mapCredits(rows = []) {
  return rows.map((c) => ({
    cr_amount: num(c?.cr_amount),
    cr_date: c?.cr_date || null,
    submitted_by: asOidOrNull(c?.submitted_by), // <-- sanitize
    comment: c?.comment || "",
    cr_mode: c?.cr_mode || "",
  }));
}

function mapDebits(rows = []) {
  return rows.map((d) => ({
    dbt_date: d?.dbt_date || null,
    amount_paid: num(d?.amount_paid),
    vendor: d?.vendor || "",
    paid_for: d?.paid_for || "",
    submitted_by: asOidOrNull(d?.submitted_by),       // <-- sanitize
    comment: d?.comment || "",
    pay_type: d?.pay_type || "",
    utr: d?.utr || "",
    other: d?.other || "",
    utr_submitted_by: asOidOrNull(d?.utr_submitted_by), // <-- sanitize
    po_number: d?.po_number || "",
  }));
}

// Pay requests folded into debit[] — keep only schema fields
function mapPayRequestsAsDebits(rows = []) {
  return rows.map((r) => ({
    dbt_date: r?.dbt_date || null,
    amount_paid: num(r?.amount_paid),
    vendor: r?.vendor || "",
    paid_for: r?.paid_for || "",
    submitted_by: asOidOrNull(r?.submitted_by),         // <-- sanitize
    comment: r?.comment || "",
    pay_type: r?.pay_type || "",
    utr: r?.utr || "",
    other: r?.other || "",
    utr_submitted_by: asOidOrNull(r?.utr_submitted_by), // <-- sanitize
    po_number: r?.po_number || "",
  }));
}

function mapAdjustments(rows = []) {
  return rows.map((a) => ({
    pay_id: String(a?.pay_id ?? ""),
    cr_id: String(a?.cr_id ?? ""),
    pay_type: a?.pay_type || "",
    amount_paid: num(a?.amount_paid),
    dbt_date: a?.dbt_date || null,
    paid_for: a?.paid_for || "",
    vendor: a?.vendor || "",
    po_number: a?.po_number || "",
    po_value: num(a?.po_value),
    adj_type: a?.adj_type || "",
    adj_amount: num(a?.adj_amount),
    remark: a?.remark || "",
    adj_date: a?.adj_date || null,
    submitted_by: asOidOrNull(a?.submitted_by),          // <-- sanitize
    comment: a?.comment || "",
  }));
}

function mapPurchaseOrders(rows = []) {
  return rows.map((p) => ({
    po_number: p?.po_number || "",
    po_value: num(p?.po_value),
    submitted_by: asOidOrNull(p?.submitted_by),          // <-- sanitize
    paid_for: p?.paid_for || "",
    vendor: typeof p?.vendor === "string"
      ? p.vendor
      : (p?.vendor?.name || p?.vendor || ""),            // <-- fix: use p, not r
    item: (p?.item || []).map((it) => ({
      category: asOidOrNull(it?.category),               // <-- sanitize
      category_name: it?.category_name || "",
      product_name: it?.product_name || "",
      product_make: it?.product_make || "",
      uom: it?.uom || "",
      quantity: String(it?.quantity ?? ""),
      cost: String(it?.cost ?? it?.rate ?? ""),
      gst_percent: String(it?.gst_percent ?? ""),
      description: it?.description || "",
    })),
    other: p?.other || "",
    amount_paid: num(p?.amount_paid),
    po_basic: String(p?.po_basic ?? ""),
    gst: String(p?.gst ?? ""),
    remarks: p?.remarks || "",
    isSales: Boolean(p?.isSales ?? false),
    total_billed: String(p?.total_billed ?? "0"),
  }));
}


// -------------------- build one project doc using your joining rules --------------------
async function buildSummaryForProject(project) {
  const projPid = project?.p_id; // join-key for money tables
  const projCode = project?.code || projPid;
  if (!projPid) throw new Error("Project missing p_id");

  const [creditsRaw, debitsRaw, adjustmentsRaw, payReqsRaw, posRaw] = await Promise.all([
    AddMoney.find({ p_id: projPid }).lean(),
    SubtractMoney.find({ p_id: projPid }).lean(),
    AdjustmentRequest.find({ p_id: projPid }).lean(),
    PayRequest.find({ p_id: projPid }).lean(),
    PurchaseOrder.find({ code: projCode }).lean(), // strictly by code
  ]);

  const credit = mapCredits(creditsRaw);
  const debit = [...mapDebits(debitsRaw), ...mapPayRequestsAsDebits(payReqsRaw)];
  const adjustment = mapAdjustments(adjustmentsRaw);
  const purchaseOrder = mapPurchaseOrders(posRaw);

  return {
    project_id: project._id,
    credit,
    debit,
    purchaseOrder,
    salesOrder: [],     // untouched per your request
    adjustment,
    isDeleted: false,
  };
}

// -------------------- basic concurrency helper (no deps) --------------------
async function runWithConcurrency(items, limit, worker) {
  const out = [];
  let i = 0, active = 0;

  return new Promise((resolve) => {
    const next = () => {
      if (i >= items.length && active === 0) return resolve(out);
      while (active < limit && i < items.length) {
        const idx = i++;
        active++;
        Promise.resolve(worker(items[idx], idx))
          .then((r) => { out[idx] = { ok: true, r }; })
          .catch((e) => { out[idx] = { ok: false, e: String(e?.message || e) }; })
          .finally(() => { active--; next(); });
      }
    };
    next();
  });
}

// -------------------- PUBLIC: POST /customer-summary/sync-all --------------------
exports.syncAllCustomerSummaries = async (req, res) => {
  try {
    const { project_ids, concurrency = 6, dryRun = false } = req.body || {};

    let projectQuery = {};
    if (Array.isArray(project_ids) && project_ids.length) {
      const ids = project_ids
        .map((x) => { try { return new mongoose.Types.ObjectId(x); } catch { return null; } })
        .filter(Boolean);
      projectQuery = { _id: { $in: ids } };
    }

    const projects = await ProjectDetail.find(projectQuery, { _id: 1, p_id: 1, project_code: 1 }).lean();
    if (!projects?.length) {
      return res.status(404).json({ message: "No projects found." });
    }

    const worker = async (project) => {
      const doc = await buildSummaryForProject(project);
      if (dryRun) {
        return { project_id: project._id, p_id: project.p_id, skippedWrite: true };
      }
      const saved = await CustomerSummary.findOneAndUpdate(
        { project_id: doc.project_id },
        { $set: doc },
        { new: true, upsert: true }
      ).lean();
      return { project_id: project._id, p_id: project.p_id, summary_id: saved?._id || null };
    };

    const results = await runWithConcurrency(projects, Math.max(1, Number(concurrency) || 6), worker);

    // Minimal response (no counts)
    const processed = results.map((r, i) => ({
      project_id: projects[i]._id,
      p_id: projects[i].p_id,
      ...(r?.ok ? r.r : { error: r?.e || "Unknown error" }),
    }));

    return res.status(200).json({
      message: "Customer summaries synced.",
      processed,
    });
  } catch (err) {
    console.error("[SYNC-ALL][ERROR]", err);
    return res.status(500).json({ message: "Failed to sync all customer summaries.", error: String(err?.message || err) });
  }
};
