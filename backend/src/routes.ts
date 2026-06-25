import type { Express, Request, Response } from 'express';
import type {
  AskRequest,
  ExplainRequest,
  HealthResponse,
  ParseRuleRequest,
  ReturnPairResponse,
  ScanRequest,
  ScanResponse,
  TaxReturn,
} from '../../shared/types.js';
import { availableTaxpayers, getReturnPair } from './data/index.js';
import { analyze } from './engine/index.js';
import { claudeAvailable, REGISTRY_VERSION } from './config.js';
import { answerFollowup, explainFindings } from './explain.js';
import { parseRule } from './nlparse.js';
import { LINE_REGISTRY, splitPath } from './registry.js';
import { resolveRuleSet } from './schemas.js';

let scanCounter = 0;

/** Apply edited grid values (flat {path:value}) or a partial return onto a clone of the current return. */
function applyOverride(ret: TaxReturn, override?: ScanRequest['current_override']): TaxReturn {
  if (!override || Object.keys(override).length === 0) return ret;
  const r = structuredClone(ret);
  const ov = override as Record<string, unknown>;
  if (ov.forms && typeof ov.forms === 'object') {
    const partial = ov as unknown as Partial<TaxReturn>;
    for (const [form, fd] of Object.entries(partial.forms ?? {})) {
      r.forms[form] ??= { present: true, lines: {} };
      if (typeof fd.present === 'boolean') r.forms[form].present = fd.present;
      for (const [line, lv] of Object.entries(fd.lines ?? {})) r.forms[form].lines[line] = lv;
    }
    if (partial.header) r.header = { ...r.header, ...partial.header };
  } else {
    for (const [path, value] of Object.entries(ov as Record<string, number | null>)) {
      const [form, line] = splitPath(path);
      r.forms[form] ??= { present: true, lines: {} };
      r.forms[form].present = true;
      r.forms[form].lines[line] = { value: value as number | null };
    }
  }
  return r;
}

export function registerRoutes(app: Express): void {
  app.get('/api/health', (_req: Request, res: Response) => {
    const body: HealthResponse = {
      status: 'ok',
      claude_available: claudeAvailable(),
      registry_version: REGISTRY_VERSION,
      available_taxpayers: availableTaxpayers().map((t) => t.taxpayer_id),
    };
    res.json(body);
  });

  app.get('/api/taxpayers', (_req: Request, res: Response) => {
    res.json({ taxpayers: availableTaxpayers() });
  });

  app.get('/api/returns/:taxpayerId', (req: Request, res: Response) => {
    const taxpayerId = String(req.params.taxpayerId);
    const year = req.query.year ? Number(req.query.year) : undefined;
    const pair = getReturnPair(taxpayerId, year);
    if (!pair) {
      res.status(404).json({ error: `No taxpayer "${taxpayerId}"` });
      return;
    }
    const meta = availableTaxpayers().find((t) => t.taxpayer_id === taxpayerId.toLowerCase());
    const body: ReturnPairResponse = {
      taxpayer_id: pair.current.taxpayer_id,
      display_name: pair.current.display_name,
      tax_years: { prior: pair.prior.tax_year, current: pair.current.tax_year },
      years: meta?.years,
      planted_anomalies: pair.planted_anomalies,
      prior: pair.prior,
      current: pair.current,
      line_registry: LINE_REGISTRY,
    };
    res.json(body);
  });

  app.post('/api/scan', (req: Request, res: Response) => {
    const body = req.body as ScanRequest;
    const pair = getReturnPair(body?.taxpayer_id ?? '', body?.current_year);
    if (!pair) {
      res.status(404).json({ error: `No taxpayer "${body?.taxpayer_id}"` });
      return;
    }
    const ruleset = resolveRuleSet(body.ruleset);
    const current = applyOverride(pair.current, body.current_override);
    const { findings, summary } = analyze(pair.prior, current, ruleset);
    const response: ScanResponse = {
      scan_id: `scan-${++scanCounter}`,
      taxpayer_id: pair.current.taxpayer_id,
      summary,
      findings,
      generated_at: new Date().toISOString(),
    };
    res.json(response);
  });

  app.post('/api/parse-rule', async (req: Request, res: Response) => {
    const body = req.body as ParseRuleRequest;
    const loaded = Array.isArray(body?.loaded_taxpayer_ids) ? body.loaded_taxpayer_ids : [];
    try {
      const result = await parseRule(String(body?.text ?? ''), loaded);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'parse_failed', detail: String(err) });
    }
  });

  app.post('/api/ask', async (req: Request, res: Response) => {
    const body = req.body as AskRequest;
    if (!body?.finding) {
      res.status(400).json({ error: 'finding required' });
      return;
    }
    try {
      const { answer, citation, answered_via } = await answerFollowup(body.finding, String(body.question ?? ''));
      res.json({ answer, citation, answered_via });
    } catch (err) {
      res.status(500).json({ error: 'ask_failed', detail: String(err) });
    }
  });

  app.post('/api/explain', async (req: Request, res: Response) => {
    const body = req.body as ExplainRequest;
    try {
      const result = await explainFindings(
        String(body?.taxpayer_id ?? ''),
        Array.isArray(body?.findings) ? body.findings : [],
        body?.verbosity === 'full' ? 'full' : 'card',
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'explain_failed', detail: String(err) });
    }
  });
}
