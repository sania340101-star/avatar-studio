let _lastExportId: string | null = null;

export function getLastExportId(): string | null {
  return _lastExportId;
}

export function setLastExportId(id: string | null) {
  _lastExportId = id;
}

let _templateView: string | null = null;
let _templateData: unknown = null;

export function getTemplateView(): { view: string; data: unknown } | null {
  if (!_templateView) return null;
  return { view: _templateView, data: _templateData };
}

export function setTemplateView(view: string | null, data?: unknown) {
  _templateView = view;
  _templateData = data ?? null;
}
