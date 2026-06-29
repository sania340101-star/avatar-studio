'use client';

interface StepBarProps {
  current: 'input' | 'review' | 'generating';
  hasPrepared: boolean;
  isPreparing: boolean;
  onStepClick: (step: 'input' | 'review') => void;
}

export default function StepBar({ current, hasPrepared, isPreparing, onStepClick }: StepBarProps) {
  const isGenerating = current === 'generating';
  const step1Active = current === 'input';
  const step2Active = current === 'review' || isGenerating;

  return (
    <div className="flex items-center gap-2 mb-5">
      <button
        onClick={() => !isGenerating && onStepClick('input')}
        disabled={isGenerating}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all disabled:cursor-not-allowed"
        style={{
          background: step1Active ? 'var(--accent)' : 'var(--accent-subtle)',
          color: step1Active ? 'white' : 'var(--accent)',
        }}
      >
        <span className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center"
          style={{
            background: step1Active ? 'rgba(255,255,255,0.25)' : 'var(--accent)',
            color: 'white',
          }}>
          {hasPrepared && !step1Active ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : '1'}
        </span>
        Configure
        {isPreparing && (
          <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
            style={{ borderColor: step1Active ? 'rgba(255,255,255,0.3)' : 'var(--border)', borderTopColor: step1Active ? 'white' : 'var(--accent)' }} />
        )}
      </button>

      <div className="flex-1 h-px" style={{ background: hasPrepared ? 'var(--accent)' : 'var(--border)' }} />

      <button
        onClick={() => hasPrepared && !isGenerating && onStepClick('review')}
        disabled={!hasPrepared || isGenerating}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: step2Active ? 'var(--accent)' : 'var(--bg-input)',
          color: step2Active ? 'white' : 'var(--text3)',
        }}
      >
        <span className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center"
          style={{
            background: step2Active ? 'rgba(255,255,255,0.25)' : 'var(--border)',
            color: step2Active ? 'white' : 'var(--text3)',
          }}>2</span>
        Review
        {isGenerating && (
          <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
            style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
        )}
      </button>
    </div>
  );
}
