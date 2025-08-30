const toNum = (v) => (v == null || v === "" ? 0 : Number(v));
const toStr = (v) => (v == null ? "" : String(v));
const isRC = (txt) => typeof txt === "string" && /\(RC\)/i.test(txt);

const safeDateYMD = (dt) => {
  if (!dt) return null;
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const inferTypeFromName = (name) => {
  const n = (name || "").toLowerCase();
  const executionHints = [
    "erection",
    "installation",
    "commissioning",
    "services",
    "civil",
    "work",
    "execution",
    "labour",
    "manpower",
    "piling",
  ];
  return executionHints.some((w) => n.includes(w)) ? "execution" : "supply";
};

const buildCategoryCode = (name) => {
  const base = toStr(name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "CAT-" + Math.random().toString(36).slice(2, 8).toUpperCase();
};

async function ensureCategory(itemCategoryName, CatModel) {
  const name = toStr(itemCategoryName).trim();
  if (!name) return null;

  let cat = await CatModel.findOne({ name: new RegExp(`^${name}$`, "i") });
  if (cat) return cat;

  const type = inferTypeFromName(name);
  let code = buildCategoryCode(name);

  let suffix = 1;
  while (await CatModel.exists({ category_code: code })) {
    code = `${buildCategoryCode(name)}-${suffix++}`;
  }

  const created = await CatModel.create({
    name,
    description: name,
    type,
    category_code: code,
    status: "inactive", 
    fields: [],
  });

  return created;
}

async function upsertOdooPO(odooPo, PoModel, CatModel) {
  const po_number = toStr(odooPo?.po_number).trim();
  if (!po_number) {
    return { updated: false, reason: "Missing po_number in Odoo payload" };
  }

  const existing = await PoModel.findOne({ po_number }).lean();
  if (!existing) {
    return { updated: false, reason: "PO not found by po_number; ignored" };
  }

  // ensure category
  let categoryDoc = null;
  try {
    categoryDoc = await ensureCategory(odooPo?.item_category, CatModel);
  } catch (e) {
    console.error("Category ensure failed:", e?.message || e);
  }

  const basic_po_value = toNum(odooPo?.basic_po_value);
  const total_gst = toNum(odooPo?.total_gst);
  const rc = isRC(odooPo?.total_tax);

  const computed_po_value = rc ? basic_po_value : basic_po_value + total_gst;
  const po_basic_str = toStr(basic_po_value);
  const gst_str = rc ? "0" : toStr(total_gst);

  const order_lines = Array.isArray(odooPo?.order_lines)
    ? odooPo.order_lines
    : [];

  const mappedLines = order_lines.map((ln) => {
    const productName =
      (Array.isArray(ln?.product_id) ? ln.product_id[1] : null) ||
      toStr(ln?.name) ||
      "";

    return {
      category: categoryDoc ? categoryDoc._id : undefined, // ✅ only ObjectId
      product_name: productName,
      quantity: toStr(ln?.product_qty),
      cost: toStr(ln?.price_unit),
      gst_percent: rc ? "0" : toStr(ln?.tax_percent),
      description: toStr(ln?.name),
    };
  });

  const $set = {
    po_basic: po_basic_str,
    gst: gst_str,
    po_value: computed_po_value,
    item: mappedLines,
    date: safeDateYMD(odooPo?.po_date) || existing.date,
    total_tax_percent: rc ? 0 : toNum(odooPo?.total_tax_percent),
    updatedAt: new Date(),
  };

  const res = await PoModel.updateOne({ _id: existing._id }, { $set });
  return { updated: res.modifiedCount > 0, _id: String(existing._id) };
}

async function bulkUpsertOdooPOs(odooPOs, PoModel, CatModel) {
  const results = [];
  for (const po of odooPOs) {
    try {
      const result = await upsertOdooPO(po, PoModel, CatModel);
      results.push({ po_number: po.po_number, ...result });
    } catch (err) {
      console.error("Error ingesting PO:", po.po_number, err?.message || err);
      results.push({
        po_number: po.po_number,
        updated: false,
        reason: "Internal error",
      });
    }
  }
  return results;
}

module.exports = {
  upsertOdooPO,
  bulkUpsertOdooPOs,
};
