import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from './auth';

export interface DiceRollResponse {
  roll: number;
  won: boolean;
  payout: number;
  newBalance: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  winChance: number;
  multiplier: number;
}

export interface MinesStartResponse {
  gameId: string;
  serverSeedHash: string;
  nonce: number;
  mineCount: number;
  betAmount: number;
  newBalance: number;
  revealedCells: number[];
  currentMultiplier: number;
  isResumed: boolean;
}

export interface MinesRevealResponse {
  hitMine: boolean;
  revealedCells: number[];
  currentMultiplier: number;
  isCompleted: boolean;
  minePositions?: number[];
  serverSeed?: string;
  payout?: number;
  newBalance?: number;
}

export interface MinesCashoutResponse {
  success: boolean;
  payout: number;
  newBalance: number;
  minePositions: number[];
  serverSeed: string;
}

export interface LudoStartResponse {
  gameId: string;
  serverSeedHash: string;
  nonce: number;
  betAmount: number;
  newBalance: number;
  position: number;
  currentMultiplier: number;
}

export interface LudoRollResponse {
  roll: number;
  position: number;
  currentMultiplier: number;
  isCompleted: boolean;
  hitDanger: boolean;
  message: string;
  payout: number;
  newBalance: number;
  serverSeed?: string;
}

export interface LudoCashoutResponse {
  success: boolean;
  payout: number;
  newBalance: number;
  serverSeed: string;
  finalMultiplier: number;
}

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private readonly apiUrl = 'http://localhost:5000/api';

  constructor(private http: HttpClient, private authService: AuthService) {}

  public rollDice(payload: { betAmount: number; target: number; condition: 'over' | 'under'; clientSeed?: string }): Observable<DiceRollResponse> {
    return this.http.post<DiceRollResponse>(`${this.apiUrl}/games/dice`, payload, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        const current = this.authService.currentUser();
        if (current) {
          this.authService.updateUser({ ...current, balance: res.newBalance });
        }
      })
    );
  }

  public startMines(payload: { betAmount: number; mineCount: number; clientSeed?: string }): Observable<MinesStartResponse> {
    return this.http.post<MinesStartResponse>(`${this.apiUrl}/games/mines/start`, payload, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        const current = this.authService.currentUser();
        if (current) {
          this.authService.updateUser({ ...current, balance: res.newBalance });
        }
      })
    );
  }

  public revealCell(payload: { gameId: string; cellIndex: number }): Observable<MinesRevealResponse> {
    return this.http.post<MinesRevealResponse>(`${this.apiUrl}/games/mines/reveal`, payload, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        if (res.isCompleted && res.newBalance !== undefined) {
          const current = this.authService.currentUser();
          if (current) {
            this.authService.updateUser({ ...current, balance: res.newBalance });
          }
        }
      })
    );
  }

  public cashoutMines(payload: { gameId: string }): Observable<MinesCashoutResponse> {
    return this.http.post<MinesCashoutResponse>(`${this.apiUrl}/games/mines/cashout`, payload, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        const current = this.authService.currentUser();
        if (current) {
          this.authService.updateUser({ ...current, balance: res.newBalance });
        }
      })
    );
  }

  public startLudo(payload: { betAmount: number; clientSeed?: string }): Observable<LudoStartResponse> {
    return this.http.post<LudoStartResponse>(`${this.apiUrl}/games/ludo/start`, payload, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        const current = this.authService.currentUser();
        if (current) {
          this.authService.updateUser({ ...current, balance: res.newBalance });
        }
      })
    );
  }

  public rollLudo(payload: { gameId: string }): Observable<LudoRollResponse> {
    return this.http.post<LudoRollResponse>(`${this.apiUrl}/games/ludo/roll`, payload, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        if (res.isCompleted && res.newBalance !== undefined) {
          const current = this.authService.currentUser();
          if (current) {
            this.authService.updateUser({ ...current, balance: res.newBalance });
          }
        }
      })
    );
  }

  public cashoutLudo(payload: { gameId: string }): Observable<LudoCashoutResponse> {
    return this.http.post<LudoCashoutResponse>(`${this.apiUrl}/games/ludo/cashout`, payload, { headers: this.authService.getHeaders() }).pipe(
      tap(res => {
        if (res.success) {
          const current = this.authService.currentUser();
          if (current) {
            this.authService.updateUser({ ...current, balance: res.newBalance });
          }
        }
      })
    );
  }
}
