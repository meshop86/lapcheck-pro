import { useState } from "react";
import { Flame, StopCircle } from "lucide-react";
import type { StressResult } from "@shared/types";
import { Button, ProgressBar, SensorChart, StatTile } from "@/components/ui";
import { Instruction } from "./shared";
import {
  thermalPressureLabel,
  thermalPressureRank,
  thermalPressureTone,
  worstThermalPressure,
} from "@/lib/format";
import { newJobId, useJobProgress } from "@/lib/useJob";
import { useSensorStream } from "@/lib/useSensorStream";
import { useAppStore } from "@/store/useAppStore";
import type { TestPanelProps } from "./types";

const JOB_ID = newJobId("cpu");

const DURATIONS = [
  { sec: 180, label: "3 phút — kiểm nhanh" },
  { sec: 600, label: "10 phút — tiêu chuẩn" },
  { sec: 900, label: "15 phút — kỹ" },
];

export default function CpuStressTest({ onFinish, onClose }: TestPanelProps) {
  const { profile, sensorHistory, setStress } = useAppStore();
  const progress = useJobProgress(JOB_ID);
  const [durationSec, setDurationSec] = useState(600);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StressResult | null>(null);

  // Mở luồng cảm biến khi đang ép tải để vẽ đồ thị nhiệt theo thời gian thực
  useSensorStream(running);

  const threads = profile?.cpu.logicalCores ?? 4;
  const liveData = running
    ? sensorHistory.slice(-180)
    : (result?.timeline ?? []);
  // May Apple Silicon khong cho doc nhiet do die -> dung ap luc nhiet lam tin hieu thay the
  const pressure = worstThermalPressure(result?.timeline);

  async function run(): Promise<void> {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const data = await window.lapcheck.runCpuStress(JOB_ID, {
        durationSec,
        threads,
      });
      setResult(data);
      setStress(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function conclude(): void {
    if (!result) return;
    const metrics: Record<string, string | number> = {
      "Thời lượng": `${result.durationSec} giây`,
      "Số luồng": result.threads,
      "Hiệu năng": `${(result.opsPerSec / 1e6).toFixed(1)} triệu phép/giây`,
      "Nhiệt độ cao nhất":
        result.maxCpuTempC !== null
          ? `${result.maxCpuTempC.toFixed(0)} °C`
          : "không đọc được",
      "Nhiệt độ trung bình":
        result.avgCpuTempC !== null
          ? `${result.avgCpuTempC.toFixed(0)} °C`
          : "—",
      "Quạt cao nhất":
        result.maxFanRpm !== null ? `${result.maxFanRpm} vòng/phút` : "—",
      "Tụt xung":
        result.throttlePercent !== null
          ? `${result.throttlePercent.toFixed(0)}%`
          : "—",
      "Áp lực nhiệt": thermalPressureLabel(pressure),
      "Lỗi tính toán": result.errors,
    };

    const temp = result.maxCpuTempC;
    const throttle = result.throttlePercent ?? 0;
    const rank = thermalPressureRank(pressure);
    // Mo ta phan nhiet: uu tien nhiet do that, thieu thi dung ap luc nhiet
    const heat =
      temp !== null
        ? `nhiệt tối đa ${temp.toFixed(0)} °C`
        : pressure
          ? `áp lực nhiệt ${pressure}`
          : "máy không cho đọc nhiệt độ";

    if (result.errors > 0) {
      onFinish(
        "failed",
        `${result.errors} lỗi tính toán — CPU hoặc RAM không ổn định`,
        metrics,
      );
    } else if ((temp !== null && temp >= 98) || rank >= 3) {
      onFinish(
        "failed",
        `Quá nóng khi ép tải (${heat}) — cần vệ sinh và thay keo tản nhiệt`,
        metrics,
      );
    } else if ((temp !== null && temp >= 92) || throttle >= 35 || rank === 2) {
      onFinish("warning", `${heat}, tụt xung ${throttle.toFixed(0)}%`, metrics);
    } else {
      onFinish(
        "passed",
        `Chạy full tải ${result.durationSec}s ổn định, ${heat}`,
        metrics,
      );
    }
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Ép toàn bộ {threads} luồng CPU chạy hết công suất và theo dõi nhiệt độ,
        tốc độ quạt, mức tụt xung. Máy cũ khô keo tản nhiệt sẽ vọt lên trên 95
        °C rồi tụt xung mạnh. Đặt máy trên mặt phẳng cứng, không che khe gió,
        cắm sạc khi chạy.
      </Instruction>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {DURATIONS.map((d) => (
            <button
              key={d.sec}
              onClick={() => setDurationSec(d.sec)}
              disabled={running}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                durationSec === d.sec
                  ? "border-accent-600 bg-accent-600/20 text-accent-500"
                  : "border-ink-600 text-mist-300 hover:text-slate-100"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {running ? (
          <Button
            variant="danger"
            onClick={() => window.lapcheck.cancelJob(JOB_ID)}
          >
            <StopCircle size={14} />
            Dừng sớm
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void run()}>
            <Flame size={14} />
            Bắt đầu ép tải
          </Button>
        )}
      </div>

      {running && (
        <ProgressBar
          percent={progress?.percent ?? 0}
          label={progress?.message ?? "Khởi động worker…"}
        />
      )}

      <SensorChart data={liveData} />

      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {result && (
        <div className="grid grid-cols-4 gap-2">
          <StatTile
            label={
              result.maxCpuTempC !== null ? "Nhiệt tối đa" : "Áp lực nhiệt"
            }
            value={
              result.maxCpuTempC !== null
                ? `${result.maxCpuTempC.toFixed(0)}°C`
                : (pressure ?? "—")
            }
            hint={
              result.maxCpuTempC === null && pressure
                ? "máy không cho đọc nhiệt độ die"
                : undefined
            }
            tone={
              result.maxCpuTempC !== null
                ? result.maxCpuTempC >= 98
                  ? "bad"
                  : result.maxCpuTempC >= 92
                    ? "warn"
                    : "good"
                : thermalPressureTone(pressure)
            }
          />
          <StatTile
            label="Tụt xung"
            value={
              result.throttlePercent !== null
                ? `${result.throttlePercent.toFixed(0)}%`
                : "—"
            }
            tone={(result.throttlePercent ?? 0) >= 35 ? "warn" : "good"}
            hint={
              result.startFreqGHz && result.minFreqGHz
                ? `${result.startFreqGHz.toFixed(2)} → ${result.minFreqGHz.toFixed(2)} GHz`
                : undefined
            }
          />
          <StatTile
            label="Quạt tối đa"
            value={result.maxFanRpm !== null ? result.maxFanRpm : "—"}
            hint="vòng/phút"
          />
          <StatTile
            label="Lỗi tính toán"
            value={result.errors}
            tone={result.errors > 0 ? "bad" : "good"}
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="primary" onClick={conclude} disabled={!result}>
          Ghi kết quả
        </Button>
      </div>
    </div>
  );
}
