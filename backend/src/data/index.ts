import type { TaxReturn } from '../../../shared/types.js';
import { adaptOfficialReturn, slugForClient, type OfficialReturn } from './adapter.js';

import garcia2024 from './returns/garcia_2024.json';
import garcia2025 from './returns/garcia_2025.json';
import johnson2024 from './returns/johnson_2024.json';
import johnson2025 from './returns/johnson_2025.json';
import nguyen2024 from './returns/nguyen_2024.json';
import nguyen2025 from './returns/nguyen_2025.json';
import patel2024 from './returns/patel_2024.json';
import patel2025 from './returns/patel_2025.json';
import thompson2023 from './returns/thompson_2023.json';
import thompson2024 from './returns/thompson_2024.json';
import thompson2025 from './returns/thompson_2025.json';

const OFFICIAL: OfficialReturn[] = [
  garcia2024, garcia2025, johnson2024, johnson2025, nguyen2024, nguyen2025,
  patel2024, patel2025, thompson2023, thompson2024, thompson2025,
] as unknown as OfficialReturn[];

interface ClientYear {
  year: number;
  ret: TaxReturn;
  raw: OfficialReturn;
}
interface ClientData {
  slug: string;
  display_name: string;
  filing_status: string;
  years: ClientYear[]; // sorted ascending
}

const CLIENTS: Record<string, ClientData> = (() => {
  const map: Record<string, ClientData> = {};
  for (const raw of OFFICIAL) {
    const slug = slugForClient(raw);
    const ret = adaptOfficialReturn(raw);
    (map[slug] ??= {
      slug,
      display_name: raw.client.name,
      filing_status: raw.client.filing_status,
      years: [],
    }).years.push({ year: raw.tax_year, ret, raw });
  }
  for (const c of Object.values(map)) c.years.sort((a, b) => a.year - b.year);
  return map;
})();

export interface ReturnPair {
  prior: TaxReturn;
  current: TaxReturn;
  planted_anomalies?: string[];
}

function find(slug: string): ClientData | undefined {
  return CLIENTS[slug.toLowerCase()];
}

/** Returns the chosen (or two latest) consecutive years for a client, deep-cloned. */
export function getReturnPair(slug: string, currentYear?: number): ReturnPair | undefined {
  const c = find(slug);
  if (!c || c.years.length < 2) return undefined;
  let curIdx = c.years.length - 1;
  if (currentYear !== undefined) {
    const i = c.years.findIndex((y) => y.year === currentYear);
    if (i >= 1) curIdx = i;
  }
  const current = c.years[curIdx];
  const prior = c.years[curIdx - 1];
  return {
    prior: structuredClone(prior.ret),
    current: structuredClone(current.ret),
    planted_anomalies: current.raw._meta?.planted_anomalies,
  };
}

export function hasTaxpayer(slug: string): boolean {
  return Boolean(find(slug));
}

export function availableTaxpayers(): Array<{
  taxpayer_id: string;
  display_name: string;
  filing_status: string;
  years: number[];
}> {
  return Object.values(CLIENTS).map((c) => ({
    taxpayer_id: c.slug,
    display_name: c.display_name,
    filing_status: c.filing_status,
    years: c.years.map((y) => y.year),
  }));
}

/** Best-effort name/surname match for NL rule parsing ("the Johnson return" -> johnson). */
export function resolveTaxpayerByName(text: string): string | null {
  const lower = text.toLowerCase();
  for (const c of Object.values(CLIENTS)) {
    if (lower.includes(c.slug)) return c.slug;
    for (const word of c.display_name.toLowerCase().split(/[^a-z]+/)) {
      if (word.length > 3 && lower.includes(word)) return c.slug;
    }
  }
  return null;
}
