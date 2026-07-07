import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game';
import { AuthService } from '../../services/auth';

interface FruitCell {
  index: number;
  status: 'unrevealed' | 'sliced' | 'bomb' | 'bomb-unhit';
  fruitEmoji: string;
  isSlicing: boolean;
}

@Component({
  selector: 'app-fruit-ninja',
  imports: [CommonModule, FormsModule],
  templateUrl: './fruit-ninja.html',
  styleUrl: './fruit-ninja.scss'
})
export class FruitNinja implements OnInit {
  private readonly gameService = inject(GameService);
  protected readonly authService = inject(AuthService);

  // Betting Panel
  protected betAmount = 10;
  protected bombCount = 3;
  protected clientSeed = 'ninja_slice_seed';

  // Game States
  protected gameId: string | null = null;
  protected isGameActive = false;
  protected isSubmitting = false;
  protected currentMultiplier = 1.0;
  protected nextMultiplier = 1.13;
  
  // 5x5 board state
  protected cells: FruitCell[] = [];
  
  // Outcomes & Provably Fair logs
  protected winMessage = '';
  protected errorMessage = '';
  protected serverSeed = '';
  protected serverSeedHash = '';
  protected nonce = 0;

  // Emojis for the fruits
  private readonly fruitEmojis = ['🍎', '🍉', '🍌', '🥥', '🍇', '🍓', '🍍', '🍊', '🍒', '🥝'];
  private audioCtx: AudioContext | null = null;

  ngOnInit(): void {
    this.resetBoard();
  }

  protected resetBoard(): void {
    this.cells = Array.from({ length: 25 }, (_, i) => ({
      index: i,
      status: 'unrevealed',
      fruitEmoji: this.getRandomFruit(),
      isSlicing: false
    }));
    this.errorMessage = '';
    this.winMessage = '';
    this.serverSeed = '';
  }

  private getRandomFruit(): string {
    const idx = Math.floor(Math.random() * this.fruitEmojis.length);
    return this.fruitEmojis[idx];
  }

  protected getNextMultiplierPreview(): number {
    const revealedCount = this.cells.filter(c => c.status === 'sliced').length;
    const totalSafe = 25 - this.bombCount;
    if (revealedCount >= totalSafe) return this.currentMultiplier;

    let p = 1.0;
    const nextRevealedCount = revealedCount + 1;
    for (let i = 0; i < nextRevealedCount; i++) {
      p *= (25 - this.bombCount - i) / (25 - i);
    }
    const mult = 0.99 / p;
    return Math.round(mult * 100) / 100;
  }

  protected get hasSlicedFruits(): boolean {
    return this.cells.some(c => c.status === 'sliced');
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
      this.errorMessage = 'Insufficient balance.';
      return;
    }

    this.resetBoard();
    this.isSubmitting = true;

    // Call mines/start on backend
    this.gameService.startMines({
      betAmount: this.betAmount,
      mineCount: this.bombCount,
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
          res.revealedCells.forEach(idx => {
            this.cells[idx].status = 'sliced';
          });
        }
        this.playSwishSound(150, 450); // swish intro
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Failed to start game.';
      }
    });
  }

  protected onCellClick(cell: FruitCell): void {
    if (!this.isGameActive || this.isSubmitting || !this.gameId) return;
    if (cell.status !== 'unrevealed') return;

    cell.isSlicing = true;
    this.isSubmitting = true;

    // Call revealCell (Mines API)
    this.gameService.revealCell({
      gameId: this.gameId,
      cellIndex: cell.index
    }).subscribe({
      next: (res) => {
        cell.isSlicing = false;
        this.isSubmitting = false;

        if (res.hitMine) {
          // Explode! Sliced a Bomb
          cell.status = 'bomb';
          this.isGameActive = false;
          this.currentMultiplier = 0.0;
          this.serverSeed = res.serverSeed || '';
          this.errorMessage = 'BOOM! Sliced a bomb! Game over.';
          this.playBombExplosion();

          // Reveal other bomb positions
          this.cells.forEach(c => {
            if (res.minePositions?.includes(c.index) && c.index !== cell.index) {
              c.status = 'bomb-unhit';
            }
          });
        } else {
          // Safe Slice!
          cell.status = 'sliced';
          this.currentMultiplier = res.currentMultiplier;
          this.nextMultiplier = this.getNextMultiplierPreview();
          
          // Slice Sound Effect (frequency rises up quickly)
          this.playSwishSound(300 + (this.cells.filter(c => c.status === 'sliced').length * 40), 900);

          if (res.isCompleted) {
            this.isGameActive = false;
            this.winMessage = `Ultimate Ninja! Cleanly sliced all fruits for x${res.currentMultiplier}!`;
            this.serverSeed = res.serverSeed || '';
            
            this.cells.forEach(c => {
              if (res.minePositions?.includes(c.index)) {
                c.status = 'bomb-unhit';
              }
            });
            this.playFanfare();
          }
        }
      },
      error: (err) => {
        cell.isSlicing = false;
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Failed to slice.';
      }
    });
  }

  protected onCashOut(): void {
    if (!this.isGameActive || this.isSubmitting || !this.gameId) return;

    this.isSubmitting = true;

    this.gameService.cashoutMines({ gameId: this.gameId }).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.isGameActive = false;
        this.serverSeed = res.serverSeed;
        this.winMessage = `Fruit sliced successfully! Cashed out x${this.currentMultiplier.toFixed(2)}: Received ${res.payout.toFixed(2)} Coins.`;
        
        // Show remaining bombs
        this.cells.forEach(c => {
          if (res.minePositions.includes(c.index)) {
            c.status = 'bomb-unhit';
          }
        });

        this.playFanfare();
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

  private playSwishSound(startFreq: number, endFreq: number): void {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, this.audioCtx.currentTime + 0.12);
      
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.12);
      
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.12);
    } catch (e) {}
  }

  private playBombExplosion(): void {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      // White noise explosion
      const bufferSize = this.audioCtx.sampleRate * 0.5; // 0.5 seconds
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.audioCtx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(10, this.audioCtx.currentTime + 0.5);
      
      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.25, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.5);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioCtx.destination);
      
      noise.start();
      noise.stop(this.audioCtx.currentTime + 0.5);
    } catch (e) {}
  }

  private playFanfare(): void {
    try {
      this.playSwishSound(261, 523);
      setTimeout(() => this.playSwishSound(329, 659), 100);
      setTimeout(() => this.playSwishSound(392, 784), 200);
    } catch (e) {}
  }
}
