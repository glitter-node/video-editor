export function clampMs(value, durationMs = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  const duration = Number.isFinite(Number(durationMs)) ? Math.max(0, Math.floor(Number(durationMs))) : Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(duration, Math.round(number)));
}

export function formatTime(valueMs) {
  const totalMs = clampMs(valueMs);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;
  const clock = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  return hours ? clock : clock.slice(3);
}

export function chooseTickStep(durationMs) {
  const duration = Math.max(0, Number(durationMs) || 0);
  const targetTicks = 8;
  const rough = duration / targetTicks;
  const steps = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000];
  return steps.find((step) => step >= rough) || steps[steps.length - 1];
}
