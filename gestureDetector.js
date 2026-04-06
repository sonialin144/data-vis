(() => {
  const DEFAULTS = {
    minVisibility: 0.5,
    maxWindowMs: 2600,
    minHistoryPoints: 8,
    angleCoverageThreshold: 4.6, // ~264 degrees
    radialVarianceMin: 0.12,
    radialVarianceMax: 0.85,
    overlapWindowMs: 1100,
    triggerCooldownMs: 2800,
  };

  function normalizeAngleDelta(delta) {
    let d = delta;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  class ArmCircleDetector {
    constructor(config = {}) {
      this.cfg = { ...DEFAULTS, ...config };
      this.leftSamples = [];
      this.rightSamples = [];
      this.lastTriggerMs = 0;
      this.latestMetrics = {
        leftCoverage: 0,
        rightCoverage: 0,
        leftRadiusVar: 0,
        rightRadiusVar: 0,
        tracking: false,
      };
    }

    prune(samples, nowMs) {
      const minTs = nowMs - this.cfg.maxWindowMs;
      while (samples.length && samples[0].ts < minTs) {
        samples.shift();
      }
    }

    addSample(side, sample) {
      const target = side === "left" ? this.leftSamples : this.rightSamples;
      target.push(sample);
      this.prune(target, sample.ts);
    }

    updatePose(landmarks, nowMs) {
      if (!Array.isArray(landmarks) || landmarks.length < 17) {
        this.latestMetrics.tracking = false;
        return;
      }
      const ls = landmarks[11];
      const rs = landmarks[12];
      const lw = landmarks[15];
      const rw = landmarks[16];
      if (!ls || !rs || !lw || !rw) {
        this.latestMetrics.tracking = false;
        return;
      }

      const v = (p) => Number(p.visibility ?? 1);
      if (
        v(ls) < this.cfg.minVisibility ||
        v(rs) < this.cfg.minVisibility ||
        v(lw) < this.cfg.minVisibility ||
        v(rw) < this.cfg.minVisibility
      ) {
        this.latestMetrics.tracking = false;
        return;
      }

      this.latestMetrics.tracking = true;

      const leftDx = lw.x - ls.x;
      const leftDy = lw.y - ls.y;
      const rightDx = rw.x - rs.x;
      const rightDy = rw.y - rs.y;

      this.addSample("left", {
        ts: nowMs,
        angle: Math.atan2(leftDy, leftDx),
        radius: Math.hypot(leftDx, leftDy),
      });
      this.addSample("right", {
        ts: nowMs,
        angle: Math.atan2(rightDy, rightDx),
        radius: Math.hypot(rightDx, rightDy),
      });
    }

    metricsFor(samples) {
      if (samples.length < this.cfg.minHistoryPoints) {
        return { ok: false, coverage: 0, radiusVar: 0, lastTs: 0 };
      }
      let acc = 0;
      for (let i = 1; i < samples.length; i++) {
        const d = normalizeAngleDelta(samples[i].angle - samples[i - 1].angle);
        acc += Math.abs(d);
      }
      const radii = samples.map((s) => s.radius);
      const med = median(radii) || 1;
      const minR = Math.min(...radii);
      const maxR = Math.max(...radii);
      const radiusVar = (maxR - minR) / med;
      const coverageOk = acc >= this.cfg.angleCoverageThreshold;
      const radiusOk =
        radiusVar >= this.cfg.radialVarianceMin &&
        radiusVar <= this.cfg.radialVarianceMax;
      return {
        ok: coverageOk && radiusOk,
        coverage: acc,
        radiusVar,
        lastTs: samples[samples.length - 1].ts,
      };
    }

    shouldTrigger(nowMs) {
      if (nowMs - this.lastTriggerMs < this.cfg.triggerCooldownMs) {
        return false;
      }
      const left = this.metricsFor(this.leftSamples);
      const right = this.metricsFor(this.rightSamples);
      this.latestMetrics.leftCoverage = left.coverage;
      this.latestMetrics.rightCoverage = right.coverage;
      this.latestMetrics.leftRadiusVar = left.radiusVar;
      this.latestMetrics.rightRadiusVar = right.radiusVar;
      if (!left.ok || !right.ok) return false;
      if (Math.abs(left.lastTs - right.lastTs) > this.cfg.overlapWindowMs) {
        return false;
      }
      this.lastTriggerMs = nowMs;
      this.leftSamples = [];
      this.rightSamples = [];
      return true;
    }

    getStatus() {
      return {
        ...this.latestMetrics,
        cooldownMs: Math.max(
          0,
          this.cfg.triggerCooldownMs - (performance.now() - this.lastTriggerMs),
        ),
      };
    }
  }

  if (typeof window !== "undefined") {
    window.ArmCircleDetector = ArmCircleDetector;
  }
})();
