import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from './auth';

export interface LedgerEntry {
  _id: string;
  userId: string;
  amount: number;
  type: 'bet' | 'win' | 'reward' | 'cashout';
  game: 'dice' | 'mines' | 'signup_reward';
  resultingBalance: number;
  timestamp: string;
}

export interface HistoryResponse {
  history: LedgerEntry[];
  page: number;
  limit: number;
  totalPages: number;
  totalCount: number;
}

export interface LeaderboardResponse {
  topBalances: Array<{ username: string; balance: number }>;
  topWins: Array<{ username: string; amount: number; game: string; timestamp: string }>;
}

@Injectable({
  providedIn: 'root'
})
export class WalletService {
  private readonly apiUrl = 'http://localhost:5000/api';

  constructor(private http: HttpClient, private authService: AuthService) {}

  public getBalance(): Observable<{ balance: number; email: string }> {
    return this.http.get<{ balance: number; email: string }>(`${this.apiUrl}/wallet/balance`, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        const current = this.authService.currentUser();
        if (current) {
          this.authService.updateUser({ ...current, balance: res.balance });
        }
      })
    );
  }

  public getHistory(page: number = 1, limit: number = 10): Observable<HistoryResponse> {
    return this.http.get<HistoryResponse>(`${this.apiUrl}/wallet/history?page=${page}&limit=${limit}`, { headers: this.authService.getHeaders() });
  }

  public getLeaderboard(): Observable<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(`${this.apiUrl}/wallet/leaderboard`, { headers: this.authService.getHeaders() });
  }

  public claimDailyBonus(): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/wallet/claim-daily`, {}, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        const current = this.authService.currentUser();
        if (current) {
          this.authService.updateUser({ ...current, balance: res.balance });
        }
      })
    );
  }

  public deposit(amount: number, method: string, details: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/wallet/deposit`, { amount, method, details }, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        const current = this.authService.currentUser();
        if (current) {
          this.authService.updateUser({ ...current, balance: res.balance });
        }
      })
    );
  }

  public withdraw(amount: number, method: string, details: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/wallet/withdraw`, { amount, method, details }, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        const current = this.authService.currentUser();
        if (current) {
          this.authService.updateUser({ ...current, balance: res.balance });
        }
      })
    );
  }
}
