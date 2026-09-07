import type { StorageDevice } from '@shared/types'
import { Card, InfoTable } from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import { bytes, dateTime, hours, num, percent, tb, text, wh } from '@/lib/format'

function yesNo(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value ? 'Có' : 'Không'
}

function SmartCard({ drive }: { drive: StorageDevice }) {
  const s = drive.smart
  return (
    <Card
      title={`${drive.model || drive.name} — ${bytes(drive.sizeBytes)}`}
      subtitle={`${drive.type} · ${text(drive.interfaceType)} · firmware ${text(drive.firmware)} · serial ${text(drive.serial)}`}
    >
      {!s.available ? (
        <p className="text-sm text-mist-400">
          Chưa đọc được SMART{s.error ? `: ${s.error}` : ''}. Chạy app với quyền quản trị hoặc cài
          smartmontools để lấy đủ số liệu tuổi thọ ổ.
        </p>
      ) : (
        <>
          <InfoTable
            rows={[
              ['Nguồn dữ liệu', text(s.source)],
              ['Tình trạng tổng quát', s.healthy === null ? '—' : s.healthy ? 'Bình thường' : 'CẢNH BÁO'],
              ['Số giờ đã chạy', s.powerOnHours !== null ? hours(s.powerOnHours) : '—'],
              ['Số lần bật tắt', num(s.powerCycles)],
              ['Tổng dữ liệu đã ghi', s.dataWrittenBytes !== null ? tb(s.dataWrittenBytes) : '—'],
              ['Tổng dữ liệu đã đọc', s.dataReadBytes !== null ? tb(s.dataReadBytes) : '—'],
              ['Tuổi thọ đã dùng', s.percentageUsed !== null ? percent(s.percentageUsed) : '—'],
              ['Nhiệt độ ổ', s.temperatureC !== null ? `${s.temperatureC} °C` : '—'],
              ['Sector hỏng đã thay', num(s.reallocatedSectors)],
              ['Sector chờ thay', num(s.pendingSectors)],
              ['Lỗi không sửa được', num(s.uncorrectableErrors)],
              ['Lỗi vùng nhớ (media error)', num(s.mediaErrors)],
              ['Lần tắt máy đột ngột', num(s.unsafeShutdowns)],
              ['Cờ cảnh báo nghiêm trọng', num(s.criticalWarning)]
            ]}
          />
          {s.attributes.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-accent-500">
                Toàn bộ {s.attributes.length} thuộc tính SMART
              </summary>
              <table className="mt-2 w-full text-[11px]">
                <thead className="text-mist-400">
                  <tr>
                    <th className="py-1 text-left">ID</th>
                    <th className="py-1 text-left">Tên</th>
                    <th className="py-1 text-right">Giá trị</th>
                    <th className="py-1 text-right">Tệ nhất</th>
                    <th className="py-1 text-right">Ngưỡng</th>
                    <th className="py-1 text-right">Thô</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {s.attributes.map((a) => (
                    <tr key={a.id} className="border-t border-ink-800">
                      <td className="py-1 tabular-nums">{a.id}</td>
                      <td className="py-1">{a.name}</td>
                      <td className="py-1 text-right tabular-nums">{a.value}</td>
                      <td className="py-1 text-right tabular-nums">{a.worst ?? '—'}</td>
                      <td className="py-1 text-right tabular-nums">{a.threshold ?? '—'}</td>
                      <td className="py-1 text-right tabular-nums">{a.raw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}

      {drive.partitions.length > 0 && (
        <div className="mt-3 space-y-1">
          {drive.partitions.map((p) => (
            <div key={p.mount} className="text-xs text-mist-300">
              <div className="flex justify-between">
                <span>
                  {p.mount} ({p.fsType})
                </span>
                <span className="tabular-nums">
                  {bytes(p.usedBytes)} / {bytes(p.sizeBytes)}
                </span>
              </div>
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full bg-accent-600"
                  style={{ width: `${p.sizeBytes ? (p.usedBytes / p.sizeBytes) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function SystemInfo() {
  const profile = useAppStore((s) => s.profile)
  if (!profile) return null
  const { machine, cpu, memory, battery } = profile

  return (
    <div className="space-y-4 pt-2">
      <header>
        <h1 className="text-lg font-semibold text-slate-100">Thông tin phần cứng</h1>
        <p className="text-xs text-mist-400">
          Quét lúc {dateTime(profile.collectedAt)} · quyền{' '}
          {profile.privileged ? 'quản trị' : 'người dùng thường'}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Card title="Máy và hệ điều hành">
          <InfoTable
            rows={[
              ['Hãng', text(machine.manufacturer)],
              ['Model', text(machine.model)],
              ['SKU / mã cấu hình', text(machine.sku)],
              ['Phiên bản', text(machine.version)],
              ['Serial number', text(machine.serial)],
              ['UUID', text(machine.uuid)],
              ['Kiểu vỏ máy', text(machine.chassisType)],
              ['BIOS', `${text(machine.biosVendor)} ${text(machine.biosVersion)}`],
              ['Ngày BIOS', text(machine.biosReleaseDate)],
              ['Ngày sản xuất ước tính', text(machine.estimatedManufactureDate)],
              ['Hệ điều hành', `${text(machine.osDistro)} ${text(machine.osRelease)}`],
              ['Build', text(machine.osBuild)],
              ['Kiến trúc', text(machine.osArch)],
              ['Tên máy', text(machine.hostname)],
              ['Kênh bản quyền', text(machine.licenseChannel)],
              ['Đã kích hoạt', yesNo(machine.licenseActivated)],
              ['Secure Boot', yesNo(machine.secureBoot)],
              ['TPM', text(machine.tpmVersion)]
            ]}
          />
        </Card>

        <Card title="Bộ xử lý">
          <InfoTable
            rows={[
              ['Tên đầy đủ', text(cpu.brand)],
              ['Hãng', text(cpu.manufacturer)],
              ['Họ / model / stepping', `${text(cpu.family)} / ${text(cpu.model)} / ${text(cpu.stepping)}`],
              ['Socket', text(cpu.socket)],
              ['Nhân vật lý', num(cpu.physicalCores)],
              ['Luồng', num(cpu.logicalCores)],
              [
                'Nhân hiệu năng / tiết kiệm',
                cpu.performanceCores !== null
                  ? `${cpu.performanceCores} P + ${cpu.efficiencyCores ?? 0} E`
                  : '—'
              ],
              ['Xung cơ bản', cpu.baseSpeedGHz ? `${cpu.baseSpeedGHz.toFixed(2)} GHz` : '—'],
              ['Xung tối đa', cpu.maxSpeedGHz ? `${cpu.maxSpeedGHz.toFixed(2)} GHz` : '—'],
              ['Cache L1d / L2 / L3', `${bytes(cpu.cacheL1dBytes)} / ${bytes(cpu.cacheL2Bytes)} / ${bytes(cpu.cacheL3Bytes)}`],
              ['Ảo hoá', yesNo(cpu.virtualizationEnabled)]
            ]}
          />
        </Card>
      </div>

      <Card
        title="Bộ nhớ RAM"
        subtitle={`${bytes(memory.totalBytes)} tổng · ${memory.slotsUsed}/${memory.slotsTotal ?? '?'} khe đang dùng`}
      >
        {memory.modules.length === 0 ? (
          <p className="text-sm text-mist-400">
            Không đọc được chi tiết từng thanh RAM (máy hàn chết RAM hoặc thiếu quyền).
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-mist-400">
              <tr>
                <th className="py-1 text-left">Khe</th>
                <th className="py-1 text-left">Dung lượng</th>
                <th className="py-1 text-left">Loại</th>
                <th className="py-1 text-left">Bus</th>
                <th className="py-1 text-left">Hãng</th>
                <th className="py-1 text-left">Part number</th>
                <th className="py-1 text-left">Serial</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {memory.modules.map((m, i) => (
                <tr key={i} className="border-t border-ink-800">
                  <td className="py-1.5">{text(m.slot)}</td>
                  <td className="py-1.5 tabular-nums">{bytes(m.sizeBytes)}</td>
                  <td className="py-1.5">{text(m.type)}</td>
                  <td className="py-1.5 tabular-nums">
                    {m.configuredClockMHz ?? m.clockSpeedMHz ?? '—'} MHz
                  </td>
                  <td className="py-1.5">{text(m.manufacturer)}</td>
                  <td className="py-1.5">{text(m.partNumber)}</td>
                  <td className="py-1.5">{text(m.serialNumber)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[11px] text-mist-400">
          RAM khác hãng hoặc khác bus giữa các khe là dấu hiệu máy đã được nâng cấp — hỏi rõ nguồn
          gốc thanh RAM thay thế.
        </p>
      </Card>

      {profile.storage.map((drive) => (
        <SmartCard key={drive.device} drive={drive} />
      ))}

      <div className="grid grid-cols-2 gap-3">
        <Card title="Pin">
          {!battery.hasBattery ? (
            <p className="text-sm text-mist-400">Máy không có pin hoặc pin không được nhận.</p>
          ) : (
            <InfoTable
              rows={[
                ['Hãng / model', `${text(battery.manufacturer)} ${text(battery.model)}`],
                ['Serial', text(battery.serial)],
                ['Hoá chất', text(battery.chemistry)],
                ['Dung lượng thiết kế', wh(battery.designedCapacityMWh)],
                ['Dung lượng tối đa hiện tại', wh(battery.maxCapacityMWh)],
                ['Sức khoẻ', percent(battery.healthPercent)],
                ['Độ chai', percent(battery.wearPercent)],
                ['Chu kỳ sạc', `${num(battery.cycleCount)}${battery.designCycleCount ? ` / ${battery.designCycleCount}` : ''}`],
                ['Điện áp', battery.voltageV ? `${battery.voltageV.toFixed(2)} V` : '—'],
                ['Công suất hiện tại', battery.powerW !== null ? `${battery.powerW.toFixed(1)} W` : '—'],
                ['Mức pin', percent(battery.percent)],
                ['Đang sạc', yesNo(battery.isCharging)],
                ['Cắm nguồn', yesNo(battery.acConnected)],
                ['Còn dùng được', battery.timeRemainingMin ? `${battery.timeRemainingMin} phút` : '—'],
                ['Tình trạng theo hệ thống', text(battery.condition)]
              ]}
            />
          )}
        </Card>

        <Card title="Màn hình và đồ hoạ">
          {profile.displays.map((d) => (
            <div key={d.index} className="mb-3 last:mb-0">
              <div className="mb-1 text-xs font-medium text-slate-100">
                {d.builtin ? 'Màn hình tích hợp' : 'Màn hình ngoài'} #{d.index + 1}
              </div>
              <InfoTable
                rows={[
                  ['Hãng panel', `${text(d.vendorName)}${d.vendorId ? ` (${d.vendorId})` : ''}`],
                  ['Model panel', text(d.model)],
                  ['Serial panel', text(d.serialNumber)],
                  [
                    'Độ phân giải',
                    d.nativeResX ? `${d.nativeResX} × ${d.nativeResY}` : `${d.currentResX} × ${d.currentResY}`
                  ],
                  ['Tần số quét', d.refreshRateHz ? `${d.refreshRateHz} Hz` : '—'],
                  ['Kích thước', d.sizeInches ? `${d.sizeInches.toFixed(1)} inch` : '—'],
                  [
                    'Tuần / năm sản xuất panel',
                    d.manufactureYear ? `Tuần ${d.manufactureWeek ?? '?'} / ${d.manufactureYear}` : '—'
                  ],
                  ['Kết nối', text(d.connection)]
                ]}
              />
            </div>
          ))}
          <div className="mt-3 border-t border-ink-800 pt-3">
            {profile.graphics.map((g, i) => (
              <div key={i} className="text-xs text-mist-300">
                <span className="text-slate-100">{g.model}</span> — {text(g.vendor)}
                {g.vramBytes ? ` · ${bytes(g.vramBytes)} VRAM` : ''}
                {g.driverVersion ? ` · driver ${g.driverVersion}` : ''}
                {g.isDiscrete ? ' · card rời' : ' · tích hợp'}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-mist-400">
            Năm sản xuất panel mới hơn nhiều so với ngày BIOS là dấu hiệu màn hình đã được thay.
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card title="Kết nối mạng">
          <table className="w-full text-xs">
            <thead className="text-mist-400">
              <tr>
                <th className="py-1 text-left">Thiết bị</th>
                <th className="py-1 text-left">Loại</th>
                <th className="py-1 text-left">MAC</th>
                <th className="py-1 text-left">Chuẩn hỗ trợ</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {profile.network.map((n, i) => (
                <tr key={i} className="border-t border-ink-800">
                  <td className="py-1.5">{text(n.name || n.iface)}</td>
                  <td className="py-1.5">{n.type}</td>
                  <td className="py-1.5 tabular-nums">{text(n.mac)}</td>
                  <td className="py-1.5">{n.standards.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Thiết bị âm thanh">
          <table className="w-full text-xs">
            <thead className="text-mist-400">
              <tr>
                <th className="py-1 text-left">Tên</th>
                <th className="py-1 text-left">Hãng</th>
                <th className="py-1 text-left">Vào / ra</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {profile.audio.map((a, i) => (
                <tr key={i} className="border-t border-ink-800">
                  <td className="py-1.5">
                    {text(a.name)}
                    {a.isDefault && <span className="ml-1 text-[10px] text-accent-500">mặc định</span>}
                  </td>
                  <td className="py-1.5">{text(a.manufacturer)}</td>
                  <td className="py-1.5">
                    {[a.isInput ? 'thu' : null, a.isOutput ? 'phát' : null].filter(Boolean).join(' + ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
