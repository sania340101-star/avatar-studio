'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { DEVICE_PRESETS, DEVICE_MASKS } from '@/lib/models';

interface DisplayState {
  device: 'hh1x3' | 'solo';
  transform: { offsetX: number; offsetY: number; scale: number };
  clipUrl: string;
  clipUrls: string[];
  activeClipIdx: number;
  loop: boolean;
}

export default function DisplayPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const channelRef = useRef<BroadcastChannel | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showClose, setShowClose] = useState(true);

  const [state, setState] = useState<DisplayState>({
    device: 'hh1x3',
    transform: { offsetX: 0, offsetY: 0, scale: 1 },
    clipUrl: '',
    clipUrls: [],
    activeClipIdx: 0,
    loop: true,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // BroadcastChannel listener
  useEffect(() => {
    const ch = new BroadcastChannel(`avatar-display-${sessionId}`);
    channelRef.current = ch;

    ch.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'init' || msg.type === 'update') {
        setState(prev => ({ ...prev, ...msg.state }));
      }
      if (msg.type === 'transform') {
        setState(prev => ({ ...prev, transform: msg.transform }));
      }
      if (msg.type === 'clip') {
        setState(prev => ({ ...prev, clipUrl: msg.clipUrl, activeClipIdx: msg.activeClipIdx }));
      }
    };

    ch.postMessage({ type: 'requestState' });

    return () => ch.close();
  }, [sessionId]);

  // Update video when clipUrl changes
  useEffect(() => {
    const vid = videoRef.current;
    if (vid && state.clipUrl) {
      vid.src = state.clipUrl;
      vid.load();
      vid.play().catch(() => {});
    }
  }, [state.clipUrl, state.activeClipIdx]);

  // Auto-enter fullscreen
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  // Auto-hide close button after 5s
  useEffect(() => {
    const timer = setTimeout(() => setShowClose(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard controls
  const sendTransform = useCallback((t: { offsetX: number; offsetY: number; scale: number }) => {
    setState(prev => ({ ...prev, transform: t }));
    channelRef.current?.postMessage({ type: 'transformFromDisplay', transform: t });
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const t = stateRef.current.transform;
      const step = e.shiftKey ? 20 : 5;
      const scaleStep = e.shiftKey ? 0.05 : 0.01;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          sendTransform({ ...t, offsetX: Math.round(t.offsetX - step) });
          break;
        case 'ArrowRight':
          e.preventDefault();
          sendTransform({ ...t, offsetX: Math.round(t.offsetX + step) });
          break;
        case 'ArrowUp':
          e.preventDefault();
          sendTransform({ ...t, offsetY: Math.round(t.offsetY - step) });
          break;
        case 'ArrowDown':
          e.preventDefault();
          sendTransform({ ...t, offsetY: Math.round(t.offsetY + step) });
          break;
        case '+':
        case '=':
          e.preventDefault();
          sendTransform({ ...t, scale: Math.min(3, Math.round((t.scale + scaleStep) * 100) / 100) });
          break;
        case '-':
        case '_':
          e.preventDefault();
          sendTransform({ ...t, scale: Math.max(0.5, Math.round((t.scale - scaleStep) * 100) / 100) });
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [sendTransform]);

  // Handle video ended — advance to next clip
  const handleVideoEnded = useCallback(() => {
    const s = stateRef.current;
    if (s.clipUrls.length <= 1) return;
    const next = (s.activeClipIdx + 1) % s.clipUrls.length;
    const nextUrl = s.clipUrls[next];
    if (nextUrl) {
      setState(prev => ({ ...prev, activeClipIdx: next, clipUrl: nextUrl }));
      channelRef.current?.postMessage({ type: 'clipAdvance', activeClipIdx: next });
    }
  }, []);

  const preset = DEVICE_PRESETS[state.device];
  const mask = DEVICE_MASKS[state.device];
  const maskId = 'display-mask';

  if (!state.clipUrl) {
    return (
      <div
        style={{ background: '#000', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}
        onClick={() => setShowClose(true)}
      >
        <p style={{ color: '#666', fontSize: 14 }}>Waiting for connection from editor...</p>
        <button
          onClick={() => window.close()}
          style={{ padding: '8px 24px', borderRadius: 8, background: '#333', color: '#aaa', border: 'none', fontSize: 13, cursor: 'pointer' }}
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ background: '#000', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}
      onClick={() => setShowClose(prev => !prev)}
    >
      {/* Close button */}
      {showClose && (
        <button
          onClick={(e) => { e.stopPropagation(); window.close(); }}
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', fontSize: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✕
        </button>
      )}

      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg
          viewBox={`0 0 ${preset.width} ${preset.height}`}
          style={{ maxWidth: '100vw', maxHeight: '100vh', width: 'auto', height: '100vh' }}
        >
          <defs>
            <clipPath id={maskId}>
              {mask.circles.map((c, i) => (
                <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />
              ))}
            </clipPath>
          </defs>

          <foreignObject
            x={0} y={0}
            width={preset.width} height={preset.height}
            clipPath={`url(#${maskId})`}
          >
            <div style={{ width: preset.width, height: preset.height, overflow: 'hidden', position: 'relative' }}>
              <video
                ref={videoRef}
                autoPlay
                loop={state.loop && state.clipUrls.length <= 1}
                muted
                playsInline
                onEnded={handleVideoEnded}
                style={{
                  position: 'absolute',
                  left: state.transform.offsetX,
                  top: state.transform.offsetY,
                  width: preset.width * state.transform.scale,
                  height: preset.height * state.transform.scale,
                  objectFit: 'cover',
                }}
              />
            </div>
          </foreignObject>
        </svg>
      </div>
    </div>
  );
}
