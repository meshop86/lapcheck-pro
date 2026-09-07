import { AlertTriangle, ArrowRight, Gauge, Thermometer } from "lucide-react";
import type { PageId } from "@/App";
import {
  Button,
  Card,
  GRADE_TONE,
  InfoTable,
  SEVERITY_STYLE,
  SensorChart,
  StatTile,
} from "@/components/ui";
import { useSensorStream } from "@/lib/useSensorStream";
import { useAppStore } from "@/store/useAppStore";
import {
  bytes,
  hours,
  num,
  percent,
  text,
  thermalPressureTone,
} from "@/lib/format";

export default function Dashboard({
  onNavigate,
}: {
  onNavigate: (page: PageId) => void;
}) {
  const { profile, sensors, sensorHistory, analysis } = useAppStore();
  useSensorStream(true);

  if (!profile) return null;
  const { grade, findings } = analysis();
  const battery = profile.battery;
  const mainDrive = profile.storage[0];
  const smart = mainDrive?.smart;
  const display = profile.displays[0];
  const criticalFindings = findings.filter(
    (f) => f.severity === "critical" || f.severity === "major",
  );
  // Apple Silicon khong cho doc nhiet do die -> hien ap luc nhiet thay the
  const cpuTemp = sensors?.cpuTempC ?? null;

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            {text(`${profile.machine.manufacturer} ${profile.machine.model}`)}
          </h1>
          <p className="text-xs text-mist-400">
            Serial {text(profile.machine.serial)} ·{" "}
            {text(profile.machine.osDistro)} {profile.machine.osRelease} ·{" "}
            {profile.cpu.brand}
          </p>
        </div>
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-2 ${GRADE_TONE[grade.letter]}`}
        >
          <span className="text-3xl font-bold leading-none">
            {grade.letter}
          </span>
          <div className="text-xs">
            <div className="font-semibold tabular-nums">{grade.score}/100</div>
            <div className="opacity-80">{grade.label}</div>
          </div>
        </div>
      </header>

      {profile.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-200">
            <AlertTriangle size={15} />
            Dữ liệu chưa đầy đủ
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-100/80">
            {profile.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <StatTile
          label="Độ chai pin"
          value={
            battery.hasBattery ? percent(battery.wearPercent) : "Không pin"
          }
          hint={
            battery.hasBattery
              ? `${num(battery.cycleCount)} chu kỳ · còn ${percent(battery.healthPercent)}`
              : "máy bàn hoặc pin bị tháo"
          }
          tone={
            !battery.hasBattery
              ? "neutral"
              : (battery.wearPercent ?? 0) >= 40
                ? "bad"
                : (battery.wearPercent ?? 0) >= 20
                  ? "warn"
                  : "good"
          }
        />
        <StatTile
          label="Giờ chạy ổ cứng"
          value={
            smart?.powerOnHours !== null && smart?.powerOnHours !== undefined
              ? num(smart.powerOnHours)
              : "—"
          }
          hint={
            smart?.powerOnHours
              ? hours(smart.powerOnHours)
              : "SMART chưa đọc được"
          }
          tone={
            !smart?.powerOnHours
              ? "neutral"
              : smart.powerOnHours >= 20000
                ? "bad"
                : smart.powerOnHours >= 10000
                  ? "warn"
                  : "good"
          }
        />
        <StatTile
          label="Tuổi thọ SSD đã dùng"
          value={
            smart?.percentageUsed !== null &&
            smart?.percentageUsed !== undefined
              ? percent(smart.percentageUsed)
              : "—"
          }
          hint={
            mainDrive
              ? `${mainDrive.model || mainDrive.name} · ${bytes(mainDrive.sizeBytes)}`
              : ""
          }
          tone={
            smart?.percentageUsed === null ||
            smart?.percentageUsed === undefined
              ? "neutral"
              : smart.percentageUsed >= 80
                ? "bad"
                : smart.percentageUsed >= 50
                  ? "warn"
                  : "good"
          }
        />
        <StatTile
          label={cpuTemp !== null ? "Nhiệt độ CPU" : "Áp lực nhiệt"}
          value={
            cpuTemp !== null
              ? `${cpuTemp.toFixed(0)}°C`
              : (sensors?.thermalPressure ?? "—")
          }
          hint={
            sensors
              ? `tải ${sensors.cpuLoadPercent.toFixed(0)}%${sensors.fans[0]?.rpm ? ` · quạt ${sensors.fans[0].rpm} rpm` : ""}`
              : "đang đọc cảm biến"
          }
          tone={
            cpuTemp !== null
              ? cpuTemp >= 90
                ? "bad"
                : cpuTemp >= 80
                  ? "warn"
                  : "good"
              : thermalPressureTone(sensors?.thermalPressure)
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card
          title="Cảnh báo cần hỏi lại người bán"
          subtitle={`${criticalFindings.length} vấn đề đáng chú ý`}
          actions={
            <Button size="sm" onClick={() => onNavigate("report")}>
              Xem đầy đủ
              <ArrowRight size={12} />
            </Button>
          }
        >
          {criticalFindings.length === 0 ? (
            <p className="text-sm text-mist-400">
              Chưa phát hiện dấu hiệu bất thường từ dữ liệu phần cứng. Hãy chạy
              bộ test để kết luận chắc chắn hơn.
            </p>
          ) : (
            <ul className="space-y-2">
              {criticalFindings.slice(0, 5).map((f) => {
                const style = SEVERITY_STYLE[f.severity];
                return (
                  <li
                    key={f.code}
                    className={`rounded-lg border px-3 py-2 ${style.border} ${style.bg}`}
                  >
                    <div className={`text-xs font-semibold ${style.text}`}>
                      {f.title}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-mist-300">
                      {f.detail}
                    </div>
                    {f.evidence && (
                      <div className="mt-0.5 text-[11px] text-mist-400">
                        {f.evidence}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Tóm tắt cấu hình">
          <InfoTable
            rows={[
              [
                "CPU",
                `${profile.cpu.brand} · ${profile.cpu.physicalCores}C/${profile.cpu.logicalCores}T`,
              ],
              [
                "RAM",
                `${bytes(profile.memory.totalBytes)} · ${profile.memory.slotsUsed}/${
                  profile.memory.slotsTotal ?? "?"
                } khe · ${text(profile.memory.modules[0]?.type)}`,
              ],
              [
                "Ổ cứng",
                profile.storage
                  .map((s) => `${s.type} ${bytes(s.sizeBytes)}`)
                  .join(" + ") || "—",
              ],
              ["GPU", profile.graphics.map((g) => g.model).join(", ") || "—"],
              [
                "Màn hình",
                display
                  ? `${display.nativeResX ?? display.currentResX}×${display.nativeResY ?? display.currentResY} · ${
                      display.refreshRateHz ?? "?"
                    } Hz${display.sizeInches ? ` · ${display.sizeInches.toFixed(1)}"` : ""}`
                  : "—",
              ],
              [
                "Panel sản xuất",
                display?.manufactureYear
                  ? `Tuần ${display.manufactureWeek ?? "?"}/${display.manufactureYear}`
                  : "—",
              ],
              [
                "BIOS",
                `${text(profile.machine.biosVendor)} ${text(profile.machine.biosVersion)} (${text(profile.machine.biosReleaseDate)})`,
              ],
              [
                "Bản quyền Windows",
                profile.machine.licenseActivated === null
                  ? "—"
                  : `${profile.machine.licenseActivated ? "Đã kích hoạt" : "Chưa kích hoạt"}${
                      profile.machine.licenseChannel
                        ? ` · ${profile.machine.licenseChannel}`
                        : ""
                    }`,
              ],
            ]}
          />
        </Card>
      </div>

      <Card
        title="Cảm biến thời gian thực"
        subtitle="Theo dõi nhiệt độ và tải trong lúc kiểm tra"
        actions={
          <Button
            size="sm"
            variant="primary"
            onClick={() => onNavigate("tests")}
          >
            <Gauge size={12} />
            Vào quy trình kiểm tra
          </Button>
        }
      >
        <SensorChart data={sensorHistory.slice(-180)} />
        {sensors && (
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-mist-300">
            <span className="flex items-center gap-1">
              <Thermometer size={12} className="text-rose-300" />
              CPU{" "}
              {sensors.cpuTempC !== null
                ? `${sensors.cpuTempC.toFixed(0)} °C`
                : (sensors.thermalPressure ?? "—")}
            </span>
            {sensors.gpuTempC !== null && (
              <span>GPU {sensors.gpuTempC.toFixed(0)} °C</span>
            )}
            <span>Tải {sensors.cpuLoadPercent.toFixed(0)}%</span>
            <span>
              Xung{" "}
              {sensors.cpuFreqGHz
                ? `${sensors.cpuFreqGHz.toFixed(2)} GHz`
                : "—"}
            </span>
            <span>RAM {sensors.memoryUsedPercent.toFixed(0)}%</span>
            {sensors.fans.map((fan, i) => (
              <span key={i}>
                {fan.name}: {fan.rpm ?? "—"} rpm
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
