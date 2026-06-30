'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useProject } from '@/lib/ProjectContext';
import { Template, TemplateSlot, TemplateRef, VideoModelTypeFilter } from '@/lib/types';
import {
  VIDEO_MODEL_OPTIONS, VIDEO_MODEL_GROUPS,
  VIDEO_MODEL_TYPE_FILTERS, filterVideoModelsByType,
  VIDEO_ASPECT_RATIO_OPTIONS, VIDEO_QUALITY_OPTIONS, VIDEO_FPS_OPTIONS,
  VIDEO_STRATEGY_OPTIONS, isVideoModelGroupId,
} from '@/lib/models';
import ImagePicker from '@/components/ImagePicker';
import ReferenceUpload from '@/components/ReferenceUpload';

type View = 'list' | 'create' | 'edit';

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
  const [view, setView] = useState<View>('list');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/templates');
    const data = await res.json();
    if (Array.isArray(data)) setTemplates(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleEdit(tmpl: Template) {
    setEditingTemplate(tmpl);
    setView('edit');
  }

  async function handleDelete(id: string) {
    await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      {view === 'list' && (
        <TemplateList
          templates={templates}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCreate={() => { setEditingTemplate(null); setView('create'); }}
        />
      )}
      {(view === 'create' || view === 'edit') && (
        <TemplateForm
          userId={user?.userId || ''}
          existing={editingTemplate}
          onSave={() => { load(); setView('list'); }}
          onCancel={() => setView('list')}
        />
      )}
    </div>
  );
}

function TemplateList({ templates, onEdit, onDelete, onCreate }: {
  templates: Template[];
  onEdit: (t: Template) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-semibold">Templates</h2>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map(tmpl => {
            const slots = tmpl.slots || [];
            const slotCount = slots.length;
            const models = [...new Set(slots.map(s => s.modelLabel))];
            const totalRefs = slots.reduce((sum, s) => sum + s.references.length, 0);

            return (
              <div key={tmpl.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{tmpl.name}</h3>
                    {tmpl.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>{tmpl.description}</p>}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                    {slotCount} slot{slotCount !== 1 ? 's' : ''}
                  </span>
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
                  <p className="text-sm mb-4 line-clamp-2" style={{ color: 'var(--text2)' }}>{tmpl.promptTemplate}</p>
                )}

                <div className="flex gap-2">
                  <button onClick={() => onEdit(tmpl)} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}>
                    Edit
                  </button>
                  <button onClick={() => setConfirmDeleteId(tmpl.id)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--red)', background: 'rgba(239,68,68,0.08)' }}>
                    Del
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmDeleteId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative rounded-xl p-5 w-80 shadow-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" style={{ color: 'var(--red)' }}>
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-center mb-1" style={{ color: 'var(--text1)' }}>Delete template?</h3>
            <p className="text-xs text-center mb-4" style={{ color: 'var(--text3)' }}>This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancel</button>
              <button onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }} className="flex-1 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--red, #ef4444)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
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
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Model</label>
              <select value={slot.modelId} onChange={e => handleModelChange(e.target.value)} className="w-full text-sm">
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
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Type Filter</label>
              <select value={slot.typeFilter} onChange={e => handleTypeFilterChange(e.target.value)} className="w-full text-sm">
                {VIDEO_MODEL_TYPE_FILTERS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Duration</label>
              <select value={slot.duration} onChange={e => updateField('duration', Number(e.target.value))} className="w-full text-sm">
                {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map(d => <option key={d} value={d}>{d}s</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Aspect Ratio</label>
              <select value={slot.aspectRatio} onChange={e => updateField('aspectRatio', e.target.value)} className="w-full text-sm">
                {VIDEO_ASPECT_RATIO_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Quality</label>
              <select value={slot.quality} onChange={e => updateField('quality', e.target.value)} className="w-full text-sm">
                {VIDEO_QUALITY_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>FPS</label>
              <select value={slot.fps} onChange={e => updateField('fps', Number(e.target.value))} className="w-full text-sm">
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
                    <span className="block text-[10px] mt-0.5" style={{ opacity: 0.7 }}>{s.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Instruction</label>
            <textarea
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

function TemplateForm({ userId, existing, onSave, onCancel }: {
  userId: string;
  existing: Template | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [slots, setSlots] = useState<TemplateSlot[]>(() => {
    if (existing?.slots?.length) return existing.slots;
    return [defaultSlot()];
  });
  const [saving, setSaving] = useState(false);

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

  async function handleSave() {
    if (!name.trim() || slots.length === 0) return;
    setSaving(true);

    const body = {
      name: name.trim(),
      description: description.trim(),
      type: 'video' as const,
      device: 'any',
      promptTemplate: '',
      slots,
      createdBy: userId,
    };

    if (existing) {
      await fetch('/api/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existing.id, ...body }),
      });
    } else {
      await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    setSaving(false);
    onSave();
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="text-sm" style={{ color: 'var(--text3)' }}>← Back</button>
        <h2 className="text-xl font-semibold">{existing ? 'Edit Template' : 'New Template'}</h2>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Template Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Corporate Avatar HH" className="w-full" />
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description..." className="w-full" />
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

        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="px-5 py-2.5 rounded-lg text-sm" style={{ color: 'var(--text2)', background: 'var(--bg-input)' }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || slots.length === 0}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Saving...' : existing ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </>
  );
}

export default function TemplatesPage() {
  return <AppShell><TemplatesContent /></AppShell>;
}
