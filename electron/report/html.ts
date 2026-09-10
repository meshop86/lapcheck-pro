import type { Finding, Inspection, TestResult } from "@shared/types";
import { assessDisk, isInternalDisk, VERDICT_LABEL } from "@shared/diskHealth";

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const dash = (value: unknown): string => {
  const s = String(value ?? "").trim();
  return s === "" || s === "null" || s === "undefined" ? "—" : esc(s);
};

/** Ghep cac manh thong tin, bo qua manh rong de bao cao khong con dau gach thua. */
const parts = (
  pieces: (string | number | null | undefined)[],
  sep = " — ",
): string => {
  const kept = pieces
    .map((x) => String(x ?? "").trim())
    .filter((x) => x !== "");
  return kept.length ? esc(kept.join(sep)) : "—";
};

const gb = (bytes: number | null | undefined): string =>
  bytes
    ? `${(bytes / 1024 ** 3).toFixed(bytes < 1024 ** 3 * 10 ? 1 : 0)} GB`
    : "—";

const wh = (mwh: number | null | undefined): string =>
  mwh ? `${(mwh / 1000).toFixed(1)} Wh` : "—";

const dateVN = (iso: string): string =>
  new Date(iso).toLocaleString("vi-VN", {
    dateStyle: "long",
    timeStyle: "short",
  });

const GRADE_COLOR: Record<string, string> = {
  "A+": "#059669",
  A: "#059669",
  B: "#0284c7",
  C: "#d97706",
  D: "#ea580c",
  F: "#dc2626",
};

const SEVERITY: Record<
  Finding["severity"],
  { label: string; color: string; bg: string }
> = {
  critical: { label: "Nghiêm trọng", color: "#991b1b", bg: "#fef2f2" },
  major: { label: "Đáng kể", color: "#9a3412", bg: "#fff7ed" },
  minor: { label: "Nhẹ", color: "#854d0e", bg: "#fefce8" },
  info: { label: "Thông tin", color: "#1e40af", bg: "#eff6ff" },
};

const STATUS: Record<TestResult["status"], { label: string; color: string }> = {
  passed: { label: "Đạt", color: "#059669" },
  failed: { label: "Lỗi", color: "#dc2626" },
  warning: { label: "Lưu ý", color: "#d97706" },
  skipped: { label: "Bỏ qua", color: "#94a3b8" },
  pending: { label: "Chưa chạy", color: "#94a3b8" },
  running: { label: "Đang chạy", color: "#0284c7" },
};

/** Mau chu cho ket luan suc khoe o cung trong ban in. */
const DISK_VERDICT_COLOR: Record<string, string> = {
  good: "#059669",
  fair: "#d97706",
  poor: "#ea580c",
  failing: "#dc2626",
  unknown: "#64748b",
};

