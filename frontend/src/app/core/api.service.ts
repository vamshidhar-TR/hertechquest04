import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  AskResponse,
  ExplainResponse,
  Finding,
  HealthResponse,
  ParseRuleResponse,
  ReturnPairResponse,
  RuleSet,
  ScanResponse,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = 'http://localhost:3001/api';

  health(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.base}/health`);
  }

  taxpayers(): Observable<{ taxpayers: { taxpayer_id: string; display_name: string }[] }> {
    return this.http.get<{ taxpayers: { taxpayer_id: string; display_name: string }[] }>(`${this.base}/taxpayers`);
  }

  getReturns(taxpayerId: string, year?: number): Observable<ReturnPairResponse> {
    const q = year ? `?year=${year}` : '';
    return this.http.get<ReturnPairResponse>(`${this.base}/returns/${taxpayerId}${q}`);
  }

  scan(req: {
    taxpayer_id: string;
    current_year?: number;
    current_override?: Record<string, number | null>;
    ruleset?: Partial<RuleSet>;
  }): Observable<ScanResponse> {
    return this.http.post<ScanResponse>(`${this.base}/scan`, req);
  }

  ask(taxpayerId: string, finding: Finding, question: string): Observable<AskResponse> {
    return this.http.post<AskResponse>(`${this.base}/ask`, {
      taxpayer_id: taxpayerId,
      finding,
      question,
    });
  }

  parseRule(text: string, loadedTaxpayerIds: string[]): Observable<ParseRuleResponse> {
    return this.http.post<ParseRuleResponse>(`${this.base}/parse-rule`, {
      text,
      loaded_taxpayer_ids: loadedTaxpayerIds,
    });
  }

  explain(taxpayerId: string, findings: Finding[], verbosity: 'card' | 'full' = 'full'): Observable<ExplainResponse> {
    return this.http.post<ExplainResponse>(`${this.base}/explain`, {
      taxpayer_id: taxpayerId,
      findings,
      verbosity,
    });
  }
}
