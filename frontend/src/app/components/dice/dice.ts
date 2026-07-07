import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService, DiceRollResponse } from '../../services/game';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-dice',
  imports: [CommonModule, FormsModule],
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
  
  // Last outcome details
  protected lastResult: DiceRollResponse | null = null;

  constructor() {
    this.recalculateOdds();
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
    // Shift target to maintain default 50% chance if applicable
    if (this.condition === 'under' && this.target === 50.00) {
      this.target = 50.00;
    }
    this.recalculateOdds();
  }

  protected onRoll(): void {
    if (this.isRolling) return;
    this.errorMessage = '';
    this.rollResult = null;

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
          elapsed += 40;
          if (elapsed >= duration) {
            clearInterval(ticker);
            this.displayedRoll = res.roll;
            this.rollResult = res.roll;
            this.lastResult = res;
            this.isRolling = false;
          }
        }, 40);
      },
      error: (err) => {
        this.isRolling = false;
        this.errorMessage = err.error?.error || 'Roll failed.';
      }
    });
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
      return `linear-gradient(to right, #ef4444 0%, #ef4444 ${percent}%, #10b981 ${percent}%, #10b981 100%)`;
    } else {
      return `linear-gradient(to right, #10b981 0%, #10b981 ${percent}%, #ef4444 ${percent}%, #ef4444 100%)`;
    }
  }
}
