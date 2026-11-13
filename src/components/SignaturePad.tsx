import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (dataUrl: string) => void
}

const W = 600
const H = 180

/** 指・ペン・マウスで自署できる欄。値は PNG の data URL */
export default function SignaturePad({ value, onChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  // 保存済みの署名を描き戻す（自分で描いた直後は描き直さない）
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || dirty.current) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, W, H)
      img.src = value
    }
  }, [value])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = e.currentTarget.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
    ctx.beginPath()
    ctx.moveTo(x, y)
    drawing.current = true
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    dirty.current = true
    onChange(e.currentTarget.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = ref.current!
    canvas.getContext('2d')!.clearRect(0, 0, W, H)
    dirty.current = false
    onChange('')
  }

  return (
    <div className="sigpad">
      <canvas
        ref={ref}
        width={W}
        height={H}
        aria-label="自署欄"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="sigpad-foot">
        <span className="hint">この枠の中に指・ペン・マウスで署名してください</span>
        <button type="button" className="btn small" onClick={clear}>
          書き直す
        </button>
      </div>
    </div>
  )
}
