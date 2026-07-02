'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { DEVICE_PRESETS, DEVICE_MASKS } from '@/lib/models';

interface MaskPreviewProps {
  device: 'hh1x3' | 'solo';
  videoUrl: string;
  transform: { offsetX: number; offsetY: number; scale: number };
  onTransformChange: (t: { offsetX: number; offsetY: number; scale: number }) => void;
  loop?: boolean;
  onVideoEnded?: () => void;
}

export default function MaskPreview({ device, videoUrl, transform, onTransformChange, loop = true, onVideoEnded }: MaskPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const preset = DEVICE_PRESETS[device];
  const mask = DEVICE_MASKS[device];
  const maskId = `mask-${device}`;

  const displayScale = useRef(1);

  useEffect(() => {
    const vid = videoElRef.current;
    if (vid) {
      vid.src = videoUrl;
      vid.load();
      vid.play().catch(() => {});
    }
  }, [videoUrl]);

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
    containerRef.current?.setPointerCapture(e.pointerId);
  }, [transform.offsetX, transform.offsetY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const ds = displayScale.current;
    const dx = (e.clientX - dragStart.current.x) / ds;
    const dy = (e.clientY - dragStart.current.y) / ds;
    onTransformChange({
      ...transform,
      offsetX: dragStart.current.ox + dx,
      offsetY: dragStart.current.oy + dy,
    });
  }, [dragging, transform, onTransformChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setDragging(false);
    containerRef.current?.releasePointerCapture(e.pointerId);
    onTransformChange({
      ...transform,
      offsetX: Math.round(transform.offsetX),
      offsetY: Math.round(transform.offsetY),
    });
  }, [transform, onTransformChange]);

  const adjustScale = useCallback((delta: number) => {
    const newScale = Math.max(0.5, Math.min(3, transform.scale + delta));
    onTransformChange({ ...transform, scale: Math.round(newScale * 100) / 100 });
  }, [transform, onTransformChange]);

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
                ref={videoElRef}
                autoPlay
                loop={loop}
                muted
                playsInline
                onEnded={onVideoEnded}
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

          {/* Mask outline — visible circles */}
          {mask.circles.map((c, i) => (
            <circle
              key={`outline-${i}`}
              cx={c.cx} cy={c.cy} r={c.r}
              fill="none"
              stroke="rgba(255,255,0,0.8)"
              strokeWidth="3"
            />
          ))}

          {/* Display center dots */}
          {mask.circles.map((c, i) => (
            <g key={`center-${i}`}>
              <circle cx={c.cx} cy={c.cy} r="6" fill="rgba(255,255,255,0.9)" />
              <circle cx={c.cx} cy={c.cy} r="2" fill="rgba(0,0,0,0.6)" />
            </g>
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
      <div className="flex items-center gap-2">
        <button
          onClick={() => adjustScale(-0.01)}
          className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-sm font-bold"
          style={{ background: 'var(--bg-input)', color: 'var(--text2)' }}
        >
          −
        </button>
        <input
          type="range"
          min="0.5"
          max="3"
          step="0.01"
          value={transform.scale}
          onChange={e => onTransformChange({ ...transform, scale: parseFloat(e.target.value) })}
          className="flex-1 accent-[var(--accent)]"
          style={{ background: 'transparent', border: 'none', padding: 0, minWidth: 0 }}
        />
        <button
          onClick={() => adjustScale(0.01)}
          className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-sm font-bold"
          style={{ background: 'var(--bg-input)', color: 'var(--text2)' }}
        >
          +
        </button>
        <span className="text-xs w-10 text-right flex-shrink-0" style={{ color: 'var(--text3)' }}>
          {(transform.scale * 100).toFixed(0)}%
        </span>
      </div>

      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text3)' }}>
        <div className="flex gap-3">
          <span>X: {transform.offsetX}px</span>
          <span>Y: {transform.offsetY}px</span>
          <span>{preset.width}×{preset.height}</span>
        </div>
        <button
          onClick={() => onTransformChange({ offsetX: 0, offsetY: 0, scale: 1 })}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: 'var(--bg-input)', color: 'var(--text2)' }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
