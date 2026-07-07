import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalletService, LeaderboardResponse } from '../../services/wallet';

@Component({
  selector: 'app-leaderboard',
  imports: [CommonModule],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.scss'
})
export class Leaderboard implements OnInit {
  private readonly walletService = inject(WalletService);
  
  protected topBalances: Array<{ username: string; balance: number }> = [];
  protected topWins: Array<{ username: string; amount: number; game: string; timestamp: string }> = [];
  protected errorMessage = '';

  ngOnInit(): void {
    this.loadLeaderboard();
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
