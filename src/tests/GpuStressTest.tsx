import { useEffect, useRef, useState } from 'react'
import { Flame, StopCircle } from 'lucide-react'
import { Button, ProgressBar, StatTile } from '@/components/ui'
import { Instruction } from './shared'
import { useSensorStream } from '@/lib/useSensorStream'
import { useAppStore } from '@/store/useAppStore'
import type { TestPanelProps } from './types'

const DURATIONS = [
  { sec: 180, label: '3 phút — kiểm nhanh' },
  { sec: 300, label: '5 phút — tiêu chuẩn' },
  { sec: 600, label: '10 phút — kỹ' }
]

/** Cạnh của khung hình nội bộ dùng để ép tải. */
const SIZE = 512
/** FPS mục tiêu sau khi tự chỉnh tải: đủ thấp để GPU luôn là nút thắt. */
const TARGET_FPS = 25

const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

/**
 * Mỗi lượt vẽ đọc kết quả của lượt trước rồi tính tiếp một vòng lặp fractal.
 * Phụ thuộc dây chuyền như vậy khiến driver không thể bỏ bớt lượt vẽ nào,
 * nhờ đó GPU thật sự phải chạy hết công suất.
 */
const FRAGMENT_SHADER = `
precision highp float;
uniform float uTime;
uniform float uIter;
uniform vec2 uSize;
uniform sampler2D uPrev;

void main() {
  vec2 uv = (gl_FragCoord.xy / uSize - 0.5) * 3.0;
  vec4 prev = texture2D(uPrev, gl_FragCoord.xy / uSize);
  vec2 c = uv + vec2(prev.r * 0.01 + uTime * 0.0001, prev.g * 0.01);
  vec2 z = vec2(0.0);
  float hits = 0.0;
  for (int i = 0; i < 256; i++) {
    if (float(i) >= uIter) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    hits += 1.0 / (1.0 + dot(z, z));
  }
  float v = fract(hits * 0.05 + prev.b * 0.5);
  gl_FragColor = vec4(v, v * 0.6, 1.0 - v, 1.0);
}
`

interface GpuRun {
  /** Tên GPU mà trình duyệt thật sự dùng để dựng hình */
  renderer: string
  /** Khung hình/giây của từng giây, dùng để nhìn ra lúc tụt hiệu năng */
  fps: number[]
  /** Số lượt vẽ mỗi khung sau khi tự chỉnh tải cho GPU này */
  passes: number
  durationSec: number
}

/** So FPS nửa đầu với nửa cuối để phát hiện GPU tụt hiệu năng khi nóng. */
function fpsDrop(fps: number[]): number | null {
  const samples = fps.slice(2)
  if (samples.length < 6) return null
  const median = (list: number[]): number => {
    const sorted = [...list].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }
  const half = Math.floor(samples.length / 2)
  const early = median(samples.slice(0, half))
  const late = median(samples.slice(half))
  if (!early) return null
  return Math.max(0, ((early - late) / early) * 100)
}

/** Gom mọi thao tác WebGL vào một chỗ để phần giao diện chỉ việc gọi step(). */
class GpuLoad {
  private gl: WebGLRenderingContext
  private uTime: WebGLUniformLocation | null
  private uIter: WebGLUniformLocation | null
  private front: { tex: WebGLTexture; fbo: WebGLFramebuffer }
  private back: { tex: WebGLTexture; fbo: WebGLFramebuffer }
  private pixel = new Uint8Array(4)
  readonly renderer: string

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', {
      powerPreference: 'high-performance',
      antialias: false
    })
    if (!gl) throw new Error('Máy không khởi tạo được WebGL — driver card màn hình có thể lỗi.')
    this.gl = gl

    const info = gl.getExtension('WEBGL_debug_renderer_info')
    this.renderer = String(
      gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
    )

    const program = this.buildProgram()
    this.uTime = gl.getUniformLocation(program, 'uTime')
    this.uIter = gl.getUniformLocation(program, 'uIter')
    gl.uniform2f(gl.getUniformLocation(program, 'uSize'), SIZE, SIZE)
    gl.uniform1i(gl.getUniformLocation(program, 'uPrev'), 0)

    this.front = this.createTarget()
    this.back = this.createTarget()
    gl.activeTexture(gl.TEXTURE0)
    gl.viewport(0, 0, SIZE, SIZE)
  }

  private compile(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type)
    if (!shader) throw new Error('Không tạo được shader')
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) ?? 'Lỗi biên dịch shader')
    }
    return shader
  }

  private buildProgram(): WebGLProgram {
    const gl = this.gl
    const program = gl.createProgram()
    if (!program) throw new Error('Không tạo được chương trình WebGL')
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Lỗi liên kết chương trình')
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const pos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    return program
  }

  /** Một khung hình ngoài màn: vẽ vào texture, không hiện lên canvas. */
  private createTarget(): { tex: WebGLTexture; fbo: WebGLFramebuffer } {
    const gl = this.gl
    const tex = gl.createTexture()
    const fbo = gl.createFramebuffer()
    if (!tex || !fbo) throw new Error('Không cấp phát được bộ nhớ đồ hoạ')
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    return { tex, fbo }
  }

  /**
   * Chạy `passes` lượt vẽ nối tiếp rồi hiện kết quả lên canvas.
   * readPixels ở cuối bắt CPU chờ GPU vẽ xong — không có chốt này thì lệnh vẽ
   * chỉ nằm trong hàng đợi và đồng hồ đo được sẽ không phản ánh sức GPU.
   */
  step(passes: number, timeMs: number): void {
    const gl = this.gl
    for (let i = 0; i < passes; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.back.fbo)
      gl.bindTexture(gl.TEXTURE_2D, this.front.tex)
      gl.uniform1f(this.uIter, 256)
      gl.uniform1f(this.uTime, timeMs + i)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      const swap = this.front
      this.front = this.back
      this.back = swap
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindTexture(gl.TEXTURE_2D, this.front.tex)
    gl.uniform1f(this.uIter, 1)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel)
  }
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()))

