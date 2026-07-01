'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { DEVICE_PRESETS, DEVICE_MASKS } from '@/lib/models';

interface MaskPreviewProps {
  device: 'hh1x3' | 'solo';
  videoUrl: string;
  transform: { offsetX: number; offsetY: number; scale: number };
  onTransformChange: (t: { offsetX: number; offsetY: number; scale: number }) => void;
}

export default function MaskPreview({ device, videoUrl, transform, onTransformChange }: MaskPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const preset = DEVICE_PRESETS[device];
  const mask = DEVICE_MASKS[device];
  const maskId = `mask-${device}`;

  const displayScale = useRef(1);

  useEffect(() => {
    function updateScale() {
      if (!containerRef.current) return;
      const containerW = containerRef.current.clientWidth;
      displayScale.current = containerW / preset.width;
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [preset.width]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: transform.offsetX, oy: transform.offsetY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [transform.offsetX, transform.offsetY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const ds = displayScale.current;
    const dx = (e.clientX - dragStart.current.x) / ds;
    const dy = (e.clientY - dragStart.current.y) / ds;
    onTransformChange({
      ...transform,
      offsetX: Math.round(dragStart.current.ox + dx),
      offsetY: Math.round(dragStart.current.oy + dy),
    });
  }, [dragging, transform, onTransformChange]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-lg border"
        style={{
          aspectRatio: `${preset.width} / ${preset.height}`,
          borderColor: 'var(--border)',
          background: '#000',
          maxHeight: '70vh',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <svg
          viewBox={`0 0 ${preset.width} ${preset.height}`}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            <clipPath id={maskId}>
              {mask.circles.map((c, i) => (
                <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />
              ))}
            </clipPath>
          </defs>

          {/* Video positioned with transform */}
          <foreignObject
            x={0} y={0}
            width={preset.width} height={preset.height}
            clipPath={`url(#${maskId})`}
          >
            <div
              style={{
                width: preset.width,
                height: preset.height,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <video
                src={videoUrl}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  position: 'absolute',
                  left: transform.offsetX,
                  top: transform.offsetY,
                  width: preset.width * transform.scale,
                  height: preset.height * transform.scale,
                  objectFit: 'cover',
                }}
              />
            </div>
          </foreignObject>

          {/* Mask outline */}
          {mask.circles.map((c, i) => (
            <circle
              key={`outline-${i}`}
              cx={c.cx} cy={c.cy} r={c.r}
              fill="none"
              stroke="rgba(255,255,0,0.4)"
              strokeWidth="2"
            />
          ))}

          {/* Dim area outside mask */}
          <mask id={`${maskId}-inv`}>
            <rect x="0" y="0" width={preset.width} height={preset.height} fill="white" />
            {mask.circles.map((c, i) => (
              <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="black" />
            ))}
          </mask>
          <rect
            x="0" y="0"
            width={preset.width} height={preset.height}
            fill="rgba(0,0,0,0.7)"
            mask={`url(#${maskId}-inv)`}
          />
        </svg>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text3)' }}>Scale</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.05"
            value={transform.scale}
            onChange={e => onTransformChange({ ...transform, scale: parseFloat(e.target.value) })}
            className="flex-1 accent-[var(--accent)]"
            style={{ background: 'transparent', border: 'none', padding: 0 }}
          />
          <span className="text-xs w-10 text-right" style={{ color: 'var(--text3)' }}>
            {(transform.scale * 100).toFixed(0)}%
          </span>
        </div>
        <button
          onClick={() => onTransformChange({ offsetX: 0, offsetY: 0, scale: 1 })}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: 'var(--bg-input)', color: 'var(--text2)' }}
        >
          Reset
        </button>
      </div>

      <div className="flex gap-4 text-xs" style={{ color: 'var(--text3)' }}>
        <span>X: {transform.offsetX}px</span>
        <span>Y: {transform.offsetY}px</span>
        <span>{preset.width}×{preset.height} @ {preset.fps}fps</span>
      </div>
    </div>
  );
}
