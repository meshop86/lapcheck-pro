export function bytes(value: number | null | undefined, digits = 1): string {
  if (!value || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const n = value / 1024 ** i;
  return `${n.toFixed(i <= 1 ? 0 : n >= 100 ? 0 : digits)} ${units[i]}`;
}

export function tb(value: number | null | undefined): string {
  if (!value) return "—";
  return `${(value / 1e12).toFixed(2)} TB`;
}

export function num(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return `${value.toLocaleString("vi-VN")}${suffix}`;
}

export function text(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  return s === "" ? "—" : s;
}

/** Ghep cac manh thong tin, bo qua manh rong de khong con dau gach hay ngoac thua. */
export function joinParts(
  pieces: (string | number | null | undefined)[],
  sep = " · "
): string {
  const kept = pieces
    .map((p) => String(p ?? "").trim())
    .filter((p) => p !== "" && p !== "—");
  return kept.length ? kept.join(sep) : "—";
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return `${value.toFixed(digits)}%`;
}

export function hours(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const years = value / 8760;
  return years >= 1
    ? `${value.toLocaleString("vi-VN")} giờ (~${years.toFixed(1)} năm)`
    : `${value.toLocaleString("vi-VN")} giờ`;
}

export function duration(ms: number | null | undefined): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  return `${m} phút ${s % 60} giây`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function wh(mwh: number | null | undefined): string {
  return mwh ? `${(mwh / 1000).toFixed(1)} Wh` : "—";
}

/**
 * Muc ap luc nhiet (thermal pressure) macOS bao cao, xep theo do nghiem trong tang dan.
 * Apple Silicon khong cho doc nhiet do die nen day la tin hieu thay the de biet may co bi ep nhiet khong.
 */
const PRESSURE_RANK: Record<string, number> = {
  nominal: 0,
  fair: 1,
  moderate: 1,
  serious: 2,
  heavy: 2,
  critical: 3,
  trapping: 3,
  sleeping: 4,
};

export function thermalPressureRank(level: string | null | undefined): number {
  if (!level) return -1;
  return PRESSURE_RANK[level.trim().toLowerCase()] ?? -1;
}

/** Lay muc ap luc nhiet cao nhat trong ca chuoi mau cam bien. */
export function worstThermalPressure(
  timeline: { thermalPressure?: string | null }[] | null | undefined,
): string | null {
  let worst: string | null = null;
  for (const sample of timeline ?? []) {
    if (
      thermalPressureRank(sample.thermalPressure) > thermalPressureRank(worst)
    ) {
      worst = sample.thermalPressure ?? null;
    }
  }
  return worst;
}

export function thermalPressureTone(
  level: string | null | undefined,
): "neutral" | "good" | "warn" | "bad" {
  const rank = thermalPressureRank(level);
  if (rank < 0) return "neutral";
  if (rank === 0) return "good";
  if (rank === 1) return "warn";
  return "bad";
}

/** Dien giai tieng Viet cho muc ap luc nhiet, giu nguyen ten muc bang tieng Anh. */
export function thermalPressureLabel(level: string | null | undefined): string {
  const rank = thermalPressureRank(level);
  const note = [
    "bình thường",
    "hơi nóng",
    "nóng nhiều, máy bắt đầu ép xung xuống",
    "quá nóng, máy đang tự hạ hiệu năng",
    "quá nóng, máy sắp tự ngủ",
  ][rank];
  if (!level || rank < 0) return "—";
  return `${level} — ${note}`;
}
