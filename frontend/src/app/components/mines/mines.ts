import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService, MinesStartResponse, MinesRevealResponse } from '../../services/game';
import { AuthService } from '../../services/auth';

interface CellState {
  index: number;
  status: 'unrevealed' | 'gem' | 'mine' | 'mine-unhit';
  isRevealing: boolean;
}

@Component({
  selector: 'app-mines',
  imports: [CommonModule, FormsModule],
  templateUrl: './mines.html',
  styleUrl: './mines.scss'
})
export class Mines implements OnInit {
  private readonly gameService = inject(GameService);
  protected readonly authService = inject(AuthService);

  // Betting Controls
  protected betAmount = 10;
  protected mineCount = 3;
  protected clientSeed = 'lucky_mines';

  // Game States
  protected gameId: string | null = null;
  protected isGameActive = false;
  protected isSubmitting = false;
  protected currentMultiplier = 1.0;
  protected nextMultiplier = 1.13;
  
  // 5x5 board state
  protected cells: CellState[] = [];
  
  // Outcomes & Provably Fair logs
  protected winMessage = '';
  protected errorMessage = '';
  protected serverSeed = '';
  protected serverSeedHash = '';
  protected nonce = 0;

  // Audio/Visual click indicators
  private audioCtx: AudioContext | null = null;

  ngOnInit(): void {
    this.resetBoard();
    this.checkActiveGame();
  }

  private resetBoard(): void {
    this.cells = Array.from({ length: 25 }, (_, i) => ({
      index: i,
      status: 'unrevealed',
      isRevealing: false
    }));
    this.errorMessage = '';
    this.winMessage = '';
    this.serverSeed = '';
  }

  private checkActiveGame(): void {
    // Call startMines with 0 bet just to trigger the resume check
    // Wait, the backend startMines controller automatically checks for active games.
    // So we can send a mock start request, but wait! If there is no active game, that would start a new game with the parameters!
    // Instead of using startMines to check, we can just let startMines return the resumed game if there is one.
    // However, to check on load without charging balance, we can add a resume check or handle it in startMines.
    // Wait, in GameController.js startMines:
    // "Resume check: if user already has an active game, return it"
    // So if there's an active game, startMines doesn't deduct balance and returns the active game!
    // But what if there isn't? We don't want to place a bet immediately on page load!
    // Let's check: did we write a resume endpoint? No. But we can start a new game with low amount or we can let the backend check.
    // Actually, let's write a small endpoint in backend/src/controllers/GameController.js to GET the active game state if any!
    // That's an extremely neat way to resume!
    // Wait, is there an active game search we can do?
    // Let's implement `getActiveMinesGame` in `GameController.js` and mount it on GET `/api/games/mines/active`.
    // Let's check `GameController.js` and add this GET route! It will make resuming fully flawless without any unwanted bets.
    // Yes! Let's edit `GameController.js` to add `getActiveMines` and mount it in `api.js`.
  }

  protected getNextMultiplierPreview(): number {
    const revealedCount = this.cells.filter(c => c.status === 'gem').length;
    // P = (25 - mineCount - revealedCount) / (25 - revealedCount)
    // Multiplier increment = 0.99 / (current_p * next_p)
    const totalSafe = 25 - this.mineCount;
    if (revealedCount >= totalSafe) return this.currentMultiplier;

    let p = 1.0;
    const nextRevealedCount = revealedCount + 1;
    for (let i = 0; i < nextRevealedCount; i++) {
      p *= (25 - this.mineCount - i) / (25 - i);
    }
    const mult = 0.99 / p;
    return Math.round(mult * 100) / 100;
  }

  protected onStartGame(): void {
    if (this.isGameActive || this.isSubmitting) return;

    const user = this.authService.currentUser();
    if (!user) return;

    if (this.betAmount <= 0) {
      this.errorMessage = 'Bet amount must be a positive number.';
      return;
    }
    if (this.betAmount > user.balance) {
      this.errorMessage = 'Insufficient balance to start this Mines round.';
      return;
    }

    this.resetBoard();
    this.isSubmitting = true;

    this.gameService.startMines({
      betAmount: this.betAmount,
      mineCount: this.mineCount,
      clientSeed: this.clientSeed.trim()
    }).subscribe({
      next: (res) => {
        this.gameId = res.gameId;
        this.isGameActive = true;
        this.isSubmitting = false;
        this.serverSeedHash = res.serverSeedHash;
        this.nonce = res.nonce;
        this.currentMultiplier = res.currentMultiplier;
        this.nextMultiplier = this.getNextMultiplierPreview();

        if (res.isResumed) {
          // Repopulate cells
          res.revealedCells.forEach(idx => {
            this.cells[idx].status = 'gem';
          });
        }
        this.playBeep(220, 0.08); // start beep sound
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Failed to start game.';
      }
    });
  }

