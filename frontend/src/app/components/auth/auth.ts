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

  // Login via Email OTP states
  protected isOtpLogin = false;
  protected isLoginOtpStep = false;

  // OTP flow states
  protected isOtpStep = false;
  protected otpCode = '';
  protected resendCooldown = 0;
  private cooldownInterval: any;

  constructor() {
    // If already logged in and verified, skip auth
    if (this.authService.isLoggedIn()) {
      const user = this.authService.currentUser();
      if (user && user.otpVerified) {
        this.router.navigate(['/dashboard']);
      } else if (user && !user.otpVerified) {
        this.isOtpStep = true;
      }
    }

    // Check for email verification token in query parameters
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
          this.successMessage = 'Registration successful! Verification OTP sent.';
          this.isOtpStep = true;
          this.startCooldown();
        },
        error: (err) => {
          this.errorMessage = err.error?.error || 'Registration failed.';
        }
      });
    } else {
      this.authService.login(this.email, this.password).subscribe({
        next: (res) => {
          if (res.user.otpVerified) {
            this.router.navigate(['/dashboard']);
          } else {
            this.successMessage = 'Please verify your identity. OTP sent.';
            this.isOtpStep = true;
            this.startCooldown();
          }
        },
        error: (err) => {
          this.errorMessage = err.error?.error || 'Login failed.';
        }
      });
    }
  }

  protected onVerifyOtp(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.otpCode) {
      this.errorMessage = 'Please enter the 6-digit OTP code.';
      return;
    }

    this.authService.verifyOtp(this.otpCode).subscribe({
      next: (res) => {
        this.successMessage = 'Verification successful!';
        clearInterval(this.cooldownInterval);
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 800);
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Verification failed. Please check the code.';
      }
    });
  }

  protected onResendOtp(): void {
    if (this.resendCooldown > 0) return;
    
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.resendOtp().subscribe({
      next: (res) => {
        this.successMessage = 'A new verification code has been dispatched.';
        this.startCooldown();
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Failed to resend code.';
      }
    });
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

  private startCooldown(): void {
    this.resendCooldown = 60;
    clearInterval(this.cooldownInterval);
    this.cooldownInterval = setInterval(() => {
      if (this.resendCooldown > 0) {
        this.resendCooldown--;
      } else {
        clearInterval(this.cooldownInterval);
      }
    }, 1000);
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
      google.accounts.id.renderButton(
        document.getElementById('google-btn'),
        { theme: 'outline', size: 'large', width: '360' }
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

  protected toggleOtpLogin(): void {
    this.isOtpLogin = !this.isOtpLogin;
    this.isLoginOtpStep = false;
    this.errorMessage = '';
    this.successMessage = '';
  }

  protected onSendLoginOtp(): void {
    this.errorMessage = '';
    this.successMessage = '';
    if (!this.email) {
      this.errorMessage = 'Please enter your email address.';
      return;
    }
    this.isSubmitting = true;
    this.http.post<any>(`${environment.apiUrl}/auth/login-otp-request`, { email: this.email }).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.successMessage = 'Verification OTP sent to your email!';
        this.isLoginOtpStep = true;
        this.startCooldown();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Failed to send login OTP.';
      }
    });
  }

  protected onVerifyLoginOtp(): void {
    this.errorMessage = '';
    this.successMessage = '';
    if (!this.otpCode) {
      this.errorMessage = 'Please enter the 6-digit OTP code.';
      return;
    }
    this.isSubmitting = true;
    this.http.post<any>(`${environment.apiUrl}/auth/login-otp-verify`, { email: this.email, code: this.otpCode }).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.successMessage = 'Login successful!';
        this.authService.updateUser(res.user);
        localStorage.setItem('token', res.token);
        setTimeout(() => this.router.navigate(['/dashboard']), 800);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Invalid or expired OTP code.';
      }
    });
  }
}
