import { Component, inject, signal, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';

import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

declare var google: any;

@Component({
  selector: 'app-auth',
  imports: [FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss'
})
export class Auth implements AfterViewInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);

  // Form states
  protected isRegister = true;
  protected email = '';
  protected password = '';
  protected phone = '';
  protected errorMessage = '';
  protected successMessage = '';
  protected googleLoaded = false;
  protected isSubmitting = false;
  protected referralCode = '';

  constructor() {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/dashboard']);
    }

    this.route.queryParams.subscribe(params => {
      const verifyToken = params['verifyToken'];
      if (verifyToken) {
        this.verifyEmailToken(verifyToken);
      }
      if (params['ref']) {
        this.referralCode = params['ref'];
      }
    });
  }

  protected toggleMode(): void {
    this.isRegister = !this.isRegister;
    this.errorMessage = '';
    this.successMessage = '';
  }

  protected onSubmit(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.email || !this.password) {
      this.errorMessage = 'Please fill in all required fields.';
      return;
    }

    if (this.isRegister) {
      this.authService.register(this.email, this.password, this.phone, this.referralCode).subscribe({
        next: (res) => {
          this.successMessage = 'Registration successful! Welcome to the arena.';
          setTimeout(() => {
            this.router.navigate(['/dashboard']);
          }, 800);
        },
        error: (err) => {
          this.errorMessage = err.error?.error || 'Registration failed.';
        }
      });
    } else {
      this.authService.login(this.email, this.password).subscribe({
        next: (res) => {
          this.successMessage = 'Login successful!';
          setTimeout(() => {
            this.router.navigate(['/dashboard']);
          }, 800);
        },
        error: (err) => {
          this.errorMessage = err.error?.error || 'Login failed.';
        }
      });
    }
  }



  // Google / Facebook Mock Authentication flow
  protected triggerSocialLogin(provider: 'google' | 'facebook'): void {
    this.errorMessage = '';
    this.successMessage = '';

    const randomId = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
    
    // Simulate social popup auth response
    const mockSocialData = {
      email: `${provider}_player_${randomId.substring(0, 5)}@fortuneplayx.local`,
      name: `${providerName} Player`,
      id: randomId,
      provider: provider,
      token: `mock_oauth_jwt_token_${randomId}`,
      isSignup: this.isRegister,
      ref: this.referralCode
    };

    this.authService.socialLogin(mockSocialData).subscribe({
      next: (res) => {
        this.successMessage = `Successfully authenticated via ${providerName}!`;
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 800);
      },
      error: (err) => {
        this.errorMessage = err.error?.error || `Social login via ${providerName} failed.`;
      }
    });
  }


  ngAfterViewInit(): void {
    this.checkGoogleSdk();
  }

  private checkGoogleSdk(attempts = 0): void {
    if (typeof google !== 'undefined') {
      this.googleLoaded = true;
      google.accounts.id.initialize({
        client_id: '965877400039-isl9dli56jh3qqqeqt9of8gccneahs5o.apps.googleusercontent.com',
        callback: (response: any) => this.handleGoogleCredentialResponse(response)
      });
      const btnWidth = Math.min(360, window.innerWidth - 64);
      google.accounts.id.renderButton(
        document.getElementById('google-btn'),
        { theme: 'outline', size: 'large', width: btnWidth.toString() }
      );
    } else if (attempts < 10) {
      setTimeout(() => this.checkGoogleSdk(attempts + 1), 300);
    }
  }

  private handleGoogleCredentialResponse(response: any): void {
    this.errorMessage = '';
    this.successMessage = '';

    const idToken = response.credential;
    this.authService.socialLogin({
      email: '',
      name: '',
      id: '',
      provider: 'google',
      token: idToken,
      isSignup: this.isRegister,
      ref: this.referralCode
    }).subscribe({
      next: (res) => {
        this.successMessage = 'Successfully authenticated via Google!';
        setTimeout(() => this.router.navigate(['/dashboard']), 800);
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Google authentication failed.';
      }
    });
  }

  private verifyEmailToken(token: string): void {
    this.successMessage = 'Verifying your email... Please wait.';
    this.errorMessage = '';
    
    this.http.get<any>(`${environment.apiUrl}/auth/verify-email?token=${token}`).subscribe({
      next: (res) => {
        this.successMessage = 'Email verified successfully! You have successfully onboarded and your bonus is active. Please log in.';
        this.isRegister = false;
        this.router.navigate([], { queryParams: { verifyToken: null }, queryParamsHandling: 'merge' });
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Email verification link is invalid or has expired.';
        this.successMessage = '';
      }
    });
  }


}
