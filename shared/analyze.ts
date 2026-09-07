import type {
  Finding,
  FindingSeverity,
  Grade,
  GradeLetter,
  StressResult,
  SystemProfile,
  TestResult,
} from "./types";

/** Điểm trừ tương ứng từng mức nghiêm trọng, dùng khi rule không chỉ định riêng. */
const DEFAULT_PENALTY: Record<FindingSeverity, number> = {
  critical: 20,
  major: 9,
  minor: 3,
  info: 0,
};

class FindingCollector {
  readonly items: Finding[] = [];

  add(
    code: string,
    severity: FindingSeverity,
    title: string,
    detail: string,
    evidence: string | null = null,
    recommendation: string | null = null,
  ): void {
    this.items.push({
      code,
      severity,
      title,
      detail,
      evidence,
      recommendation,
    });
  }
}

const fmtHours = (h: number): string => {
  const years = h / 8760;
  return years >= 1
    ? `${h.toLocaleString("vi-VN")} giờ (~${years.toFixed(1)} năm)`
    : `${h} giờ`;
};

const fmtTB = (bytes: number): string => `${(bytes / 1e12).toFixed(2)} TB`;

/* ------------------------------------------------------------------ */
/* Pin                                                                 */
/* ------------------------------------------------------------------ */

function analyzeBattery(profile: SystemProfile, c: FindingCollector): void {
  const b = profile.battery;
  const isLaptop = /laptop|notebook|portable|convertible|detachable/i.test(
    profile.machine.chassisType,
  );

  if (!b.hasBattery) {
    if (isLaptop) {
      c.add(
        "BATTERY_MISSING",
        "critical",
        "Không phát hiện pin",
        "Máy có thân vỏ laptop nhưng hệ thống không thấy pin. Có thể pin đã bị tháo, hỏng mạch quản lý pin, hoặc cáp pin lỏng.",
        `Loại vỏ máy: ${profile.machine.chassisType}`,
        "Mở máy kiểm tra cáp pin và mạch sạc trước khi định giá.",
      );
    }
    return;
  }

  const wear = b.wearPercent;
  if (wear !== null) {
    const evidence =
      b.designedCapacityMWh && b.maxCapacityMWh
        ? `Thiết kế ${(b.designedCapacityMWh / 1000).toFixed(1)} Wh, thực tế còn ${(b.maxCapacityMWh / 1000).toFixed(1)} Wh`
        : `Độ chai ${wear}%`;

    if (wear >= 40) {
      c.add(
        "BATTERY_WORN_CRITICAL",
        "critical",
        `Pin chai nặng ${wear}%`,
        "Pin chỉ còn dưới 60% dung lượng gốc. Thời lượng dùng thực tế rất ngắn, cần thay pin.",
        evidence,
        "Trừ giá tiền thay pin hoặc thay pin trước khi bán.",
      );
    } else if (wear >= 20) {
      c.add(
        "BATTERY_WORN_MAJOR",
        "major",
        `Pin chai ${wear}%`,
        "Pin đã suy giảm đáng kể so với lúc mới. Người mua sẽ thấy rõ thời lượng ngắn hơn quảng cáo.",
        evidence,
        "Ghi rõ độ chai pin trong mô tả sản phẩm.",
      );
    } else if (wear >= 10) {
      c.add(
        "BATTERY_WORN_MINOR",
        "minor",
        `Pin chai ${wear}%`,
        "Mức suy giảm bình thường với máy đã qua sử dụng.",
        evidence,
        null,
      );
    } else {
      c.add(
        "BATTERY_GOOD",
        "info",
        `Pin còn tốt (chai ${wear}%)`,
        "Dung lượng pin gần như nguyên bản.",
        evidence,
        null,
      );
    }
  } else {
    c.add(
      "BATTERY_UNKNOWN",
      "minor",
      "Không đọc được độ chai pin",
      "Thiếu thông tin dung lượng thiết kế nên không tính được phần trăm chai.",
      null,
      "Chạy lại app với quyền quản trị.",
    );
  }

  if (b.cycleCount !== null) {
    if (b.cycleCount >= 1000) {
      c.add(
        "BATTERY_CYCLES_HIGH",
        "major",
        `Pin đã sạc ${b.cycleCount} chu kỳ`,
        "Vượt xa số chu kỳ thiết kế của phần lớn pin laptop (300–1000).",
        `Cycle count: ${b.cycleCount}`,
        "Nên thay pin.",
      );
    } else if (b.cycleCount >= 500) {
      c.add(
        "BATTERY_CYCLES_MEDIUM",
        "minor",
        `Pin đã sạc ${b.cycleCount} chu kỳ`,
        "Pin đã dùng nhiều, tuổi thọ còn lại hạn chế.",
        `Cycle count: ${b.cycleCount}`,
        null,
      );
    }
  }

  if (b.condition && !/normal|good|verified/i.test(b.condition)) {
    c.add(
      "BATTERY_CONDITION",
      "major",
      `Hệ thống báo tình trạng pin: ${b.condition}`,
      "Hệ điều hành đã đánh dấu pin cần được kiểm tra hoặc thay thế.",
      b.condition,
      "Thay pin.",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Ổ cứng                                                              */
/* ------------------------------------------------------------------ */

function analyzeStorage(profile: SystemProfile, c: FindingCollector): void {
  for (const disk of profile.storage) {
    if (disk.removable) continue;
    const label = disk.model || disk.device;
    const s = disk.smart;

    if (!s.available) {
      c.add(
        "SMART_UNAVAILABLE",
        "minor",
        `Không đọc được SMART của ${label}`,
        "Thiếu chỉ số sức khỏe ổ cứng — hạng mục quan trọng nhất khi mua máy cũ.",
        s.error,
        "Chạy app với quyền quản trị và cài smartmontools.",
      );
      continue;
    }

    if (s.healthy === false) {
      c.add(
        "SMART_FAILED",
        "critical",
        `Ổ cứng ${label} báo lỗi SMART`,
        "Ổ cứng tự đánh giá là sắp hỏng. Dữ liệu có nguy cơ mất bất cứ lúc nào.",
        "SMART overall-health: FAILED",
        "Thay ổ cứng ngay, không nên bán máy ở tình trạng này.",
      );
    }

    if (s.reallocatedSectors && s.reallocatedSectors > 0) {
      c.add(
        "SMART_REALLOCATED",
        "critical",
        `Ổ ${label} có ${s.reallocatedSectors} sector hỏng đã thay thế`,
        "Bề mặt đĩa/ô nhớ đã hỏng và được thay bằng vùng dự phòng. Con số này chỉ tăng chứ không giảm.",
        `Reallocated_Sector_Ct = ${s.reallocatedSectors}`,
        "Thay ổ cứng.",
      );
    }

    if (s.pendingSectors && s.pendingSectors > 0) {
      c.add(
        "SMART_PENDING",
        "critical",
        `Ổ ${label} có ${s.pendingSectors} sector đang chờ xử lý`,
        "Có vùng dữ liệu đọc lỗi, chưa kịp thay thế. Đây là dấu hiệu hỏng đang diễn ra.",
        `Current_Pending_Sector = ${s.pendingSectors}`,
        "Sao lưu dữ liệu và thay ổ.",
      );
    }

    if (s.mediaErrors && s.mediaErrors > 0) {
      c.add(
        "SMART_MEDIA_ERRORS",
        "major",
        `Ổ ${label} ghi nhận ${s.mediaErrors} lỗi media`,
        "Controller NVMe đã gặp lỗi không sửa được khi truy cập ô nhớ.",
        `Media and Data Integrity Errors = ${s.mediaErrors}`,
        "Theo dõi sát hoặc thay ổ.",
      );
    }

    if (s.percentageUsed !== null) {
      if (s.percentageUsed >= 80) {
        c.add(
          "SSD_LIFE_LOW",
          "major",
          `SSD ${label} đã dùng ${s.percentageUsed}% tuổi thọ ghi`,
          "Ổ gần chạm giới hạn độ bền ghi của nhà sản xuất.",
          `Percentage Used = ${s.percentageUsed}%`,
          "Trừ giá hoặc thay ổ mới.",
        );
      } else if (s.percentageUsed >= 40) {
        c.add(
          "SSD_LIFE_MEDIUM",
          "minor",
          `SSD ${label} đã dùng ${s.percentageUsed}% tuổi thọ ghi`,
          "Mức hao mòn trung bình.",
          `Percentage Used = ${s.percentageUsed}%`,
          null,
        );
      }
    }

    if (s.powerOnHours !== null) {
      if (s.powerOnHours >= 20000) {
        c.add(
          "DISK_HOURS_VERY_HIGH",
          "major",
          `Ổ ${label} đã chạy ${fmtHours(s.powerOnHours)}`,
          "Máy đã hoạt động rất nhiều, nhiều khả năng là máy văn phòng hoặc máy chạy liên tục.",
          `Power_On_Hours = ${s.powerOnHours}`,
          "Đối chiếu với mức giá và ngoại hình máy.",
        );
      } else if (s.powerOnHours >= 8000) {
        c.add(
          "DISK_HOURS_HIGH",
          "minor",
          `Ổ ${label} đã chạy ${fmtHours(s.powerOnHours)}`,
          "Thời gian sử dụng cao hơn mức trung bình của máy cá nhân.",
          `Power_On_Hours = ${s.powerOnHours}`,
          null,
        );
      } else {
        c.add(
          "DISK_HOURS_OK",
          "info",
          `Ổ ${label} đã chạy ${fmtHours(s.powerOnHours)}`,
          "Thời gian sử dụng ở mức bình thường.",
          `Power_On_Hours = ${s.powerOnHours}`,
          null,
        );
      }
    }

    if (s.dataWrittenBytes !== null && disk.sizeBytes > 0) {
      const tbw = s.dataWrittenBytes;
      // Quy đổi ra số lần ghi đầy ổ để so sánh được giữa các dung lượng khác nhau
      const driveWrites = tbw / disk.sizeBytes;
      if (driveWrites >= 600) {
        c.add(
          "SSD_TBW_HIGH",
          "major",
          `Ổ ${label} đã ghi ${fmtTB(tbw)}`,
          `Tương đương ghi đầy ổ ${Math.round(driveWrites)} lần — vượt mức bảo hành độ bền của đa số SSD tiêu dùng.`,
          `Total Bytes Written = ${fmtTB(tbw)}`,
          "Trừ giá hoặc thay ổ.",
        );
      } else {
        c.add(
          "SSD_TBW_INFO",
          "info",
          `Tổng dữ liệu đã ghi: ${fmtTB(tbw)}`,
          `Tương đương ghi đầy ổ khoảng ${driveWrites.toFixed(1)} lần.`,
          null,
          null,
        );
      }
    }

    if (s.powerCycles !== null && s.powerCycles >= 4000) {
      c.add(
        "DISK_POWER_CYCLES",
        "minor",
        `Máy đã bật/tắt ${s.powerCycles.toLocaleString("vi-VN")} lần`,
        "Số lần khởi động cao thường gặp ở máy dùng chung hoặc máy công ty.",
        `Power_Cycle_Count = ${s.powerCycles}`,
        null,
      );
    }

    if (
      s.unsafeShutdowns !== null &&
      s.powerCycles &&
      s.unsafeShutdowns > s.powerCycles * 0.3
    ) {
      c.add(
        "DISK_UNSAFE_SHUTDOWN",
        "minor",
        `${s.unsafeShutdowns} lần tắt máy đột ngột`,
        "Tỷ lệ tắt máy không đúng cách cao — có thể do lỗi nguồn, sập nguồn hoặc treo máy thường xuyên.",
        `Unsafe Shutdowns = ${s.unsafeShutdowns} / Power Cycles = ${s.powerCycles}`,
        null,
      );
    }

    if (disk.type === "HDD") {
      c.add(
        "DISK_IS_HDD",
        "info",
        `${label} là ổ cứng cơ (HDD)`,
        "Máy sẽ chậm hơn nhiều so với dùng SSD.",
        null,
        "Đề xuất khách nâng cấp lên SSD.",
      );
    }
  }

  if (profile.storage.filter((d) => !d.removable).length === 0) {
    c.add(
      "DISK_NONE",
      "critical",
      "Không phát hiện ổ cứng nào",
      "Máy không nhận ổ lưu trữ trong.",
      null,
      "Kiểm tra khe M.2/SATA và cáp ổ cứng.",
    );
  }
}

/* ------------------------------------------------------------------ */
/* RAM                                                                 */
/* ------------------------------------------------------------------ */

function analyzeMemory(profile: SystemProfile, c: FindingCollector): void {
  const modules = profile.memory.modules;
  if (modules.length < 2) {
    if (profile.memory.slotsTotal && profile.memory.slotsTotal > 1) {
      c.add(
        "RAM_SINGLE_CHANNEL",
        "minor",
        "RAM đang chạy single-channel",
        "Chỉ có một thanh RAM trong khi máy hỗ trợ nhiều khe. Hiệu năng đồ họa tích hợp giảm đáng kể.",
        `${modules.length}/${profile.memory.slotsTotal} khe được sử dụng`,
        "Gắn thêm một thanh RAM cùng thông số để chạy dual-channel.",
      );
    }
    return;
  }

  const makers = new Set(modules.map((m) => m.manufacturer).filter(Boolean));
  const speeds = new Set(
    modules.map((m) => m.clockSpeedMHz).filter((s) => s !== null),
  );
  const sizes = new Set(modules.map((m) => m.sizeBytes));

  if (makers.size > 1) {
    c.add(
      "RAM_MIXED_BRAND",
      "info",
      "RAM không đồng bộ hãng",
      "Các thanh RAM khác nhà sản xuất — dấu hiệu máy đã được nâng cấp hoặc thay linh kiện.",
      `Hãng: ${[...makers].join(", ")}`,
      "Xác nhận lại với khách rằng máy đã nâng cấp RAM.",
    );
  }

  if (speeds.size > 1) {
    c.add(
      "RAM_MIXED_SPEED",
      "minor",
      "RAM khác tốc độ bus",
      "Khi lắp lẫn, toàn bộ RAM sẽ chạy theo thanh chậm nhất.",
      `Bus: ${[...speeds].join(" / ")} MHz`,
      "Thay bằng bộ RAM cùng thông số nếu cần hiệu năng tối đa.",
    );
  }

  if (sizes.size > 1) {
    c.add(
      "RAM_MIXED_SIZE",
      "info",
      "RAM khác dung lượng giữa các thanh",
      "Máy vẫn chạy dual-channel một phần (flex mode) nhưng không tối ưu.",
      `Dung lượng: ${[...sizes].map((s) => `${s / 1024 ** 3} GB`).join(" / ")}`,
      null,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Màn hình — phát hiện dấu hiệu đã thay panel                         */
/* ------------------------------------------------------------------ */

function analyzeDisplay(profile: SystemProfile, c: FindingCollector): void {
  const internal =
    profile.displays.find((d) => d.builtin) ?? profile.displays[0];
  if (!internal) {
    c.add(
      "DISPLAY_NONE",
      "major",
      "Không đọc được thông tin màn hình",
      "Không lấy được EDID của panel.",
      null,
      "Chạy app với quyền quản trị.",
    );
    return;
  }

  const biosYear = Number(
    /(\d{4})/.exec(profile.machine.biosReleaseDate ?? "")?.[1] ?? NaN,
  );
  const panelYear = internal.manufactureYear;

  if (panelYear && Number.isFinite(biosYear)) {
    const gap = panelYear - biosYear;
    if (gap >= 2) {
      c.add(
        "DISPLAY_REPLACED_SUSPECT",
        "info",
        `Panel sản xuất năm ${panelYear}, máy xuất xưởng khoảng ${biosYear}`,
        "Màn hình mới hơn thân máy khá nhiều — nhiều khả năng panel đã được thay.",
        `Panel: tuần ${internal.manufactureWeek ?? "?"}/${panelYear} · BIOS: ${profile.machine.biosReleaseDate}`,
        "Kiểm tra kỹ viền màn, ron cao su và chất lượng panel thay thế.",
      );
    }
  }

  if (panelYear) {
    c.add(
      "DISPLAY_PANEL_INFO",
      "info",
      `Panel ${internal.model ?? "không rõ mã"} — sản xuất tuần ${internal.manufactureWeek ?? "?"}/${panelYear}`,
      "Thông tin gốc đọc từ EDID của panel, không thể sửa bằng phần mềm.",
      internal.serialNumber ? `Serial panel: ${internal.serialNumber}` : null,
      null,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Hệ thống, bản quyền, bảo mật                                        */
/* ------------------------------------------------------------------ */

function analyzeSystem(profile: SystemProfile, c: FindingCollector): void {
  if (profile.platform === "win32") {
    if (profile.machine.licenseActivated === false) {
      c.add(
        "WINDOWS_NOT_ACTIVATED",
        "minor",
        "Windows chưa được kích hoạt",
        "Máy đang dùng Windows chưa có bản quyền hợp lệ.",
        profile.machine.licenseChannel
          ? `Kênh: ${profile.machine.licenseChannel}`
          : null,
        "Kích hoạt bản quyền hoặc thông báo rõ cho khách.",
      );
    } else if (profile.machine.licenseChannel) {
      c.add(
        "WINDOWS_LICENSE",
        "info",
        `Bản quyền Windows: ${profile.machine.licenseChannel}`,
        profile.machine.licenseChannel.startsWith("OEM")
          ? "Bản quyền OEM đi theo máy — điểm cộng khi bán lại."
          : "Bản quyền không phải OEM, có thể không đi kèm máy khi bán.",
        null,
        null,
      );
    }

    if (profile.machine.tpmVersion === null) {
      c.add(
        "TPM_MISSING",
        "minor",
        "Không phát hiện TPM",
        "Thiếu TPM 2.0 thì máy không cài được Windows 11 theo cách chính thức.",
        null,
        "Kiểm tra xem BIOS có tùy chọn bật fTPM/PTT không.",
      );
    }

    if (profile.machine.secureBoot === false) {
      c.add(
        "SECUREBOOT_OFF",
        "info",
        "Secure Boot đang tắt",
        "Không phải lỗi phần cứng, nhưng cần bật để cài Windows 11 chuẩn.",
        null,
        "Bật Secure Boot trong BIOS.",
      );
    }
  }

  const gpuDiscrete = profile.graphics.filter((g) => g.isDiscrete);
  if (gpuDiscrete.length) {
    c.add(
      "GPU_DISCRETE",
      "info",
      `Có card đồ họa rời: ${gpuDiscrete.map((g) => g.model).join(", ")}`,
      "Cần chạy stress test GPU để chắc chắn card rời còn hoạt động ổn định.",
      null,
      null,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Nhiệt độ và độ ổn định (từ stress test)                             */
/* ------------------------------------------------------------------ */

export function analyzeStress(stress: StressResult, c: FindingCollector): void {
  if (stress.errors > 0) {
    c.add(
      "CPU_UNSTABLE",
      "critical",
      `CPU tính sai ${stress.errors} lần khi chịu tải`,
      "Các luồng chạy cùng phép tính nhưng cho kết quả khác nhau. Đây là dấu hiệu CPU/RAM không ổn định khi nóng.",
      `${stress.errors} sai lệch trên ${stress.threads} luồng`,
      "Kiểm tra tản nhiệt, thử hạ xung hoặc thay RAM rồi test lại.",
    );
  }

  if (stress.maxCpuTempC !== null) {
    if (stress.maxCpuTempC >= 98) {
      c.add(
        "THERMAL_CRITICAL",
        "critical",
        `CPU đạt ${stress.maxCpuTempC}°C khi tải nặng`,
        "Máy chạm ngưỡng bảo vệ nhiệt. Keo tản nhiệt khô hoặc quạt/khe tản bị bụi bít.",
        `Nhiệt độ tối đa: ${stress.maxCpuTempC}°C`,
        "Vệ sinh tản nhiệt và tra keo mới.",
      );
    } else if (stress.maxCpuTempC >= 92) {
      c.add(
        "THERMAL_HIGH",
        "major",
        `CPU đạt ${stress.maxCpuTempC}°C khi tải nặng`,
        "Nhiệt độ cao hơn mức mong muốn, hiệu năng sẽ bị giới hạn khi dùng lâu.",
        `Nhiệt độ tối đa: ${stress.maxCpuTempC}°C`,
        "Nên vệ sinh và tra keo tản nhiệt.",
      );
    } else {
      c.add(
        "THERMAL_OK",
        "info",
        `Nhiệt độ CPU tối đa ${stress.maxCpuTempC}°C`,
        "Hệ thống tản nhiệt hoạt động trong ngưỡng an toàn.",
        null,
        null,
      );
    }
  }

  if (stress.throttlePercent !== null) {
    if (stress.throttlePercent >= 35) {
      c.add(
        "THROTTLE_HEAVY",
        "major",
        `Xung CPU tụt ${stress.throttlePercent}% khi nóng`,
        "Máy phải giảm xung mạnh để hạ nhiệt, hiệu năng thực tế thấp hơn nhiều so với thông số.",
        `${stress.startFreqGHz} GHz → ${stress.minFreqGHz} GHz`,
        "Vệ sinh tản nhiệt, kiểm tra quạt có quay đủ vòng không.",
      );
    } else if (stress.throttlePercent >= 20) {
      c.add(
        "THROTTLE_MODERATE",
        "minor",
        `Xung CPU tụt ${stress.throttlePercent}% khi nóng`,
        "Mức giảm xung chấp nhận được với laptop mỏng nhẹ.",
        `${stress.startFreqGHz} GHz → ${stress.minFreqGHz} GHz`,
        null,
      );
    }
  }

  if (
    stress.maxFanRpm === null &&
    stress.maxCpuTempC !== null &&
    stress.maxCpuTempC > 80
  ) {
    c.add(
      "FAN_UNKNOWN",
      "info",
      "Không đọc được tốc độ quạt",
      "Máy nóng nhưng không có dữ liệu quạt để đối chiếu.",
      null,
      "Nghe tiếng quạt bằng tai và sờ khe thoát gió để xác nhận quạt có quay.",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Kết quả các bài test thủ công                                       */
/* ------------------------------------------------------------------ */

/** Điểm trừ khi một hạng mục test bị đánh trượt. */
const TEST_PENALTY: Record<string, number> = {
  keyboard: 12,
  touchpad: 10,
  "display-pixel": 14,
  "display-uniformity": 8,
  "display-color": 6,
  speaker: 6,
  microphone: 5,
  webcam: 5,
  ports: 8,
  "disk-benchmark": 8,
  "cpu-stress": 15,
  "memory-test": 18,
  "battery-drain": 10,
  physical: 6,
};

function analyzeTests(results: TestResult[], c: FindingCollector): void {
  for (const r of results) {
    if (r.status === "failed") {
      c.add(
        `TEST_FAILED_${r.id.toUpperCase()}`,
        "major",
        `Bài test "${r.name}" không đạt`,
        r.summary || "Kỹ thuật viên đánh dấu hạng mục này là lỗi.",
        r.notes || null,
        null,
      );
    } else if (r.status === "warning") {
      c.add(
        `TEST_WARN_${r.id.toUpperCase()}`,
        "minor",
        `Bài test "${r.name}" có lưu ý`,
        r.summary || "Hạng mục hoạt động nhưng chưa hoàn hảo.",
        r.notes || null,
        null,
      );
    }
  }

  const skipped = results.filter((r) => r.status === "skipped");
  if (skipped.length) {
    c.add(
      "TESTS_SKIPPED",
      "info",
      `${skipped.length} hạng mục chưa kiểm tra`,
      `Chưa chạy: ${skipped.map((s) => s.name).join(", ")}.`,
      null,
      "Hoàn tất các hạng mục còn lại để báo cáo đầy đủ.",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Chấm điểm                                                           */
/* ------------------------------------------------------------------ */

function letterFor(score: number): { letter: GradeLetter; label: string } {
  if (score >= 95)
    return { letter: "A+", label: "Như mới — không phát hiện vấn đề" };
  if (score >= 87)
    return { letter: "A", label: "Rất tốt — chỉ có hao mòn nhẹ" };
  if (score >= 74) return { letter: "B", label: "Tốt — có vài điểm cần lưu ý" };
  if (score >= 60) return { letter: "C", label: "Khá — cần sửa hoặc trừ giá" };
  if (score >= 45)
    return { letter: "D", label: "Yếu — nhiều lỗi cần khắc phục" };
  return {
    letter: "F",
    label: "Không đạt — không nên bán ở tình trạng hiện tại",
  };
}

/**
 * Tran diem theo muc do nghiem trong. Mot may co bo phan hong khong the xep hang A
 * du moi hang muc con lai deu tot - do la cach cua hang phan loai may cu.
 */
function severityCap(
  findings: Finding[],
  results: TestResult[],
): { cap: number; reason: string } | null {
  if (
    results.some((r) => r.status === "failed") ||
    findings.some((f) => f.severity === "critical")
  ) {
    return {
      cap: 73,
      reason:
        "Có hạng mục hỏng hoặc lỗi nghiêm trọng nên không thể xếp hạng A/B",
    };
  }
  if (findings.some((f) => f.severity === "major")) {
    return { cap: 86, reason: "Có lỗi đáng kể nên không thể xếp hạng A" };
  }
  return null;
}

export function computeGrade(
  findings: Finding[],
  results: TestResult[],
): Grade {
  const deductions: Grade["deductions"] = [];

  for (const f of findings) {
    if (f.severity === "info") continue;
    // Bài test trượt đã có thang điểm riêng, tránh trừ hai lần
    const testId = f.code.startsWith("TEST_FAILED_")
      ? f.code.replace("TEST_FAILED_", "").toLowerCase()
      : null;
    const points = testId
      ? (TEST_PENALTY[testId] ?? DEFAULT_PENALTY[f.severity])
      : DEFAULT_PENALTY[f.severity];
    if (points > 0) deductions.push({ reason: f.title, points });
  }

  const total = deductions.reduce((sum, d) => sum + d.points, 0);
  let score = Math.max(0, Math.min(100, 100 - total));

  const caps: { cap: number; reason: string }[] = [];
  const severity = severityCap(findings, results);
  if (severity) caps.push(severity);

  // Máy chưa test gì mà vẫn điểm cao thì báo cáo không có giá trị
  const executed = results.filter(
    (r) => r.status !== "pending" && r.status !== "skipped",
  ).length;
  const coverage = results.length ? executed / results.length : 0;
  if (coverage < 0.5) {
    caps.push({
      cap: 100 - Math.round((0.5 - coverage) * 40),
      reason: "Chưa chạy đủ các hạng mục kiểm tra nên báo cáo chưa đủ căn cứ",
    });
  }

  // Ghi phan bi ha tran thanh mot dong tru diem de tong luon khop voi diem cuoi
  for (const c of caps) {
    if (c.cap < score) {
      deductions.push({ reason: c.reason, points: score - c.cap });
      score = c.cap;
    }
  }

  const { letter, label } = letterFor(score);
  return {
    score,
    letter,
    label,
    deductions: deductions.sort((a, b) => b.points - a.points),
  };
}

/* ------------------------------------------------------------------ */
/* Hàm tổng                                                            */
/* ------------------------------------------------------------------ */

export interface AnalyzeInput {
  profile: SystemProfile;
  results: TestResult[];
  stress?: StressResult | null;
}

export function analyze(input: AnalyzeInput): {
  findings: Finding[];
  grade: Grade;
} {
  const c = new FindingCollector();
  analyzeBattery(input.profile, c);
  analyzeStorage(input.profile, c);
  analyzeMemory(input.profile, c);
  analyzeDisplay(input.profile, c);
  analyzeSystem(input.profile, c);
  if (input.stress) analyzeStress(input.stress, c);
  analyzeTests(input.results, c);

  const order: Record<FindingSeverity, number> = {
    critical: 0,
    major: 1,
    minor: 2,
    info: 3,
  };
  const findings = c.items.sort(
    (a, b) => order[a.severity] - order[b.severity],
  );
  return { findings, grade: computeGrade(findings, input.results) };
}
