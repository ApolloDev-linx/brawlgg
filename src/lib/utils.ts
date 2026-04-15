import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: string[]) {
  return inputs.filter(Boolean).join(" ");
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, "").toUpperCase().trim();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