export default function GpuStressTest({ onFinish, onClose }: TestPanelProps) {
  const { profile, sensorHistory } = useAppStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stopRef = useRef(false)
  const [durationSec, setDurationSec] = useState(300)
  const [running, setRunning] = useState(false)
  const [percent, setPercent] = useState(0)
  const [liveFps, setLiveFps] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<GpuRun | null>(null)

  useSensorStream(running)

  // Rời panel giữa chừng thì phải dừng vòng vẽ, nếu không GPU vẫn bị ép tải
  useEffect(() => {
    return () => {
      stopRef.current = true
    }
  }, [])

  const discrete = profile?.graphics.filter((g) => g.isDiscrete) ?? []
  // Nhiet do GPU chi doc duoc tren mot so may Windows, macOS thuong tra ve null
  const gpuTemps = sensorHistory
    .map((s) => s.gpuTempC)
    .filter((t): t is number => t !== null && t > 0)
  const maxGpuTemp = gpuTemps.length ? Math.max(...gpuTemps) : null

  async function run(): Promise<void> {
    const canvas = canvasRef.current
    if (!canvas) return
    stopRef.current = false
    setRunning(true)
    setError('')
    setResult(null)
    setPercent(0)

    try {
      canvas.width = SIZE
      canvas.height = SIZE
      canvas.addEventListener(
        'webglcontextlost',
        (e) => {
          e.preventDefault()
          stopRef.current = true
          setError('GPU bị reset khi đang ép tải — dấu hiệu card hoặc driver không ổn định.')
        },
        { once: true }
      )
      const load = new GpuLoad(canvas)

      /** Đo FPS thực trong một khoảng ngắn với mức tải cho trước. */
      const sampleFps = async (passes: number, ms: number): Promise<number> => {
        let frames = 0
        const t0 = performance.now()
        while (performance.now() - t0 < ms && !stopRef.current) {
          load.step(passes, performance.now())
          await nextFrame()
          frames++
        }
        const elapsed = (performance.now() - t0) / 1000
        return elapsed > 0 ? frames / elapsed : 0
      }

      // Tự chỉnh tải: tăng dần số lượt vẽ tới khi FPS rơi về mức mục tiêu.
      // Cách này không phụ thuộc đồng hồ của driver nên đúng trên mọi card.
      let passes = 8
      for (let step = 0; step < 5 && !stopRef.current; step++) {
        const fps = await sampleFps(passes, 600)
        if (fps <= TARGET_FPS * 1.2) break
        passes = Math.max(1, Math.min(4096, Math.round((passes * fps) / TARGET_FPS)))
      }

      const fps: number[] = []
      const startedAt = performance.now()
      const endAt = startedAt + durationSec * 1000
      let windowStart = startedAt
      let windowFrames = 0

      while (performance.now() < endAt && !stopRef.current) {
        load.step(passes, performance.now())
        await nextFrame()
        windowFrames++
        const now = performance.now()
        if (now - windowStart >= 1000) {
          const value = (windowFrames * 1000) / (now - windowStart)
          fps.push(value)
          setLiveFps(value)
          windowFrames = 0
          windowStart = now
          setPercent(Math.min(100, ((now - startedAt) / (durationSec * 1000)) * 100))
        }
      }

      setResult({
        renderer: load.renderer,
        fps,
        passes,
        durationSec: Math.round((performance.now() - startedAt) / 1000)
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  function conclude(): void {
    if (!result) return
    const drop = fpsDrop(result.fps)
    const avg = result.fps.length ? result.fps.reduce((a, b) => a + b, 0) / result.fps.length : 0
    const min = result.fps.length ? Math.min(...result.fps) : 0
    const metrics: Record<string, string | number> = {
      'GPU dựng hình': result.renderer,
      'Thời lượng': `${result.durationSec} giây`,
      'FPS trung bình': avg.toFixed(1),
      'FPS thấp nhất': min.toFixed(1),
      'Tụt hiệu năng': drop !== null ? `${drop.toFixed(0)}%` : '—',
      'Nhiệt GPU cao nhất': maxGpuTemp !== null ? `${maxGpuTemp.toFixed(0)} °C` : 'không đọc được',
      'Mức tải': `${result.passes} lượt vẽ/khung`
    }

    if (result.fps.length < 5) {
      onFinish('warning', 'Chạy quá ngắn, chưa đủ dữ liệu kết luận', metrics)
    } else if ((maxGpuTemp !== null && maxGpuTemp >= 95) || (drop !== null && drop >= 40)) {
      onFinish(
        'failed',
        `GPU tụt hiệu năng ${drop?.toFixed(0)}% khi ép tải — tản nhiệt kém hoặc card đã yếu`,
        metrics
      )
    } else if ((maxGpuTemp !== null && maxGpuTemp >= 88) || (drop !== null && drop >= 20)) {
      onFinish('warning', `GPU tụt ${drop?.toFixed(0)}% sau khi nóng`, metrics)
    } else {
      onFinish('passed', `GPU chạy ổn định ${result.durationSec}s, FPS gần như không đổi`, metrics)
    }
  }

  const drop = result ? fpsDrop(result.fps) : null

  return (
    <div className="space-y-4">
      <Instruction>
        Ép GPU dựng liên tiếp hàng trăm lượt tính toán phụ thuộc nhau và theo dõi FPS. Card còn tốt
        giữ FPS gần như phẳng; card khô keo hoặc quạt yếu sẽ tụt dần sau vài phút.
        {discrete.length > 0
          ? ` Máy có card rời ${discrete.map((g) => g.model).join(', ')} — bài test yêu cầu hệ điều hành ưu tiên card rời, hãy đối chiếu tên GPU hiển thị bên dưới để chắc đúng card đang chạy.`
          : ' Máy không có card rời nên bài này ép GPU tích hợp trong CPU.'}
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
                  ? 'border-accent-600 bg-accent-600/20 text-accent-500'
                  : 'border-ink-600 text-mist-300 hover:text-slate-100'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {running ? (
          <Button variant="danger" onClick={() => (stopRef.current = true)}>
            <StopCircle size={14} />
            Dừng sớm
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void run()}>
            <Flame size={14} />
            Bắt đầu ép tải GPU
          </Button>
        )}
      </div>

      {running && (
        <ProgressBar
          percent={percent}
          label={`${liveFps.toFixed(0)} FPS${maxGpuTemp !== null ? ` — GPU ${maxGpuTemp.toFixed(0)} °C` : ''}`}
        />
      )}

      <canvas
        ref={canvasRef}
        className="h-44 w-full rounded-lg border border-ink-700 bg-ink-900 object-cover"
      />

      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {result && (
        <>
          <p className="text-xs text-mist-400">GPU dựng hình: {result.renderer}</p>
          <div className="grid grid-cols-4 gap-2">
            <StatTile
              label="FPS trung bình"
              value={(result.fps.reduce((a, b) => a + b, 0) / (result.fps.length || 1)).toFixed(0)}
              hint={`${result.passes} lượt vẽ/khung`}
            />
            <StatTile
              label="FPS thấp nhất"
              value={result.fps.length ? Math.min(...result.fps).toFixed(0) : '—'}
            />
            <StatTile
              label="Tụt hiệu năng"
              value={drop !== null ? `${drop.toFixed(0)}%` : '—'}
              tone={(drop ?? 0) >= 40 ? 'bad' : (drop ?? 0) >= 20 ? 'warn' : 'good'}
            />
            <StatTile
              label="Nhiệt GPU"
              value={maxGpuTemp !== null ? `${maxGpuTemp.toFixed(0)}°C` : '—'}
              hint={maxGpuTemp === null ? 'máy không cho đọc' : 'cao nhất'}
              tone={
                maxGpuTemp === null
                  ? 'good'
                  : maxGpuTemp >= 95
                    ? 'bad'
                    : maxGpuTemp >= 88
                      ? 'warn'
                      : 'good'
              }
            />
          </div>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="primary" onClick={conclude} disabled={!result}>
          Ghi kết quả
        </Button>
      </div>
    </div>
  )
}
