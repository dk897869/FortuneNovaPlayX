import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GameService, DiceRollResponse } from '../../services/game';
import { AuthService } from '../../services/auth';

interface ConfettiPiece {
  left: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
}

@Component({
  selector: 'app-dice',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dice.html',
  styleUrl: './dice.scss'
})
export class Dice {
  private readonly gameService = inject(GameService);
  protected readonly authService = inject(AuthService);

  // User input bindings
  protected betAmount = 10;
  protected target = 50.00;
  protected condition: 'over' | 'under' = 'over';
  protected clientSeed = 'player_lucky_seed';

  // Computed state
  protected winChance = 49.99;
  protected multiplier = 1.98;

  // Animation & UI states
  protected isRolling = false;
  protected rollResult: number | null = null;
  protected displayedRoll = 50.00;
  protected errorMessage = '';
  protected pipFace = 1;
  protected confettiPieces: ConfettiPiece[] = [];

  // Last outcome details
  protected lastResult: DiceRollResponse | null = null;

  // Ludo-style palette used for confetti bursts
  private readonly confettiColors = ['#E63946', '#FFD60A', '#3A86FF', '#06D6A0', '#F72585'];

  // Classic six-sided die pip layouts, mapped onto a 3x3 grid (cells 1-9)
  private readonly pipLayouts: Record<number, number[]> = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };
  protected readonly pipCells = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  constructor() {
    this.recalculateOdds();
  }

  protected get activePips(): number[] {
    return this.pipLayouts[this.pipFace] ?? [];
  }

  protected recalculateOdds(): void {
    if (this.target < 1.00) this.target = 1.00;
    if (this.target > 99.00) this.target = 99.00;

    if (this.condition === 'over') {
      if (this.target > 98.00) this.target = 98.00;
      this.winChance = 99.99 - this.target;
    } else {
      if (this.target < 2.00) this.target = 2.00;
      this.winChance = this.target;
    }

    this.multiplier = 99.0 / this.winChance;
  }

  protected setTarget(val: number): void {
    this.target = Math.round(val * 100) / 100;
    this.recalculateOdds();
  }

  protected toggleCondition(): void {
    this.condition = this.condition === 'over' ? 'under' : 'over';
    if (this.condition === 'under' && this.target === 50.00) {
      this.target = 50.00;
    }
    this.recalculateOdds();
  }

  protected onRoll(): void {
    if (this.isRolling) return;
    this.errorMessage = '';
    this.rollResult = null;
    this.confettiPieces = [];

    const user = this.authService.currentUser();
    if (!user) return;

    if (this.betAmount <= 0) {
      this.errorMessage = 'Bet amount must be greater than zero.';
      return;
    }
    if (this.betAmount > user.balance) {
      this.errorMessage = 'Insufficient balance to place this bet.';
      return;
    }

    this.isRolling = true;

    this.gameService.rollDice({
      betAmount: this.betAmount,
      target: this.target,
      condition: this.condition,
      clientSeed: this.clientSeed.trim()
    }).subscribe({
      next: (res) => {
        // Ticker animation
        let elapsed = 0;
        const duration = 1000; // 1 second duration
        const ticker = setInterval(() => {
          this.displayedRoll = Math.round((Math.random() * 99.99) * 100) / 100;
          this.pipFace = Math.floor(Math.random() * 6) + 1;
          elapsed += 40;
          if (elapsed >= duration) {
            clearInterval(ticker);
            this.displayedRoll = res.roll;
            this.rollResult = res.roll;
            this.lastResult = res;
            this.isRolling = false;
            if (res.won) {
              this.generateConfetti();
            }
          }
        }, 40);
      },
      error: (err) => {
        this.isRolling = false;
        this.errorMessage = err.error?.error || 'Roll failed.';
      }
    });
  }

  /** Resets the outcome card so the player can place a new bet. */
  protected playAgain(): void {
    this.lastResult = null;
    this.rollResult = null;
    this.errorMessage = '';
    this.confettiPieces = [];
  }

  // Predefined short cuts for bet sizing
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

  protected getSliderBackground(): string {
    const percent = this.target;
    if (this.condition === 'over') {
      return `linear-gradient(to right, #E63946 0%, #E63946 ${percent}%, #06D6A0 ${percent}%, #06D6A0 100%)`;
    } else {
      return `linear-gradient(to right, #06D6A0 0%, #06D6A0 ${percent}%, #E63946 ${percent}%, #E63946 100%)`;
    }
  }

  private generateConfetti(): void {
    this.confettiPieces = Array.from({ length: 46 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.8 + Math.random() * 1.4,
      color: this.confettiColors[Math.floor(Math.random() * this.confettiColors.length)],
      rotate: Math.random() * 360
    }));
  }
}