'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useProject } from '@/lib/ProjectContext';
import { Template, TemplateSlot, TemplateRef, VideoModelTypeFilter } from '@/lib/types';
import {
  VIDEO_MODEL_OPTIONS, VIDEO_MODEL_GROUPS,
  VIDEO_MODEL_TYPE_FILTERS, filterVideoModelsByType, getVideoModelType,
  VIDEO_ASPECT_RATIO_OPTIONS, VIDEO_QUALITY_OPTIONS, VIDEO_FPS_OPTIONS,
  DEVICE_PRESETS,
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
    modelId: VIDEO_MODEL_OPTIONS[0]?.id || '',
    modelLabel: VIDEO_MODEL_OPTIONS[0]?.label || '',
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
                  <div className="flex gap-1">
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                      {slotCount} slot{slotCount !== 1 ? 's' : ''}
                    </span>
                    {tmpl.device !== 'any' && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{tmpl.device.toUpperCase()}</span>
                    )}
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
  const selectedModel = VIDEO_MODEL_OPTIONS.find(m => m.id === slot.modelId);
  const modelType = selectedModel ? getVideoModelType(selectedModel) : 'image-to-video';

  function updateField<K extends keyof TemplateSlot>(key: K, value: TemplateSlot[K]) {
    onChange({ ...slot, [key]: value });
  }

  function handleModelChange(modelId: string) {
    const opt = VIDEO_MODEL_OPTIONS.find(m => m.id === modelId);
    onChange({ ...slot, modelId, modelLabel: opt?.label || modelId });
  }

  function handleTypeFilterChange(tf: string) {
    const models = filterVideoModelsByType(tf as VideoModelTypeFilter);
    const newModelId = models.find(m => m.id === slot.modelId) ? slot.modelId : (models[0]?.id || '');
    const opt = VIDEO_MODEL_OPTIONS.find(m => m.id === newModelId);
    onChange({ ...slot, typeFilter: tf, modelId: newModelId, modelLabel: opt?.label || newModelId });
  }

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
        <span className="text-sm font-medium truncate flex-1" style={{ color: 'var(--text1)' }}>
          {slot.modelLabel}
        </span>
        <div className="flex items-center gap-1.5">
          {slot.references.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
              {slot.references.length} ref{slot.references.length !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-xs" style={{ color: 'var(--text3)' }}>{slot.duration}s</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Video Type</label>
              <select value={slot.typeFilter} onChange={e => handleTypeFilterChange(e.target.value)} className="w-full text-sm">
                {VIDEO_MODEL_TYPE_FILTERS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Model ({filteredModels.length})</label>
              <select value={slot.modelId} onChange={e => handleModelChange(e.target.value)} className="w-full text-sm">
                {(() => {
                  const avatarModels = filteredModels.filter(m => m.avatarAudio || m.avatarText || m.avatarVideoAudio);
                  const utilityModels = filteredModels.filter(m => m.utilityVideo);
                  const generalModels = filteredModels.filter(m => !m.avatarAudio && !m.avatarText && !m.avatarVideoAudio && !m.utilityVideo);
                  const generalByGroup: Record<string, typeof generalModels> = {};
                  for (const m of generalModels) {
                    const group = VIDEO_MODEL_GROUPS.find(g => g.modelIds.includes(m.id));
                    const key = group?.label ?? 'Other';
                    if (!generalByGroup[key]) generalByGroup[key] = [];
                    generalByGroup[key].push(m);
                  }
                  return (
                    <>
                      {Object.entries(generalByGroup).map(([groupLabel, models]) => (
                        <optgroup key={groupLabel} label={groupLabel}>
                          {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </optgroup>
                      ))}
                      {avatarModels.length > 0 && (
                        <optgroup label="Avatar / Lip-sync">
                          {avatarModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </optgroup>
                      )}
                      {utilityModels.length > 0 && (
                        <optgroup label="Utility">
                          {utilityModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </optgroup>
                      )}
                    </>
                  );
                })()}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Duration</label>
              <select value={slot.duration} onChange={e => updateField('duration', Number(e.target.value))} className="w-full text-sm">
                {[3, 4, 5, 6, 7, 8, 10].map(d => <option key={d} value={d}>{d}s</option>)}
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

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Instruction Override (optional)</label>
            <textarea
              value={slot.instruction}
              onChange={e => updateField('instruction', e.target.value)}
              placeholder="Leave empty to use the shared instruction above"
              className="w-full h-16 resize-none text-sm"
            />
          </div>

          {modelType !== 'text-to-video' && (
            <div className="space-y-2 p-3 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-medium" style={{ color: 'var(--text3)' }}>References</p>

              {(modelType === 'image-to-video' || modelType === 'avatar' || modelType === 'motion-control' || modelType === 'start-end-frame') && (
                <ImagePicker
                  value={imageRefs[0]?.url || ''}
                  onChange={url => {
                    const rest = imageRefs.slice(1);
                    const newRefs = url ? [{ url, type: 'image' as const, name: 'Source image' }, ...rest] : rest;
                    setRefsByType('image', newRefs);
                  }}
                  label="Source Image"
                />
              )}

              {modelType === 'start-end-frame' && (
                <ImagePicker
                  value={imageRefs[1]?.url || ''}
                  onChange={url => {
                    const first = imageRefs[0] ? [imageRefs[0]] : [];
                    const newRefs = url ? [...first, { url, type: 'image' as const, name: 'End image' }] : first;
                    setRefsByType('image', newRefs);
                  }}
                  label="End Image"
                />
              )}

              {modelType === 'multi-reference' && (
                <ReferenceUpload
                  references={imageRefs}
                  onChange={refs => setRefsByType('image', refs)}
                  accept="image/*"
                  label="Reference Images (2+)"
                />
              )}

              {(modelType === 'video-edit' || modelType === 'utility' || modelType === 'lip-sync' || modelType === 'motion-control') && (
                <ReferenceUpload
                  references={videoRefs}
                  onChange={refs => setRefsByType('video', refs)}
                  accept="video/*"
                  label={modelType === 'motion-control' ? 'Motion Reference Video' : 'Source Video'}
                />
              )}

              {(modelType === 'avatar' || modelType === 'lip-sync') && (
                <ReferenceUpload
                  references={audioRefs}
                  onChange={refs => setRefsByType('audio', refs)}
                  accept="audio/*"
                  label="Audio File"
                />
              )}
            </div>
          )}
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
  const [device, setDevice] = useState<string>(existing?.device || 'any');
  const [promptTemplate, setPromptTemplate] = useState(existing?.promptTemplate || '');
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
      device,
      promptTemplate: promptTemplate.trim(),
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

      <div className="space-y-5 max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Template Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Corporate Avatar HH" className="w-full" />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Device</label>
            <select value={device} onChange={e => setDevice(e.target.value)} className="w-full">
              <option value="any">Any</option>
              {Object.entries(DEVICE_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>{preset.name} ({preset.width}x{preset.height})</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description..." className="w-full" />
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Shared Instruction</label>
          <textarea
            value={promptTemplate}
            onChange={e => setPromptTemplate(e.target.value)}
            placeholder="Instruction that applies to all slots (each slot can override)..."
            className="w-full h-24 resize-none"
          />
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
