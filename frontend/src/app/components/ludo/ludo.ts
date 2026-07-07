import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game';
import { AuthService } from '../../services/auth';

interface LudoCell {
  index: number;
  type: 'start' | 'normal' | 'star' | 'danger' | 'home';
  multiplierLabel: string;
}

@Component({
  selector: 'app-ludo',
  imports: [CommonModule, FormsModule],
  templateUrl: './ludo.html',
  styleUrl: './ludo.scss'
})
export class Ludo implements OnInit {
  private readonly gameService = inject(GameService);
  protected readonly authService = inject(AuthService);

  // Betting Controls
  protected betAmount = 10;
  protected clientSeed = 'ludo_dice_seed';

  // Game States
  protected gameId: string | null = null;
  protected isGameActive = false;
  protected isSubmitting = false;
  protected isCompleted = false;
  protected hitDanger = false;
  
  // Player Token Position
  protected currentPosition = 0; // 0 to 15
  protected currentMultiplier = 1.00;
  protected lastRoll = 0;
  protected logMessages: string[] = [];

  // Provably Fair Logs
  protected winMessage = '';
  protected errorMessage = '';
  protected serverSeed = '';
  protected serverSeedHash = '';
  protected nonce = 0;

  // Dice rolling animation states
  protected isRollingDice = false;
  protected diceVisualValue = 1;

  // 16 cells (0 to 15) track mapping
  protected trackCells: LudoCell[] = [
    { index: 0, type: 'start', multiplierLabel: 'Start' },
    { index: 1, type: 'normal', multiplierLabel: 'x1.1' },
    { index: 2, type: 'normal', multiplierLabel: 'x1.2' },
    { index: 3, type: 'star', multiplierLabel: '⭐ x1.3' },
    { index: 4, type: 'normal', multiplierLabel: 'x1.4' },
    { index: 5, type: 'normal', multiplierLabel: 'x1.5' },
    { index: 6, type: 'danger', multiplierLabel: '💀 x1.8' },
    { index: 7, type: 'normal', multiplierLabel: 'x1.7' },
    { index: 8, type: 'star', multiplierLabel: '⭐ x2.2' },
    { index: 9, type: 'normal', multiplierLabel: 'x1.9' },
    { index: 10, type: 'normal', multiplierLabel: 'x2.0' },
    { index: 11, type: 'danger', multiplierLabel: '💀 x3.2' },
    { index: 12, type: 'normal', multiplierLabel: 'x2.2' },
    { index: 13, type: 'star', multiplierLabel: '⭐ x4.0' },
    { index: 14, type: 'normal', multiplierLabel: 'x2.4' },
    { index: 15, type: 'home', multiplierLabel: '🏆 Home (x8.0)' }
  ];

  private audioCtx: AudioContext | null = null;

  ngOnInit(): void {
    this.resetGameLocal();
  }

  protected resetGameLocal(): void {
    this.currentPosition = 0;
    this.currentMultiplier = 1.00;
    this.lastRoll = 0;
    this.isCompleted = false;
    this.hitDanger = false;
    this.logMessages = ['Ready to play. Place a bet and roll!'];
    this.errorMessage = '';
    this.winMessage = '';
    this.serverSeed = '';
  }

  protected onStartLudo(): void {
    if (this.isGameActive || this.isSubmitting) return;

    const user = this.authService.currentUser();
    if (!user) return;

    if (this.betAmount <= 0) {
      this.errorMessage = 'Bet amount must be a positive number.';
      return;
    }
    if (this.betAmount > user.balance) {
      this.errorMessage = 'Insufficient balance.';
      return;
    }

    this.resetGameLocal();
    this.isSubmitting = true;

    this.gameService.startLudo({
      betAmount: this.betAmount,
      clientSeed: this.clientSeed.trim()
    }).subscribe({
      next: (res) => {
        this.gameId = res.gameId;
        this.serverSeedHash = res.serverSeedHash;
        this.nonce = res.nonce;
        
        this.isGameActive = true;
        this.isSubmitting = false;
        this.logMessages.push('Game started. Token placed on Start (Cell 0).');
        this.playStarSound(); // start chime
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Failed to start Ludo run.';
      }
    });
  }

  protected onRollDie(): void {
    if (!this.isGameActive || this.isSubmitting || !this.gameId || this.isRollingDice) return;

    this.isRollingDice = true;
    this.isSubmitting = true;
    this.errorMessage = '';

    // Dice rolling animation
    let tickCount = 0;
    const interval = setInterval(() => {
      this.diceVisualValue = Math.floor(Math.random() * 6) + 1;
      this.playDiceTick();
      tickCount++;
      if (tickCount >= 8) {
        clearInterval(interval);
        this.sendRollRequest();
      }
    }, 100);
  }

  private sendRollRequest(): void {
    if (!this.gameId) return;

    this.gameService.rollLudo({ gameId: this.gameId }).subscribe({
      next: (res) => {
        this.isRollingDice = false;
        this.isSubmitting = false;
        this.lastRoll = res.roll;
        this.diceVisualValue = res.roll;

        // Animate piece movement step-by-step
        this.animateTokenMove(res.position, () => {
          this.currentMultiplier = res.currentMultiplier;
          this.logMessages.push(res.message);

          if (res.isCompleted) {
            this.isGameActive = false;
            this.isCompleted = true;
            this.serverSeed = res.serverSeed || '';

            if (res.hitDanger) {
              this.hitDanger = true;
              this.errorMessage = res.message;
              this.playCaptureSound();
            } else {
              // Won Home Run
              this.winMessage = res.message;
              this.playVictorySound();
            }
          } else {
            // Check cell type sound
            const cellType = this.trackCells[res.position].type;
            if (cellType === 'star') {
              this.playStarSound();
            } else {
              this.playBeep(440, 0.08); // standard step sound
            }
          }
        });
      },
      error: (err) => {
        this.isRollingDice = false;
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Failed to roll die.';
      }
    });
  }

  private animateTokenMove(targetPosition: number, onComplete: () => void): void {
    const step = () => {
      if (this.currentPosition < targetPosition) {
        this.currentPosition++;
        this.playBeep(523.25, 0.06); // C5 woodblock sound
        setTimeout(step, 200);
      } else {
        onComplete();
      }
    };
    step();
  }

  protected onCashOut(): void {
    if (!this.isGameActive || this.isSubmitting || !this.gameId) return;

    this.isSubmitting = true;

    this.gameService.cashoutLudo({ gameId: this.gameId }).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.isGameActive = false;
        this.isCompleted = true;
        this.serverSeed = res.serverSeed;
        this.winMessage = `Successfully cashed out at cell ${this.currentPosition} (x${res.finalMultiplier.toFixed(2)}): Gained ${res.payout.toFixed(2)} Coins.`;
        this.playVictorySound();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Failed to cash out.';
      }
    });
  }

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

  // --- Sound Effects Synthesis ---
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
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {}
  }

  private playDiceTick(): void {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150 + Math.random() * 50, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.03, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.04);
    } catch (e) {}
  }

  private playStarSound(): void {
    try {
      this.playBeep(523.25, 0.1); // C5
      setTimeout(() => this.playBeep(659.25, 0.1), 80); // E5
      setTimeout(() => this.playBeep(783.99, 0.15), 160); // G5
    } catch (e) {}
  }

  private playCaptureSound(): void {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(330, this.audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(110, this.audioCtx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.5);
    } catch (e) {}
  }

  private playVictorySound(): void {
    try {
      this.playStarSound();
      setTimeout(() => this.playBeep(1046.50, 0.3), 240); // C6
    } catch (e) {}
  }
}
