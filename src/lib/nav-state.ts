let _lastExportId: string | null = null;

export function getLastExportId(): string | null {
  return _lastExportId;
}

export function setLastExportId(id: string | null) {
  _lastExportId = id;
}