function rows(pairs: [string, string][]): string {
  return pairs
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`)
    .join("");
}

export function renderReportHtml(inspection: Inspection): string {
  const p = inspection.profile;
  const m = p.machine;
  const grade = inspection.grade;
  const gradeColor = GRADE_COLOR[grade.letter] ?? "#334155";
  const mainDisk = p.storage.find(isInternalDisk) ?? p.storage[0];
  const internalDisplay = p.displays.find((d) => d.builtin) ?? p.displays[0];

  const conditionLabel = {
    new: "Máy mới",
    used: "Máy đã qua sử dụng",
    refurbished: "Máy tân trang",
  }[inspection.meta.condition];

  const machineRows = rows([
    ["Nhà sản xuất", dash(m.manufacturer)],
    ["Model", dash(m.model)],
    ["Số serial", `<strong>${dash(m.serial)}</strong>`],
    ["Loại thân máy", dash(m.chassisType)],
    ["BIOS / Firmware", parts([m.biosVersion, m.biosReleaseDate])],
    [
      "Hệ điều hành",
      parts(
        [
          `${m.osDistro ?? ""} ${m.osRelease ?? ""}`.trim(),
          m.osArch ? `(${m.osArch})` : "",
        ],
        " ",
      ),
    ],
    [
      "Bản quyền",
      m.licenseChannel
        ? `${dash(m.licenseChannel)} — ${m.licenseActivated ? "đã kích hoạt" : "chưa kích hoạt"}`
        : "—",
    ],
    [
      "TPM / Secure Boot",
      `${dash(m.tpmVersion)} / ${m.secureBoot === null ? "—" : m.secureBoot ? "Bật" : "Tắt"}`,
    ],
  ]);

  const cpuRows = rows([
    ["CPU", dash(p.cpu.brand)],
    [
      "Số nhân / luồng",
      `${p.cpu.physicalCores} nhân · ${p.cpu.logicalCores} luồng`,
    ],
    [
      "Xung nhịp",
      `${dash(p.cpu.baseSpeedGHz)} GHz${p.cpu.maxSpeedGHz ? ` — tối đa ${p.cpu.maxSpeedGHz} GHz` : ""}`,
    ],
    [
      "Cache L3",
      p.cpu.cacheL3Bytes
        ? `${(p.cpu.cacheL3Bytes / 1024 ** 2).toFixed(0)} MB`
        : "—",
    ],
    ["GPU", p.graphics.map((g) => esc(g.model)).join("<br>") || "—"],
  ]);

  const memoryRows = rows([
    ["Tổng dung lượng", gb(p.memory.totalBytes)],
    [
      "Số khe đã dùng",
      `${p.memory.slotsUsed}${p.memory.slotsTotal ? ` / ${p.memory.slotsTotal}` : ""}`,
    ],
    [
      "Chi tiết từng thanh",
      p.memory.modules.length
        ? p.memory.modules
            .map((mod) =>
              parts(
                [
                  mod.slot ? `${mod.slot}:` : "",
                  gb(mod.sizeBytes),
                  mod.type,
                  mod.clockSpeedMHz ? `${mod.clockSpeedMHz} MHz` : "",
                  mod.manufacturer,
                  mod.partNumber,
                ],
                " ",
              ),
            )
            .join("<br>")
        : "—",
    ],
  ]);

  const diskHealth = mainDisk ? assessDisk(mainDisk) : null;
  const diskRows = mainDisk
    ? rows([
        ["Model ổ cứng", dash(mainDisk.model)],
        ["Serial", dash(mainDisk.serial)],
        [
          "Dung lượng / chuẩn",
          parts(
            [gb(mainDisk.sizeBytes), mainDisk.type, mainDisk.interfaceType],
            " · ",
          ),
        ],
        [
          "Sức khỏe SMART",
          mainDisk.smart.healthy === null
            ? "—"
            : mainDisk.smart.healthy
              ? "Tốt"
              : '<strong style="color:#dc2626">Có cảnh báo</strong>',
        ],
        [
          "Số giờ đã chạy",
          mainDisk.smart.powerOnHours !== null
            ? `<strong>${mainDisk.smart.powerOnHours.toLocaleString("vi-VN")} giờ</strong> (~${(mainDisk.smart.powerOnHours / 8760).toFixed(1)} năm)`
            : "—",
        ],
        [
          "Số lần bật máy",
          mainDisk.smart.powerCycles?.toLocaleString("vi-VN") ?? "—",
        ],
        [
          "Tổng dữ liệu đã ghi",
          mainDisk.smart.dataWrittenBytes
            ? `${(mainDisk.smart.dataWrittenBytes / 1e12).toFixed(2)} TB`
            : "—",
        ],
        [
          "Tuổi thọ ghi đã dùng",
          mainDisk.smart.percentageUsed !== null
            ? `${mainDisk.smart.percentageUsed}%`
            : "—",
        ],
        [
          "Đánh giá tổng thể",
          diskHealth
            ? `<strong style="color:${DISK_VERDICT_COLOR[diskHealth.verdict]}">${VERDICT_LABEL[diskHealth.verdict]}${diskHealth.score !== null ? ` — ${diskHealth.score}/100` : ""}</strong>`
            : "—",
        ],
      ])
    : '<tr><td colspan="2">Không phát hiện ổ cứng</td></tr>';

  const yn = (v: boolean | null, badWhenTrue = true): string => {
    if (v === null) return "—";
    const bad = badWhenTrue ? v : !v;
    return bad
      ? `<strong style="color:#dc2626">${v ? "Có" : "Không"}</strong>`
      : v
        ? "Có"
        : "Không";
  };

  const own = p.ownership;
  const ownershipRows = own
    ? rows([
        ["Ghi danh DEP", yn(own.depEnrolled)],
        ["Bị MDM quản lý", yn(own.mdmEnrolled)],
        ["Tổ chức quản lý", dash(own.mdmOrganization)],
        ["Activation Lock", yn(own.activationLocked)],
        ["Apple ID đang đăng nhập", dash(own.icloudAccount)],
        ["Find My", yn(own.findMyEnabled)],
        ["Managed Apple ID", yn(own.managedAppleId)],
        ["Mật khẩu firmware", yn(own.firmwarePassword)],
        ["Số configuration profile", own.configProfiles?.toString() ?? "—"],
      ])
    : "";

  const batteryRows = p.battery.hasBattery
    ? rows([
        ["Dung lượng thiết kế", wh(p.battery.designedCapacityMWh)],
        ["Dung lượng thực tế", wh(p.battery.maxCapacityMWh)],
        [
          "Độ chai pin",
          p.battery.wearPercent !== null
            ? `<strong style="color:${p.battery.wearPercent >= 20 ? "#dc2626" : "#059669"}">${p.battery.wearPercent}%</strong>`
            : "—",
        ],
        ["Số chu kỳ sạc", p.battery.cycleCount?.toLocaleString("vi-VN") ?? "—"],
        ["Tình trạng hệ thống báo", dash(p.battery.condition)],
        [
          "Model / Serial pin",
          parts([p.battery.model, p.battery.serial], " / "),
        ],
      ])
    : '<tr><td colspan="2">Máy không có pin hoặc không phát hiện được pin</td></tr>';

  const displayRows = internalDisplay
    ? rows([
        ["Mã panel", dash(internalDisplay.model)],
        [
          "Độ phân giải",
          internalDisplay.nativeResX
            ? `${internalDisplay.nativeResX} × ${internalDisplay.nativeResY}`
            : "—",
        ],
        [
          "Tần số quét",
          internalDisplay.refreshRateHz
            ? `${internalDisplay.refreshRateHz} Hz`
            : "—",
        ],
        [
          "Kích thước",
          internalDisplay.sizeInches ? `${internalDisplay.sizeInches}"` : "—",
        ],
        [
          "Ngày sản xuất panel",
          internalDisplay.manufactureYear
            ? `Tuần ${internalDisplay.manufactureWeek ?? "?"} / ${internalDisplay.manufactureYear}`
            : "—",
        ],
        ["Serial panel", dash(internalDisplay.serialNumber)],
      ])
    : '<tr><td colspan="2">Không đọc được thông tin màn hình</td></tr>';

  const testRows = inspection.results
    .map((r) => {
      const s = STATUS[r.status];
      const metrics = Object.entries(r.metrics)
        .map(([k, v]) => `${esc(k)}: <strong>${esc(v)}</strong>`)
        .join(" · ");
      return `<tr>
        <td>${esc(r.name)}</td>
        <td><span class="pill" style="color:${s.color};border-color:${s.color}33;background:${s.color}14">${s.label}</span></td>
        <td>${esc(r.summary)}${metrics ? `<div class="metrics">${metrics}</div>` : ""}${r.notes ? `<div class="note">Ghi chú: ${esc(r.notes)}</div>` : ""}</td>
      </tr>`;
    })
    .join("");

  const findingBlocks = (["critical", "major", "minor", "info"] as const)
    .map((sev) => {
      const items = inspection.findings.filter((f) => f.severity === sev);
      if (!items.length) return "";
      const cfg = SEVERITY[sev];
      return `<div class="finding-group">
        <h3 style="color:${cfg.color}">${cfg.label} (${items.length})</h3>
        ${items
          .map(
            (
              f,
            ) => `<div class="finding" style="background:${cfg.bg};border-left-color:${cfg.color}">
              <div class="finding-title">${esc(f.title)}</div>
              <div class="finding-detail">${esc(f.detail)}</div>
              ${f.evidence ? `<div class="finding-evidence">Dữ liệu: ${esc(f.evidence)}</div>` : ""}
              ${f.recommendation ? `<div class="finding-rec">→ ${esc(f.recommendation)}</div>` : ""}
            </div>`,
          )
          .join("")}
      </div>`;
    })
    .join("");

  const deductionRows = grade.deductions.length
    ? grade.deductions
        .map(
          (d) =>
            `<tr><td>${esc(d.reason)}</td><td class="num">−${d.points}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="2">Không có điểm trừ</td></tr>';

  const passed = inspection.results.filter((r) => r.status === "passed").length;
  const failed = inspection.results.filter((r) => r.status === "failed").length;

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<title>Phiếu kiểm định ${esc(inspection.id)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 10.5px;
         color: #0f172a; margin: 0; line-height: 1.5; }
  h1 { font-size: 19px; margin: 0 0 2px; letter-spacing: -0.3px; }
  h2 { font-size: 12px; margin: 18px 0 7px; padding-bottom: 4px;
       border-bottom: 1.5px solid #0f172a; text-transform: uppercase; letter-spacing: 0.6px; }
  h3 { font-size: 11px; margin: 12px 0 6px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 2.5px solid #0f172a; padding-bottom: 10px; }
  .brand { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; }
  .meta { text-align: right; font-size: 9.5px; color: #475569; }
  .meta strong { color: #0f172a; }
  .grade-band { display: flex; gap: 12px; margin: 14px 0; align-items: stretch; }
  .grade-box { width: 118px; flex: none; border: 2px solid ${gradeColor}; border-radius: 8px;
               text-align: center; padding: 10px 6px; }
  .grade-letter { font-size: 40px; font-weight: 800; line-height: 1; color: ${gradeColor}; }
  .grade-score { font-size: 10px; color: #475569; margin-top: 4px; }
  .grade-note { flex: 1; background: #f8fafc; border-radius: 8px; padding: 10px 12px; }
  .grade-note .label { font-size: 12px; font-weight: 700; color: ${gradeColor}; }
  .counts { display: flex; gap: 14px; margin-top: 6px; font-size: 9.5px; color: #475569; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
  table { width: 100%; border-collapse: collapse; }
  .kv th { text-align: left; font-weight: 500; color: #64748b; width: 42%;
           padding: 3px 6px 3px 0; vertical-align: top; font-size: 9.5px; }
  .kv td { padding: 3px 0; vertical-align: top; }
  .tests { margin-top: 4px; }
  .tests th { background: #f1f5f9; text-align: left; padding: 5px 7px; font-size: 9.5px;
              border-bottom: 1px solid #cbd5e1; }
  .tests td { padding: 5px 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .tests td:first-child { width: 24%; font-weight: 600; }
  .tests td:nth-child(2) { width: 12%; }
  .pill { display: inline-block; padding: 1px 7px; border-radius: 9px; font-size: 9px;
          font-weight: 600; border: 1px solid; }
  .metrics { color: #475569; font-size: 9px; margin-top: 2px; }
  .note { color: #7c3aed; font-size: 9px; margin-top: 2px; }
  .finding { border-left: 3px solid; border-radius: 0 5px 5px 0; padding: 6px 9px; margin-bottom: 5px; }
  .finding-title { font-weight: 700; font-size: 10.5px; }
  .finding-detail { color: #334155; margin-top: 1px; }
  .finding-evidence { color: #64748b; font-size: 9px; margin-top: 2px; font-family: ui-monospace, Menlo, Consolas, monospace; }
  .finding-rec { color: #0f172a; font-size: 9.5px; margin-top: 3px; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .deduct td { padding: 3px 0; border-bottom: 1px dotted #e2e8f0; font-size: 9.5px; }
  .warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;
          padding: 7px 9px; font-size: 9px; color: #78350f; margin-top: 8px; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #cbd5e1;
            font-size: 8.5px; color: #64748b; display: flex; justify-content: space-between; }
  .sign { margin-top: 22px; display: flex; justify-content: space-between; text-align: center; font-size: 9.5px; }
  .sign div { width: 45%; }
  .sign .line { margin-top: 42px; border-top: 1px solid #94a3b8; padding-top: 3px; color: #64748b; }
  .avoid-break { break-inside: avoid; }
</style></head>
<body>

<div class="header">
  <div>
    <div class="brand">chipLapTest · Phần mềm kiểm định laptop</div>
    <h1>Phiếu kiểm định tình trạng máy</h1>
    <div style="color:#475569">${esc(inspection.meta.deviceLabel || `${m.manufacturer} ${m.model}`)} · ${conditionLabel}</div>
  </div>
  <div class="meta">
    <div>Mã phiếu: <strong>${esc(inspection.id)}</strong></div>
    <div>Ngày kiểm: <strong>${esc(dateVN(inspection.createdAt))}</strong></div>
    <div>Kỹ thuật viên: <strong>${dash(inspection.meta.technician)}</strong></div>
    ${inspection.meta.customerRef ? `<div>Mã khách/đơn: <strong>${esc(inspection.meta.customerRef)}</strong></div>` : ""}
  </div>
</div>

<div class="grade-band">
  <div class="grade-box">
    <div class="grade-letter">${esc(grade.letter)}</div>
    <div class="grade-score">${grade.score}/100 điểm</div>
  </div>
  <div class="grade-note">
    <div class="label">${esc(grade.label)}</div>
    <div class="counts">
      <span>Đạt: <strong>${passed}</strong></span>
      <span>Lỗi: <strong>${failed}</strong></span>
      <span>Tổng hạng mục: <strong>${inspection.results.length}</strong></span>
      <span>Cảnh báo nghiêm trọng: <strong>${inspection.findings.filter((f) => f.severity === "critical").length}</strong></span>
    </div>
    ${inspection.meta.notes ? `<div style="margin-top:6px;font-size:9.5px;color:#334155">Ghi chú: ${esc(inspection.meta.notes)}</div>` : ""}
  </div>
</div>

<h2>Thông số phần cứng</h2>
<div class="grid">
  <div><h3>Máy &amp; hệ điều hành</h3><table class="kv">${machineRows}</table></div>
  <div><h3>Vi xử lý &amp; đồ họa</h3><table class="kv">${cpuRows}</table></div>
  <div><h3>Bộ nhớ RAM</h3><table class="kv">${memoryRows}</table></div>
  <div><h3>Ổ cứng chính</h3><table class="kv">${diskRows}</table></div>
  <div><h3>Pin</h3><table class="kv">${batteryRows}</table></div>
  <div><h3>Màn hình</h3><table class="kv">${displayRows}</table></div>
  ${ownershipRows ? `<div><h3>Khoá máy &amp; quyền sở hữu</h3><table class="kv">${ownershipRows}</table></div>` : ""}
</div>

<h2>Kết quả kiểm tra chức năng</h2>
<table class="tests">
  <thead><tr><th>Hạng mục</th><th>Kết quả</th><th>Chi tiết</th></tr></thead>
  <tbody>${testRows || '<tr><td colspan="3">Chưa chạy hạng mục nào</td></tr>'}</tbody>
</table>

<h2>Nhận định &amp; cảnh báo</h2>
${findingBlocks || "<p>Không phát hiện vấn đề nào.</p>"}

<h2>Bảng điểm trừ</h2>
<table class="deduct">${deductionRows}
  <tr><td><strong>Điểm cuối cùng</strong></td><td class="num"><strong>${grade.score}/100</strong></td></tr>
</table>

${p.warnings.length ? `<div class="warn"><strong>Giới hạn của lần đo này:</strong><br>${p.warnings.map((w) => `• ${esc(w)}`).join("<br>")}</div>` : ""}

<div class="sign avoid-break">
  <div><strong>Kỹ thuật viên kiểm định</strong><div class="line">${dash(inspection.meta.technician)}</div></div>
  <div><strong>Người nhận máy</strong><div class="line">Ký và ghi rõ họ tên</div></div>
</div>

<div class="footer">
  <span>chipLapTest v${esc(p.appVersion)} · Dữ liệu đọc trực tiếp từ phần cứng lúc ${esc(dateVN(p.collectedAt))}</span>
  <span>Mã phiếu ${esc(inspection.id)}</span>
</div>

</body></html>`;
}
