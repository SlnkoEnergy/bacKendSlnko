function addDays(date, days) {
  if (!date) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (Number(days) || 0));
  return d;
}
function isBefore(a, b) {
  return a && b && new Date(a).getTime() < new Date(b).getTime();
}
function isAfter(a, b) {
  return a && b && new Date(a).getTime() > new Date(b).getTime();
}

function finishFromStartAndDuration(start, duration) {
  const d = Math.max(1, Number(duration) || 0);
  return addDays(start, d - 1);
}
function durationFromStartFinish(start, finish) {
  if (!start || !finish) return 0;
  const s = new Date(start);
  const f = new Date(finish);
  s.setHours(0, 0, 0, 0);
  f.setHours(0, 0, 0, 0);
  const ms = f.getTime() - s.getTime();
  return ms < 0 ? 0 : Math.floor(ms / 86400000) + 1;
}

/** ----------------- Graph helpers ----------------- */
function buildGraph(activities) {
  const byId = new Map();
  activities.forEach((a) => {
    byId.set(String(a.activity_id), a);
  });

  const adjOut = new Map(); // u -> [{v, type, lag}]
  const indeg = new Map();
  activities.forEach((a) => {
    const u = String(a.activity_id);
    indeg.set(u, 0);
    adjOut.set(u, []);
  });

  activities.forEach((a) => {
    const v = String(a.activity_id);
    (a.predecessors || []).forEach((p) => {
      const u = String(p.activity_id);
      if (!byId.has(u)) return;
      adjOut.get(u).push({ v, type: p.type, lag: Number(p.lag) || 0 });
      indeg.set(v, (indeg.get(v) || 0) + 1);
    });
  });

  return { adjOut, indeg, byId };
}
/** Kahn topo sort + cycle detection */
function topoSort(activities) {
  const { adjOut, indeg } = buildGraph(activities);
  const q = [];
  indeg.forEach((deg, node) => {
    if (deg === 0) q.push(node);
  });
  const order = [];
  while (q.length) {
    const u = q.shift();
    order.push(u);
    (adjOut.get(u) || []).forEach(({ v }) => {
      indeg.set(v, indeg.get(v) - 1);
      if (indeg.get(v) === 0) q.push(v);
    });
  }
  const total = indeg.size;
  if (order.length !== total) {
    return { ok: false, order };
  }
  return { ok: true, order };
}

function computeMinConstraints(activity, byId) {
  let minStart = null;
  let minFinish = null;
  const reasons = [];

  (activity.predecessors || []).forEach((link) => {
    const pred = byId.get(String(link.activity_id));
    if (!pred) return;
    const type = String(link.type || "FS").toUpperCase();
    const lag = Number(link.lag) || 0;
    const predName =
      pred?.name ||
      pred?.activity_name ||
      (pred.activity_id ? String(pred.activity_id) : "•");

    if (type === "FS") {
      // successor.start >= pred.finish + lag
      if (pred.planned_finish) {
        const req = addDays(pred.planned_finish, lag);
        if (!minStart || isAfter(req, minStart)) minStart = req;
        reasons.push(
          `FS: start ≥ finish(${predName}) + ${lag}d → ${req.toDateString()}`
        );
      }
    } else if (type === "SS") {
      // successor.start >= pred.start + lag
      if (pred.planned_start) {
        const req = addDays(pred.planned_start, lag);
        if (!minStart || isAfter(req, minStart)) minStart = req;
        reasons.push(
          `SS: start ≥ start(${predName}) + ${lag}d → ${req.toDateString()}`
        );
      }
    } else if (type === "FF") {
      // successor.finish >= pred.finish + lag
      if (pred.planned_finish) {
        const req = addDays(pred.planned_finish, lag);
        if (!minFinish || isAfter(req, minFinish)) minFinish = req;
        reasons.push(
          `FF: finish ≥ finish(${predName}) + ${lag}d → ${req.toDateString()}`
        );
      }
    }
  });

  return { minStart, minFinish, reasons };
}

/** Rebuild successors from predecessors (mirror) */
function rebuildSuccessorsFromPredecessors(activities) {
  const map = new Map();
  activities.forEach((a) => map.set(String(a.activity_id), []));
  activities.forEach((a) => {
    (a.predecessors || []).forEach((p) => {
      const predId = String(p.activity_id);
      if (!map.has(predId)) return;
      const list = map.get(predId);
      if (!list.some((s) => String(s.activity_id) === String(a.activity_id))) {
        list.push({
          activity_id: a.activity_id,
          type: p.type,
          lag: Number(p.lag) || 0,
        });
      }
    });
  });
  activities.forEach((a) => {
    a.successors = map.get(String(a.activity_id));
  });
}

function earliestStartGivenConstraints(dur, minStart, minFinish) {
  const d = Math.max(1, Number(dur) || 0);
  if (!d) return null;
  const needStartFromFinish = minFinish ? addDays(minFinish, -(d - 1)) : null;

  if (minStart && needStartFromFinish) {
    return isAfter(minStart, needStartFromFinish)
      ? new Date(minStart)
      : new Date(needStartFromFinish);
  }
  if (minStart) return new Date(minStart);
  if (needStartFromFinish) return new Date(needStartFromFinish);
  return null;
}

function propagateForwardAdjustments(changedId, activities) {
  const { adjOut, byId } = buildGraph(activities);
  const seen = new Set();
  const q = [String(changedId)];

  while (q.length) {
    const u = q.shift();
    if (seen.has(u)) continue;
    seen.add(u);

    const out = adjOut.get(u) || [];
    out.forEach(({ v }) => {
      const succ = byId.get(String(v));
      if (!succ) return;

      const hasBoth =
        !!succ.planned_start &&
        !!succ.planned_finish &&
        !isNaN(new Date(succ.planned_start)) &&
        !isNaN(new Date(succ.planned_finish));

      if (hasBoth) {
        const dur =
          Number(succ.duration) ||
          durationFromStartFinish(succ.planned_start, succ.planned_finish);
        if (dur > 0) {
          const { minStart, minFinish } = computeMinConstraints(succ, byId);
          const desiredStart = earliestStartGivenConstraints(
            dur,
            minStart,
            minFinish
          );

          if (desiredStart) {
            const desiredFinish = finishFromStartAndDuration(desiredStart, dur);

            const curStart = new Date(succ.planned_start);
            const curFinish = new Date(succ.planned_finish);
            curStart.setHours(0, 0, 0, 0);
            curFinish.setHours(0, 0, 0, 0);

            if (
              curStart.getTime() !== desiredStart.getTime() ||
              curFinish.getTime() !== desiredFinish.getTime()
            ) {
              succ.planned_start = desiredStart;
              succ.planned_finish = desiredFinish;
            }
          }
        }
      }

      q.push(String(v));
    });
  }
}

module.exports = {
  addDays,
  isBefore,
  isAfter,
  finishFromStartAndDuration,
  buildGraph,
  topoSort,
  earliestStartGivenConstraints,
  rebuildSuccessorsFromPredecessors,
  computeMinConstraints,
  propagateForwardAdjustments,
  durationFromStartFinish,
};
