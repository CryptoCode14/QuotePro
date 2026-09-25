/**
 * history.ts — lightweight localStorage-backed estimate history.
 *
 * Records each completed scan (time, cards found, door/windows/etc) and each
 * solve (grand total, margin). Capped at 50 entries, newest first.
 */
import type { ParsedCard } from "@/lib/ocrParser";

export interface HistoryEntry {
  id: string;
  at: string; // ISO timestamp
  type: "scan" | "solve";
  door: number;
  windows: number;
  etc: number;
  cards?: ParsedCard[];
  grandTotal?: number;
  margin?: number;
}

const STORAGE_KEY = "quotepro-history";
const MAX_ENTRIES = 50;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* storage unavailable */
  }
}

export function addHistory(entry: Omit<HistoryEntry, "id" | "at">): HistoryEntry {
  const full: HistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
  const entries = [full, ...loadHistory()].slice(0, MAX_ENTRIES);
  saveHistory(entries);
  return full;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
