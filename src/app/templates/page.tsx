'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppShell from '@/components/AppShell';
import TemplateTabs from '@/components/TemplateTabs';
import { useProject } from '@/lib/ProjectContext';
import { Template, TemplateSlot, TemplateRef, VideoModelTypeFilter } from '@/lib/types';
import ShareDialog from '@/components/ShareDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  VIDEO_MODEL_OPTIONS, VIDEO_MODEL_GROUPS,
  VIDEO_MODEL_TYPE_FILTERS, filterVideoModelsByType,
  VIDEO_ASPECT_RATIO_OPTIONS, VIDEO_QUALITY_OPTIONS, VIDEO_FPS_OPTIONS,
  VIDEO_STRATEGY_OPTIONS, isVideoModelGroupId,
} from '@/lib/models';
import ImagePicker from '@/components/ImagePicker';
import ReferenceUpload from '@/components/ReferenceUpload';
import { getTemplateView, setTemplateView } from '@/lib/nav-state';

type View = 'list' | 'edit';
const TEMPLATE_FORM_KEY = 'avatar-studio:template-form';

function makeSlotId(): string {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultSlot(): TemplateSlot {
  return {
    id: makeSlotId(),
    modelId: 'auto',
    modelLabel: 'Auto (agent selects)',
    typeFilter: 'all',
    instruction: '',
    duration: 5,
    aspectRatio: '9:16',
    quality: '1k',
    fps: 24,
    strategy: 'balance',
    references: [],
  };
}

function cloneSlot(slot: TemplateSlot): TemplateSlot {
  return {
    ...slot,
    id: makeSlotId(),
    references: slot.references.map(r => ({ ...r })),
  };
}

function TemplatesContent() {
  const { user, activeProject } = useProject();
  const [view, setView] = useState<View>(() => {
    const saved = getTemplateView();
    if (saved?.view === 'edit') return 'edit';
    return 'list';
  });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(() => {
    const saved = getTemplateView();
    return (saved?.data as Template) || null;
  });

  const load = useCallback(async () => {
    const res = await fetch('/api/templates');
    const data = await res.json();
    if (Array.isArray(data)) setTemplates(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (view === 'list') {
      setTemplateView(null);
      sessionStorage.removeItem(TEMPLATE_FORM_KEY);
    } else {
      setTemplateView(view, editingTemplate);
    }
  }, [view, editingTemplate]);

  function handleEdit(tmpl: Template) {
    sessionStorage.removeItem(TEMPLATE_FORM_KEY);
    setEditingTemplate(tmpl);
    setView('edit');
  }

  async function handleDelete(id: string) {
    await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
    load();
  }

  async function handleCreate() {
    sessionStorage.removeItem(TEMPLATE_FORM_KEY);
    const body = {
      name: 'New Template',
      description: '',
      type: 'video' as const,
      device: 'any',
      promptTemplate: '',
      slots: [defaultSlot()],
      createdBy: user?.userId || '',
    };
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const created = await res.json();
      setEditingTemplate(created);
      setView('edit');
    }
  }

  return (
    <div>
      {view === 'list' && (
        <TemplateList
          templates={templates}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCreate={handleCreate}
          onReload={load}
        />
      )}
      {view === 'edit' && editingTemplate && (
        <TemplateForm
          userId={user?.userId || ''}
          existing={editingTemplate}
          onBack={() => { load(); setView('list'); }}
        />
      )}
    </div>
  );
}

function TemplateList({ templates, onEdit, onDelete, onCreate, onReload }: {
  templates: Template[];
  onEdit: (t: Template) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onReload: () => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [shareTemplate, setShareTemplate] = useState<{ id: string; name: string } | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  async function handleDuplicate(id: string) {
    setDuplicating(id);
    const res = await fetch('/api/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType: 'template', entityId: id }),
    });
    if (res.ok) onReload();
    setDuplicating(null);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <TemplateTabs />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-semibold">Slot Templates</h2>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>Reusable generation presets with multiple slots</p>
        </div>
        <button onClick={onCreate} className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
          + New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--text2)' }}>No templates yet</p>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>Create a template with model + params + references for batch generation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(tmpl => {
            const slots = tmpl.slots || [];
            const slotCount = slots.length;
            const models = [...new Set(slots.map(s => s.modelLabel))];
            const totalRefs = slots.reduce((sum, s) => sum + s.references.length, 0);

            return (
              <div
                key={tmpl.id}
                className="rounded-xl border p-4 cursor-pointer hover:border-[var(--accent)] transition-colors"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                onClick={() => onEdit(tmpl)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{tmpl.name}</h3>
                    {tmpl.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>{tmpl.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                      {slotCount} slot{slotCount !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShareTemplate({ id: tmpl.id, name: tmpl.name }); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center opacity-50 hover:opacity-100 flex-shrink-0"
                      style={{ color: 'var(--text3)' }}
                      title="Share"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(tmpl.id); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center opacity-50 hover:opacity-100 flex-shrink-0"
                      style={{ color: 'var(--text3)', opacity: duplicating === tmpl.id ? 1 : undefined }}
                      title="Duplicate"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(tmpl.id); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center opacity-50 hover:opacity-100 flex-shrink-0"
                      style={{ color: 'var(--red)' }}
                      title="Delete"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  {models.map((m, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{m}</span>
                  ))}
                  {totalRefs > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{totalRefs} ref{totalRefs !== 1 ? 's' : ''}</span>
                  )}
                </div>

                {tmpl.promptTemplate && (
                  <p className="text-sm line-clamp-2" style={{ color: 'var(--text2)' }}>{tmpl.promptTemplate}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          open={true}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
          title="Delete template?"
          description="This action cannot be undone."
        />
      )}

      {shareTemplate && (
        <ShareDialog
          entityType="template"
          entityId={shareTemplate.id}
          entityName={shareTemplate.name}
          onClose={() => setShareTemplate(null)}
        />
      )}
    </div>
  );
}

function SlotCard({ slot, index, total, onChange, onRemove }: {
  slot: TemplateSlot;
  index: number;
  total: number;
  onChange: (updated: TemplateSlot) => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [pricing, setPricing] = useState<{ amount: number; currency: string; unit: string } | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  useEffect(() => {
    setPricing(null);
    if (slot.modelId === 'auto' || isVideoModelGroupId(slot.modelId)) return;
    setPricingLoading(true);
    const ctrl = new AbortController();
    fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: slot.modelId }),
      signal: ctrl.signal,
    })
      .then(r => r.json())
      .then(data => { if (data.amount != null) setPricing({ amount: data.amount, currency: data.currency || 'USD', unit: data.details || '' }); })
      .catch(() => {})
      .finally(() => setPricingLoading(false));
    return () => ctrl.abort();
  }, [slot.modelId]);

  const filteredModels = filterVideoModelsByType(slot.typeFilter as VideoModelTypeFilter);
  function updateField<K extends keyof TemplateSlot>(key: K, value: TemplateSlot[K]) {
    onChange({ ...slot, [key]: value });
  }

  function handleModelChange(modelId: string) {
    let label = modelId;
    if (modelId === 'auto') label = 'Auto (agent selects)';
    else if (isVideoModelGroupId(modelId)) {
      const g = VIDEO_MODEL_GROUPS.find(g => `group:${g.id}` === modelId);
      label = g ? g.label : modelId;
    } else {
      const opt = VIDEO_MODEL_OPTIONS.find(m => m.id === modelId);
      label = opt?.label || modelId;
    }
    onChange({ ...slot, modelId, modelLabel: label });
  }

  function handleTypeFilterChange(tf: string) {
    if (slot.modelId !== 'auto' && !isVideoModelGroupId(slot.modelId)) {
      const models = filterVideoModelsByType(tf as VideoModelTypeFilter);
      if (!models.find(m => m.id === slot.modelId)) {
        onChange({ ...slot, typeFilter: tf, modelId: 'auto', modelLabel: 'Auto (agent selects)' });
        return;
      }
    }
    onChange({ ...slot, typeFilter: tf });
  }

  const showStrategy = slot.modelId === 'auto' || isVideoModelGroupId(slot.modelId);

  // Split references by type for the UI
  const imageRefs = slot.references.filter(r => r.type === 'image');
  const videoRefs = slot.references.filter(r => r.type === 'video');
  const audioRefs = slot.references.filter(r => r.type === 'audio');

  function setRefsByType(type: TemplateRef['type'], refs: TemplateRef[]) {
    const other = slot.references.filter(r => r.type !== type);
    onChange({ ...slot, references: [...other, ...refs] });
  }

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
          #{index + 1}
        </span>
        <span className="text-sm font-medium truncate" style={{ color: 'var(--text1)' }}>
          {slot.modelId === 'auto' ? 'Auto' : slot.modelLabel}
        </span>
        {pricing && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            ~${(pricing.unit.toLowerCase().includes('second') ? pricing.amount * slot.duration : pricing.amount).toFixed(2)}
          </span>
        )}
        {pricingLoading && !pricing && (
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text3)' }}>$…</span>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
            {slot.duration}s
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
            {slot.aspectRatio}
          </span>
          {slot.references.filter(r => r.type === 'image').length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
              {slot.references.filter(r => r.type === 'image').length} img
            </span>
          )}
          {slot.references.filter(r => r.type === 'video').length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
              {slot.references.filter(r => r.type === 'video').length} vid
            </span>
          )}
          {slot.references.filter(r => r.type === 'audio').length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
              {slot.references.filter(r => r.type === 'audio').length} aud
            </span>
          )}
          {total > 1 && (
            <button
              onClick={e => { e.stopPropagation(); onRemove(); }}
              className="text-xs px-1.5 py-0.5 rounded opacity-50 hover:opacity-100"
              style={{ color: 'var(--red)' }}
            >
              ×
            </button>
          )}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-90'}`}
            style={{ color: 'var(--text3)' }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="space-y-2 p-3 rounded-lg mt-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--text3)' }}>References</p>

            <ImagePicker
              value={imageRefs[0]?.url || ''}
              onChange={url => {
                const rest = imageRefs.slice(1);
                const newRefs = url ? [{ url, type: 'image' as const, name: 'Source image' }, ...rest] : rest;
                setRefsByType('image', newRefs);
              }}
              label="Source Image"
            />

            <ImagePicker
              value={imageRefs[1]?.url || ''}
              onChange={url => {
                const first = imageRefs[0] ? [imageRefs[0]] : [];
                const newRefs = url ? [...first, { url, type: 'image' as const, name: 'End image' }] : first;
                setRefsByType('image', newRefs);
              }}
              label="End Image (optional)"
            />

            <ReferenceUpload
              references={videoRefs}
              onChange={refs => setRefsByType('video', refs)}
              accept="video/*"
              label="Source Video (optional)"
            />

            <ReferenceUpload
              references={audioRefs}
              onChange={refs => setRefsByType('audio', refs)}
              accept="audio/*"
              label="Audio File (optional)"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`select-slot-model-${slot.id}`} className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Model</label>
              <select id={`select-slot-model-${slot.id}`} value={slot.modelId} onChange={e => handleModelChange(e.target.value)} className="w-full text-sm">
                <option value="auto">Auto (agent selects)</option>
                <optgroup label="By Group">
                  {VIDEO_MODEL_GROUPS.map(g => (
                    <option key={g.id} value={`group:${g.id}`}>{g.label} ({g.modelIds.length})</option>
                  ))}
                </optgroup>
                <optgroup label="Specific Model">
                  {filteredModels.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label htmlFor={`select-slot-type-filter-${slot.id}`} className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Type Filter</label>
              <select id={`select-slot-type-filter-${slot.id}`} value={slot.typeFilter} onChange={e => handleTypeFilterChange(e.target.value)} className="w-full text-sm">
                {VIDEO_MODEL_TYPE_FILTERS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor={`select-slot-duration-${slot.id}`} className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Duration</label>
              <select id={`select-slot-duration-${slot.id}`} value={slot.duration} onChange={e => updateField('duration', Number(e.target.value))} className="w-full text-sm">
                {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map(d => <option key={d} value={d}>{d}s</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`select-slot-aspect-ratio-${slot.id}`} className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Aspect Ratio</label>
              <select id={`select-slot-aspect-ratio-${slot.id}`} value={slot.aspectRatio} onChange={e => updateField('aspectRatio', e.target.value)} className="w-full text-sm">
                {VIDEO_ASPECT_RATIO_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`select-slot-quality-${slot.id}`} className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Quality</label>
              <select id={`select-slot-quality-${slot.id}`} value={slot.quality} onChange={e => updateField('quality', e.target.value)} className="w-full text-sm">
                {VIDEO_QUALITY_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`select-slot-fps-${slot.id}`} className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>FPS</label>
              <select id={`select-slot-fps-${slot.id}`} value={slot.fps} onChange={e => updateField('fps', Number(e.target.value))} className="w-full text-sm">
                {VIDEO_FPS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {showStrategy && (
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Strategy</label>
              <div className="grid grid-cols-3 gap-2">
                {VIDEO_STRATEGY_OPTIONS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => updateField('strategy', s.id)}
                    className="py-2 rounded-lg text-xs font-medium transition-colors text-center"
                    style={{
                      background: slot.strategy === s.id ? 'var(--accent)' : 'var(--bg-input)',
                      color: slot.strategy === s.id ? 'white' : 'var(--text2)',
                      border: `1px solid ${slot.strategy === s.id ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {s.label}
                    <span className="block text-xs mt-0.5" style={{ opacity: 0.7 }}>{s.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor={`input-slot-instruction-${slot.id}`} className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Instruction</label>
            <textarea
              id={`input-slot-instruction-${slot.id}`}
              value={slot.instruction}
              onChange={e => updateField('instruction', e.target.value)}
              placeholder="Describe what you want to generate..."
              className="w-full h-24 resize-none text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateForm({ userId, existing, onBack }: {
  userId: string;
  existing: Template;
  onBack: () => void;
}) {
  const [name, setName] = useState(existing.name || '');
  const [description, setDescription] = useState(existing.description || '');
  const [slots, setSlots] = useState<TemplateSlot[]>(
    existing.slots?.length ? existing.slots : [defaultSlot()]
  );
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return; }
    clearTimeout(saveTimer.current);
    setSaveStatus('idle');
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving');
      await fetch('/api/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: existing.id,
          name: name.trim() || 'New Template',
          description: description.trim(),
          type: 'video',
          device: 'any',
          promptTemplate: '',
          slots,
          createdBy: userId,
        }),
      });
      setSaveStatus('saved');
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [name, description, slots, existing.id, userId]);

  function updateSlot(index: number, updated: TemplateSlot) {
    setSlots(prev => prev.map((s, i) => i === index ? updated : s));
  }

  function removeSlot(index: number) {
    if (slots.length <= 1) return;
    setSlots(prev => prev.filter((_, i) => i !== index));
  }

  function addSlot() {
    const last = slots[slots.length - 1];
    setSlots(prev => [...prev, cloneSlot(last)]);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-sm" style={{ color: 'var(--text3)' }}>← Back</button>
        <h2 className="text-xl font-semibold">Edit Template</h2>
        <span className="text-xs ml-auto" style={{ color: saveStatus === 'saving' ? 'var(--accent)' : 'var(--text3)' }}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved ✓' : ''}
        </span>
      </div>

      <div className="space-y-5">
        <div>
          <label htmlFor="input-template-name" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Template Name</label>
          <input id="input-template-name" value={name} onChange={e => setName(e.target.value)} placeholder="Corporate Avatar HH" className="w-full" />
        </div>

        <div>
          <label htmlFor="input-template-description" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Description</label>
          <input id="input-template-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description..." className="w-full" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium" style={{ color: 'var(--text1)' }}>
              Generation Slots ({slots.length})
            </label>
            <button
              onClick={addSlot}
              className="px-3 py-1 rounded-lg text-xs font-medium"
              style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
            >
              + Clone & Add Slot
            </button>
          </div>
          <div className="space-y-3">
            {slots.map((slot, i) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                index={i}
                total={slots.length}
                onChange={updated => updateSlot(i, updated)}
                onRemove={() => removeSlot(i)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  return <AppShell><TemplatesContent /></AppShell>;
}
