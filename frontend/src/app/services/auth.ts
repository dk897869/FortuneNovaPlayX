import { Injectable, signal, WritableSignal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface User {
  id: string;
  email: string;
  phone: string;
  balance: number;
  otpVerified: boolean;
  avatar?: string;
  referralCode?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl = 'http://localhost:5000/api';
  public readonly currentUser: WritableSignal<User | null> = signal<User | null>(null);
  public readonly showSettingsModal = signal<boolean>(false);
  public readonly showWalletModal = signal<{ active: boolean; type: 'deposit' | 'withdraw' }>({ active: false, type: 'deposit' });

  constructor(private http: HttpClient) {
    this.loadUserFromStorage();
  }

  private loadUserFromStorage(): void {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        this.currentUser.set(JSON.parse(userStr));
      } catch (e) {
        this.logout();
      }
    }
  }

  public getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  public register(email: string, password: string, phone?: string, ref?: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, { email, password, phone, ref }).pipe(
      tap(res => this.handleAuthSuccess(res))
    );
  }

  public login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, { email, password }).pipe(
      tap(res => this.handleAuthSuccess(res))
    );
  }

  public socialLogin(socialData: { email: string; name: string; id: string; provider: string; token: string; isSignup?: boolean; ref?: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/social-login`, socialData).pipe(
      tap(res => this.handleAuthSuccess(res))
    );
  }

  public verifyOtp(code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/verify-otp`, { code }, { headers: this.getHeaders() }).pipe(
      tap((res: any) => {
        if (res.user) {
          this.updateUser(res.user);
        }
      })
    );
  }

  public resendOtp(): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/resend-otp`, {}, { headers: this.getHeaders() });
  }

  public updateUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
    this.currentUser.set(user);
  }

  public handleAuthSuccess(res: AuthResponse): void {
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    this.currentUser.set(res.user);
  }

  public logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUser.set(null);
  }

  public isLoggedIn(): boolean {
    return localStorage.getItem('token') !== null;
  }
}
