import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalletService, LeaderboardResponse, HistoryResponse, LedgerEntry } from '../../services/wallet';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-leaderboard',
  imports: [CommonModule],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.scss'
})
export class Leaderboard implements OnInit {
  private readonly walletService = inject(WalletService);
  private readonly authService = inject(AuthService);
  
  protected hasPlayed = false;
  protected topBalances: Array<{ username: string; balance: number }> = [];
  protected topWins: Array<{ username: string; amount: number; game: string; timestamp: string }> = [];
  protected errorMessage = '';

  ngOnInit(): void {
    this.checkUserPlayStatus();
  }

  private checkUserPlayStatus(): void {
    const user = this.authService.currentUser();
    if (!user) {
      this.hasPlayed = false;
      return;
    }
    // Query the history page to search for bet transactions
    this.walletService.getHistory(1, 20).subscribe({
      next: (res: HistoryResponse) => {
        const hasBets = res.history.some((tx: LedgerEntry) => tx.type === 'bet');
        this.hasPlayed = hasBets;
        if (this.hasPlayed) {
          this.loadLeaderboard();
        }
      },
      error: () => {
        this.hasPlayed = false;
      }
    });
  }

  protected loadLeaderboard(): void {
    this.walletService.getLeaderboard().subscribe({
      next: (res) => {
        this.topBalances = res.topBalances;
        this.topWins = res.topWins;
      },
      error: (err) => {
        this.errorMessage = 'Failed to load leaderboard statistics.';
      }
    });
  }
}