  protected onCellClick(cell: CellState): void {
    if (!this.isGameActive || this.isSubmitting || !this.gameId) return;
    if (cell.status !== 'unrevealed') return;

    cell.isRevealing = true;
    this.isSubmitting = true;

    this.gameService.revealCell({
      gameId: this.gameId,
      cellIndex: cell.index
    }).subscribe({
      next: (res) => {
        cell.isRevealing = false;
        this.isSubmitting = false;

        if (res.hitMine) {
          // Blast! Game Over
          cell.status = 'mine';
          this.isGameActive = false;
          this.currentMultiplier = 0.0;
          this.serverSeed = res.serverSeed || '';
          this.errorMessage = 'BOOM! You hit a mine and lost your bet.';
          this.playExplosionSound();

          // Reveal other mine positions
          this.cells.forEach(c => {
            if (res.minePositions?.includes(c.index) && c.index !== cell.index) {
              c.status = 'mine-unhit';
            }
          });
        } else {
          // Safe spot!
          cell.status = 'gem';
          this.currentMultiplier = res.currentMultiplier;
          this.nextMultiplier = this.getNextMultiplierPreview();
          this.playBeep(330 + (this.cells.filter(c => c.status === 'gem').length * 20), 0.12);

          if (res.isCompleted) {
            // Auto cashout (cleared board)
            this.isGameActive = false;
            this.winMessage = `Flawless Victory! Cleared all safe spots for x${res.currentMultiplier}!`;
            this.serverSeed = res.serverSeed || '';
            
            this.cells.forEach(c => {
              if (res.minePositions?.includes(c.index)) {
                c.status = 'mine-unhit';
              }
            });
            this.playFanfare();
          }
        }
      },
      error: (err) => {
        cell.isRevealing = false;
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Failed to reveal cell.';
      }
    });
  }

  protected onCashOut(): void {
    if (!this.isGameActive || this.isSubmitting || !this.gameId) return;

    const revealedCount = this.cells.filter(c => c.status === 'gem').length;
    if (revealedCount === 0) {
      this.errorMessage = 'You must reveal at least one safe cell before cashing out.';
      return;
    }

    this.isSubmitting = true;

    this.gameService.cashoutMines({ gameId: this.gameId }).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.isGameActive = false;
        this.serverSeed = res.serverSeed;
        this.winMessage = `Successfully cashed out x${this.currentMultiplier.toFixed(2)}! Credited ${res.payout.toFixed(2)} Coins.`;
        
        // Show remaining mine positions
        this.cells.forEach(c => {
          if (res.minePositions.includes(c.index)) {
            c.status = 'mine-unhit';
          }
        });

        this.playFanfare();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Cashout failed.';
      }
    });
  }

  protected get hasRevealedGems(): boolean {
    return this.cells.some(c => c.status === 'gem');
  }

  // Predefined shortcuts for bet sizing
  protected adjustBet(action: 'half' | 'double' | 'max'): void {
    const user = this.authService.currentUser();
    if (!user) return;

    if (action === 'half') {
      this.betAmount = Math.max(0.01, Math.round((this.betAmount / 2) * 100) / 100);
    } else if (action === 'double') {
      this.betAmount = Math.min(user.balance, Math.round((this.betAmount * 2) * 100) / 100);
    } else if (action === 'max') {
      this.betAmount = user.balance;
    }
  }

  // Synthesis web audio sound effects
  private initAudio(): void {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private playBeep(freq: number, duration: number): void {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio fallback silent
    }
  }

  private playExplosionSound(): void {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const noise = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      noise.type = 'sawtooth';
      noise.frequency.setValueAtTime(100, this.audioCtx.currentTime);
      noise.frequency.linearRampToValueAtTime(20, this.audioCtx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.6);
      noise.connect(gain);
      gain.connect(this.audioCtx.destination);
      noise.start();
      noise.stop(this.audioCtx.currentTime + 0.6);
    } catch (e) {}
  }

  private playFanfare(): void {
    try {
      this.playBeep(261.63, 0.1); // C4
      setTimeout(() => this.playBeep(329.63, 0.1), 100); // E4
      setTimeout(() => this.playBeep(392.00, 0.1), 200); // G4
      setTimeout(() => this.playBeep(523.25, 0.3), 300); // C5
    } catch (e) {}
  }
}
