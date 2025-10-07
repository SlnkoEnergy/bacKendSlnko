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

/* ------------------- Graph helpers ------------------- */
function buildGraph(activities) {
  const byId = new Map();
  activities.forEach((a) => byId.set(String(a.activity_id), a));

  const adjOut = new Map(); // u -> [{ v, type, lag }]
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
  if (order.length !== indeg.size) return { ok: false, order };
  return { ok: true, order };
}

/* ------------------- Actual/Planned selection ------------------- */
function effectiveStart(a, useActuals) {
  return useActuals
    ? (a?.actual_start ?? a?.planned_start ?? null)
    : (a?.planned_start ?? null);
}
function effectiveFinish(a, useActuals) {
  return useActuals
    ? (a?.actual_finish ?? a?.planned_finish ?? null)
    : (a?.planned_finish ?? null);
}

/* ------------------- Constraint computation ------------------- */
function computeMinConstraints(activity, byId, { useActuals = false } = {}) {
  let minStart = null;
  let minFinish = null;
  const reasons = [];

  (activity.predecessors || []).forEach((link) => {
    const pred = byId.get(String(link.activity_id));
    if (!pred) return;

    const type = String(link.type || "FS").toUpperCase();
    const lag = Number(link.lag) || 0;

    const predStart = effectiveStart(pred, useActuals);
    const predFinish = effectiveFinish(pred, useActuals);

    const predName =
      pred?.name ||
      pred?.activity_name ||
      (pred.activity_id ? String(pred.activity_id) : "•");

    if (type === "FS") {
      // successor.start ≥ pred.finish + lag
      if (predFinish) {
        const req = addDays(predFinish, lag);
        if (!minStart || isAfter(req, minStart)) minStart = req;
        reasons.push(`FS: start ≥ finish(${predName}) + ${lag}d → ${req.toDateString()}`);
      }
    } else if (type === "SS") {
      // successor.start ≥ pred.start + lag
      if (predStart) {
        const req = addDays(predStart, lag);
        if (!minStart || isAfter(req, minStart)) minStart = req;
        reasons.push(`SS: start ≥ start(${predName}) + ${lag}d → ${req.toDateString()}`);
      }
    } else if (type === "FF") {
      // successor.finish ≥ pred.finish + lag
      if (predFinish) {
        const req = addDays(predFinish, lag);
        if (!minFinish || isAfter(req, minFinish)) minFinish = req;
        reasons.push(`FF: finish ≥ finish(${predName}) + ${lag}d → ${req.toDateString()}`);
      }
    } else if (type === "SF") {
      // successor.finish ≥ pred.start + lag
      if (predStart) {
        const req = addDays(predStart, lag);
        if (!minFinish || isAfter(req, minFinish)) minFinish = req;
        reasons.push(`SF: finish ≥ start(${predName}) + ${lag}d → ${req.toDateString()}`);
      }
    }
  });

  return { minStart, minFinish, reasons };
}

/* ------------------- Scheduling choices ------------------- */
function earliestStartGivenConstraints(dur, minStart, minFinish) {
  const d = Math.max(1, Number(dur) || 0);
  if (!d) return null;
  const fromFinish = minFinish ? addDays(minFinish, -(d - 1)) : null;

  if (minStart && fromFinish) {
    return isAfter(minStart, fromFinish) ? new Date(minStart) : new Date(fromFinish);
  }
  if (minStart) return new Date(minStart);
  if (fromFinish) return new Date(fromFinish);
  return null;
}

/* ------------------- Mirror successors from predecessors ------------------- */
function rebuildSuccessorsFromPredecessors(activities) {
  const map = new Map();
  activities.forEach((a) => map.set(String(a.activity_id), []));
  activities.forEach((a) => {
    (a.predecessors || []).forEach((p) => {
      const predId = String(p.activity_id);
      if (!map.has(predId)) return;
      const list = map.get(predId);
      if (!list.some((s) => String(s.activity_id) === String(a.activity_id))) {
        list.push({ activity_id: a.activity_id, type: p.type, lag: Number(p.lag) || 0 });
      }
    });
  });
  activities.forEach((a) => {
    a.successors = map.get(String(a.activity_id));
  });
}

/* ------------------- Forward propagation ------------------- */
function propagateForwardAdjustments(changedId, activities, { useActuals = false } = {}) {
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

      const hasActualStart = useActuals && !!succ.actual_start;
      const hasActualFinish = useActuals && !!succ.actual_finish;

      // Completed tasks do not move
      if (hasActualFinish) {
        q.push(String(v));
        return;
      }

      // Determine duration reference
      let dur =
        Number(succ.duration) ||
        durationFromStartFinish(succ.planned_start, succ.planned_finish) ||
        (hasActualStart && succ.planned_finish
          ? durationFromStartFinish(succ.actual_start, succ.planned_finish)
          : 0);
      dur = Math.max(1, Number(dur) || 0);

      const { minStart, minFinish } = computeMinConstraints(succ, byId, { useActuals });

      if (hasActualStart && !hasActualFinish) {
        // In progress: pin start to actual_start; extend finish if constraints require it
        const pinnedStart = new Date(succ.actual_start);
        const baseFinish = finishFromStartAndDuration(pinnedStart, dur);
        const desiredFinish = (minFinish && isAfter(minFinish, baseFinish)) ? new Date(minFinish) : baseFinish;

        if (!succ.planned_start || +new Date(succ.planned_start) !== +pinnedStart) {
          succ.planned_start = pinnedStart;
        }
        if (!succ.planned_finish || +new Date(succ.planned_finish) !== +desiredFinish) {
          succ.planned_finish = desiredFinish;
        }
      } else if (!hasActualStart && !hasActualFinish) {
        // Not started: move both start & finish to satisfy constraints
        const desiredStart = earliestStartGivenConstraints(dur, minStart, minFinish);
        if (desiredStart) {
          const desiredFinish = finishFromStartAndDuration(desiredStart, dur);
          if (!succ.planned_start || +new Date(succ.planned_start) !== +desiredStart) {
            succ.planned_start = desiredStart;
          }
          if (!succ.planned_finish || +new Date(succ.planned_finish) !== +desiredFinish) {
            succ.planned_finish = desiredFinish;
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
  effectiveStart,
  effectiveFinish,
  buildGraph,
  topoSort,
  earliestStartGivenConstraints,
  rebuildSuccessorsFromPredecessors,
  computeMinConstraints,
  propagateForwardAdjustments,
  durationFromStartFinish,
};
