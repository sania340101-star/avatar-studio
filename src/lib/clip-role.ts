import { ExportClip } from './types';

// "Matrix | a → b | transition" or "Matrix | a | loop": the poses and type of a pose-matrix clip
export function parseClipLabel(label: string): { startPose: string; endPose: string; type: string } | null {
  const transMatch = label.match(/\|\s*(.+?)\s*→\s*(.+?)\s*\|\s*(transition|loop)/);
  if (transMatch) return { startPose: transMatch[1].trim(), endPose: transMatch[2].trim(), type: transMatch[3] };
  const loopMatch = label.match(/\|\s*(.+?)\s*\|\s*(loop|transition)/);
  if (loopMatch) return { startPose: loopMatch[1].trim(), endPose: loopMatch[1].trim(), type: loopMatch[2] };
  return null;
}

// The Avatar Voice Body Animation role of a clip: the one picked in the export, else "talk" when the
// label says so. Any clip can be special (a gesture is often a transition, e.g. idle → idle); other
// transitions have no role: they only move between poses.
export function clipRole(clip: ExportClip): 'idle' | 'talk' | 'special' | undefined {
  if (clip.body?.role === 'special') return 'special';
  const parsed = parseClipLabel(clip.label);
  if (parsed?.type === 'transition') return undefined;
  if (clip.body?.role) return clip.body.role;
  // the pose name only: a matrix called "Talking head" must not make every loop talk
  return /\btalk/i.test(parsed ? parsed.startPose : clip.label) ? 'talk' : undefined;
}
