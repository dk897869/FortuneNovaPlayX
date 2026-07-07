import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { DecimalPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './services/auth';
import { LoaderService } from './services/loader';
import { WalletService, LedgerEntry } from './services/wallet';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DecimalPipe, CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  public readonly authService = inject(AuthService);
  public readonly loaderService = inject(LoaderService);
  private readonly walletService = inject(WalletService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  // Global Profile Settings States
  public get isEditingProfile(): boolean {
    return this.authService.showSettingsModal();
  }
  public set isEditingProfile(val: boolean) {
    this.authService.showSettingsModal.set(val);
  }
  protected profileEmail = '';
  protected profilePhone = '';
  protected profileAvatar = 'avatar-ninja';
  protected oldPassword = '';
  protected newPassword = '';
  protected confirmPassword = '';
  protected profileSuccess = '';
  protected profileError = '';
  protected passwordSuccess = '';
  protected passwordError = '';
  protected readonly avatars = ['avatar-ninja', 'avatar-surfer', 'avatar-king', 'avatar-queen', 'avatar-diamond', 'avatar-champion'];

  // Global Modals Active States
  protected isViewingTransactions = false;
  protected isViewingRewards = false;
  protected isViewingSupport = false;

  public get isViewingWalletAction(): boolean {
    return this.authService.showWalletModal().active;
  }
  public set isViewingWalletAction(val: boolean) {
    this.authService.showWalletModal.set({ active: val, type: this.walletActionType });
  }

  public get walletActionType(): 'deposit' | 'withdraw' {
    return this.authService.showWalletModal().type;
  }
  public set walletActionType(val: 'deposit' | 'withdraw') {
    this.authService.showWalletModal.set({ active: this.isViewingWalletAction, type: val });
  }

  protected walletMethod: 'bank' | 'upi' | 'paytm' = 'bank';
  protected walletAmount = 100;
  protected walletDetails = '';
  protected walletSuccess = '';
  protected walletError = '';

  // Transactions ledger modal states
  protected txList: LedgerEntry[] = [];
  protected txPage = 1;
  protected txTotalPages = 1;

  // Support modal states
  protected supportMessage = '';
  protected supportSuccess = '';

  // Daily Claim banner states
  protected dailySuccess = '';
  protected dailyError = '';

  // Daily Bonus Countdown variables
  private dailyCountdownInterval: any;
  protected dailyCooldownSeconds = 0;
  protected formattedDailyTime = '00:00:00';

  // Notifications drop-down states
  protected isViewingNotifications = false;
  protected notificationsList: string[] = [];

  public logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth']);
  }

  public openProfileEditor(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.profileEmail = user.email;
      this.profilePhone = user.phone || '';
      this.profileAvatar = user.avatar || 'avatar-ninja';
    }
    this.profileSuccess = '';
    this.profileError = '';
    this.passwordSuccess = '';
    this.passwordError = '';
    this.oldPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.isEditingProfile = true;
  }

  protected onUpdateProfile(): void {
    this.profileSuccess = '';
    this.profileError = '';
    
    this.http.post<any>(`${environment.apiUrl}/user/update`, {
      email: this.profileEmail,
      phone: this.profilePhone,
      avatar: this.profileAvatar
    }, { headers: this.authService.getHeaders() }).subscribe({
      next: (res) => {
        this.profileSuccess = res.message;
        this.authService.updateUser(res.user);
      },
      error: (err) => {
        this.profileError = err.error?.error || 'Failed to update profile.';
      }
    });
  }

  protected onChangePassword(): void {
    this.passwordSuccess = '';
    this.passwordError = '';
    
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'New passwords do not match.';
      return;
    }
    
    this.http.post<any>(`${environment.apiUrl}/user/change-password`, {
      oldPassword: this.oldPassword,
      newPassword: this.newPassword
    }, { headers: this.authService.getHeaders() }).subscribe({
      next: (res) => {
        this.passwordSuccess = res.message;
        this.oldPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
      },
      error: (err) => {
        this.passwordError = err.error?.error || 'Failed to change password.';
      }
    });
  }

  protected onDeleteProfile(): void {
    if (!confirm('WARNING: Are you sure you want to permanently delete your account? This action cannot be undone.')) {
      return;
    }
    
    this.http.post<any>(`${environment.apiUrl}/user/delete`, {}, { headers: this.authService.getHeaders() }).subscribe({
      next: (res) => {
        alert(res.message);
        this.isEditingProfile = false;
        this.authService.logout();
        this.router.navigate(['/auth']);
      },
      error: (err) => {
        alert(err.error?.error || 'Failed to delete account.');
      }
    });
  }

  public openTransactions(page = 1): void {
    if (page < 1 || page > this.txTotalPages && this.txTotalPages > 0) return;
    this.walletService.getHistory(page, 10).subscribe({
      next: (res) => {
        this.txList = res.history;
        this.txPage = res.page;
        this.txTotalPages = res.totalPages;
        this.isViewingTransactions = true;
      }
    });
  }

  public openWalletAction(type: 'deposit' | 'withdraw'): void {
    this.walletAmount = 100;
    this.walletDetails = '';
    this.walletSuccess = '';
    this.walletError = '';
    this.authService.showWalletModal.set({ active: true, type });
  }

  protected onSubmitWalletAction(): void {
    this.walletSuccess = '';
    this.walletError = '';

    if (this.walletAmount <= 0) {
      this.walletError = 'Please enter an amount greater than 0.';
      return;
    }
    if (!this.walletDetails) {
      this.walletError = 'Please enter your payment account information.';
      return;
    }

    if (this.walletActionType === 'deposit') {
      this.walletService.deposit(this.walletAmount, this.walletMethod, this.walletDetails).subscribe({
        next: (res) => {
          this.walletSuccess = res.message;
          this.walletDetails = '';
        },
        error: (err) => {
          this.walletError = err.error?.error || 'Failed to process deposit.';
        }
      });
    } else {
      this.walletService.withdraw(this.walletAmount, this.walletMethod, this.walletDetails).subscribe({
        next: (res) => {
          this.walletSuccess = res.message;
          this.walletDetails = '';
        },
        error: (err) => {
          this.walletError = err.error?.error || 'Failed to request withdrawal.';
        }
      });
    }
  }

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.walletService.getBalance().subscribe();
      this.fetchDailyCountdown();
    }
    
    // Timer interval ticks down cooldown seconds
    this.dailyCountdownInterval = setInterval(() => {
      if (this.dailyCooldownSeconds > 0) {
        this.dailyCooldownSeconds--;
        this.formattedDailyTime = this.formatTime(this.dailyCooldownSeconds);
      } else {
        this.formattedDailyTime = '00:00:00';
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.dailyCountdownInterval) {
      clearInterval(this.dailyCountdownInterval);
    }
  }

  protected fetchDailyCountdown(): void {
    this.walletService.getHistory(1, 20).subscribe({
      next: (res) => {
        const latestDaily = res.history.find(h => h.game === 'daily_bonus');
        if (latestDaily) {
          const diffMs = Date.now() - new Date(latestDaily.timestamp).getTime();
          const targetMs = 24 * 60 * 60 * 1000;
          if (diffMs < targetMs) {
            this.dailyCooldownSeconds = Math.ceil((targetMs - diffMs) / 1000);
            this.formattedDailyTime = this.formatTime(this.dailyCooldownSeconds);
          } else {
            this.dailyCooldownSeconds = 0;
            this.formattedDailyTime = '00:00:00';
          }
        } else {
          this.dailyCooldownSeconds = 0;
          this.formattedDailyTime = '00:00:00';
        }
      }
    });
  }

  private formatTime(totalSec: number): string {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  }

  public toggleNotifications(): void {
    if (this.isViewingNotifications) {
      this.isViewingNotifications = false;
      return;
    }
    this.walletService.getHistory(1, 5).subscribe({
      next: (res) => {
        this.notificationsList = res.history.map(tx => {
          const amtStr = Math.abs(tx.amount).toFixed(2);
          if (tx.type === 'reward' && tx.game === 'daily_bonus') {
            return `🎁 Daily Bonus: Claimed 50.00 Coins.`;
          }
          if (tx.type === 'reward' && tx.game === 'signup_reward') {
            return `🎉 Welcome: 1,000.00 Coins signup bonus active!`;
          }
          if (tx.type === 'reward' && tx.game === 'referral_reward') {
            return `📢 Referral: Received 2,000.00 Coins bonus!`;
          }
          if (tx.type === 'reward' && tx.game === 'deposit') {
            return `💰 Deposit: Cash credit of ${amtStr} Coins completed.`;
          }
          if (tx.type === 'cashout' && tx.game === 'withdrawal') {
            return `💵 Withdrawal: Request of ${amtStr} Coins submitted.`;
          }
          if (tx.type === 'win') {
            return `🏆 Victory: Won ${amtStr} Coins on ${tx.game.toUpperCase()}!`;
          }
          return `💸 Bet placed: ${amtStr} Coins wagered on ${tx.game.toUpperCase()}.`;
        });
        this.isViewingNotifications = true;
      }
    });
  }

  protected onClaimDaily(): void {
    this.dailySuccess = '';
    this.dailyError = '';

    this.walletService.claimDailyBonus().subscribe({
      next: (res) => {
        this.dailySuccess = res.message;
        this.dailyCooldownSeconds = 24 * 60 * 60;
        this.formattedDailyTime = this.formatTime(this.dailyCooldownSeconds);
        // play synth coin sound
        try {
          const audio = new AudioContext();
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          osc.connect(gain);
          gain.connect(audio.destination);
          osc.frequency.setValueAtTime(587.33, audio.currentTime); // D5
          osc.frequency.setValueAtTime(880.00, audio.currentTime + 0.1); // A5
          gain.gain.setValueAtTime(0.1, audio.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audio.currentTime + 0.35);
          osc.start();
          osc.stop(audio.currentTime + 0.4);
        } catch (_) {}
      },
      error: (err) => {
        this.dailyError = err.error?.error || 'Failed to claim daily bonus.';
      }
    });
  }

  protected onSubmitSupport(): void {
    this.supportSuccess = '';
    if (!this.supportMessage.trim()) return;

    setTimeout(() => {
      this.supportSuccess = 'Thank you for reaching out! A live support agent will follow up via your registered email shortly.';
      this.supportMessage = '';
    }, 600);
  }

  public copyInviteLink(): void {
    const user = this.authService.currentUser();
    if (!user || !user.referralCode) {
      alert('Please log in to generate an invite link.');
      return;
    }
    const link = `${window.location.origin}/auth?ref=${user.referralCode}`;
    navigator.clipboard.writeText(link).then(() => {
      alert(`Invite Link copied successfully!\nShare this link to earn 2,000 Coins bonus:\n\n${link}`);
    }).catch(err => {
      alert(`Your Invite Link:\n\n${link}`);
    });
  }

  protected onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    this.profileSuccess = 'Compressing image... Please wait.';
    this.profileError = '';

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const originalBase64 = e.target.result;
      this.compressImage(originalBase64, 10, 50).then(compressed => {
        this.profileAvatar = compressed;
        const sizeKb = (compressed.length * 3) / 4 / 1024;
        this.profileSuccess = `Photo uploaded and compressed successfully to ${sizeKb.toFixed(1)} KB!`;
        this.profileError = '';
      }).catch(err => {
        this.profileError = 'Failed to compress image. Please try another photo.';
        this.profileSuccess = '';
      });
    };
    reader.readAsDataURL(file);
  }

  private compressImage(dataUrl: string, minKb = 10, maxKb = 50): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDim = 200;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.7;
        let resultBase64 = canvas.toDataURL('image/jpeg', quality);
        let sizeKb = (resultBase64.length * 3) / 4 / 1024;

        if (sizeKb > maxKb) {
          for (let q = 0.6; q >= 0.1; q -= 0.1) {
            const testBase64 = canvas.toDataURL('image/jpeg', q);
            const testSize = (testBase64.length * 3) / 4 / 1024;
            if (testSize <= maxKb) {
              resultBase64 = testBase64;
              sizeKb = testSize;
              break;
            }
          }
        } else if (sizeKb < minKb) {
          resultBase64 = canvas.toDataURL('image/jpeg', 0.95);
        }

        resolve(resultBase64);
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      img.src = dataUrl;
    });
  }
}
