import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game';
import { AuthService, User } from '../../services/auth';

type LudoColor = 'red' | 'green' | 'yellow' | 'blue';
type GameStateMode = 'LOBBY' | 'MATCHMAKING' | 'GAMEPLAY' | 'RESULTS';

interface LudoToken {
  id: number;       // 0 to 3
  color: LudoColor;
  position: number; // -1 = base, 0 to 56 = path index, 57 = Home
}

interface PlayerProfile {
  name: string;
  avatar: string;
  color: LudoColor;
  isBot: boolean;
  tokens: LudoToken[];
  hasWon: boolean;
}

// Track coordinate maps for outer board cells (52 cells starting from bottom-left corner entry)
const TRACK_COORDS = [
  { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 },
  { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 }, { r: 0, c: 6 },
  { r: 0, c: 7 }, // Green Start corridor entrance
  { r: 0, c: 8 }, { r: 1, c: 8 }, { r: 2, c: 8 }, { r: 3, c: 8 }, { r: 4, c: 8 }, { r: 5, c: 8 },
  { r: 6, c: 9 }, { r: 6, c: 10 }, { r: 6, c: 11 }, { r: 6, c: 12 }, { r: 6, c: 13 }, { r: 6, c: 14 },
  { r: 7, c: 14 }, // Yellow Start corridor entrance
  { r: 8, c: 14 }, { r: 8, c: 13 }, { r: 8, c: 12 }, { r: 8, c: 11 }, { r: 8, c: 10 }, { r: 8, c: 9 },
  { r: 9, c: 8 }, { r: 10, c: 8 }, { r: 11, c: 8 }, { r: 12, c: 8 }, { r: 13, c: 8 }, { r: 14, c: 8 },
  { r: 14, c: 7 }, // Blue Start corridor entrance
  { r: 14, c: 6 }, { r: 13, c: 6 }, { r: 12, c: 6 }, { r: 11, c: 6 }, { r: 10, c: 6 }, { r: 9, c: 6 },
  { r: 8, c: 5 }, { r: 8, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 2 }, { r: 8, c: 1 }, { r: 8, c: 0 },
  { r: 7, c: 0 }  // Red Start corridor entrance
];

// Home Base slots coordinates (where tokens sit inside bases)
const BASE_SLOTS: Record<LudoColor, { r: number, c: number }[]> = {
  red:    [{ r: 2, c: 2 }, { r: 2, c: 3 }, { r: 3, c: 2 }, { r: 3, c: 3 }],
  green:  [{ r: 2, c: 11 }, { r: 2, c: 12 }, { r: 3, c: 11 }, { r: 3, c: 12 }],
  yellow: [{ r: 11, c: 11 }, { r: 11, c: 12 }, { r: 12, c: 11 }, { r: 12, c: 12 }],
  blue:   [{ r: 11, c: 2 }, { r: 11, c: 3 }, { r: 12, c: 2 }, { r: 12, c: 3 }]
};

// Safe spots indices on the outer track
const SAFE_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];

@Component({
  selector: 'app-ludo',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './ludo.html',
  styleUrl: './ludo.scss'
})
export class Ludo implements OnInit, OnDestroy {
  private readonly gameService = inject(GameService);
  protected readonly authService = inject(AuthService);

  // Match configurations
  protected betAmount = 100;
  protected selectedColor: LudoColor = 'red';
  protected selectedPlayerCount = 2; // 2 or 4 players
  protected readonly availableColors: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

  protected get currentUserEmailName(): string {
    return this.authService.currentUser()?.email?.split('@')[0] || 'Player';
  }

  // Game States
  protected currentMode: GameStateMode = 'LOBBY';
  protected gameId: string | null = null;
  protected isRollingDice = false;
  protected lastRoll = 0;
  protected diceVisualValue = 1;

  // Active players
  protected players: PlayerProfile[] = [];
  protected activePlayerIndex = 0;
  protected isGameActive = false;
  protected winnerName = '';
  protected winPayout = 0;

  // Logs and Provably Fair variables
  protected logLines: string[] = [];
  protected serverSeedHash = '';
  protected clientSeed = 'ludo_seed_classic';
  protected nonce = 0;
  protected serverSeed = '';

  // Matchmaking variables
  protected matchmakingTimer = 3;
  private matchmakingInterval: any;
  protected matchedOpponents: { name: string; avatar: string; color: LudoColor }[] = [];

  // Synthesized sounds
  private audioCtx: AudioContext | null = null;

  // Dice roll counts
  private rollCount = 0;

  // Helper arrays for rendering grid cells
  protected gridRows = Array.from({ length: 15 }, (_, i) => i);
  protected gridCols = Array.from({ length: 15 }, (_, i) => i);

  // Track coordinates references
  protected readonly trackCoords = TRACK_COORDS;

  // Error indicators
  protected errorMessage = '';

  ngOnInit(): void {
    this.clientSeed = 'ludo_' + Math.random().toString(36).substring(2, 10);
  }

  ngOnDestroy(): void {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
    }
  }

  // --- Start Match (Lobby -> Matchmaking) ---
  protected onPlayLudo(): void {
    const user = this.authService.currentUser();
    if (!user) return;

    if (this.betAmount <= 0) {
      alert('Bet amount must be positive.');
      return;
    }
    if (this.betAmount > user.balance) {
      alert('Insufficient balance.');
      return;
    }

    this.currentMode = 'MATCHMAKING';
    this.matchmakingTimer = 3;
    this.matchedOpponents = [];
    this.playStarSound();

    // Deduct coins via API
    this.gameService.startLudo({
      betAmount: this.betAmount,
      clientSeed: this.clientSeed
    }).subscribe({
      next: (res) => {
        this.gameId = res.gameId;
        this.serverSeedHash = res.serverSeedHash;
        this.nonce = res.nonce;
        this.startMatchmakingCountdown();
      },
      error: (err) => {
        alert(err.error?.error || 'Failed to start bet.');
        this.currentMode = 'LOBBY';
      }
    });
  }

  private startMatchmakingCountdown(): void {
    // Generate simulated bot profiles
    const colors: LudoColor[] = ['red', 'green', 'yellow', 'blue'];
    const botPool = [
      { name: 'Akash', avatar: 'avatar-ninja' },
      { name: 'Deepak', avatar: 'avatar-surfer' },
      { name: 'Rohan', avatar: 'avatar-king' },
      { name: 'Aman', avatar: 'avatar-queen' },
      { name: 'Karan', avatar: 'avatar-champion' },
      { name: 'Sonia', avatar: 'avatar-diamond' }
    ];

    const chosenColors = colors.filter(c => c !== this.selectedColor);
    const opponentCount = this.selectedPlayerCount - 1;

    for (let i = 0; i < opponentCount; i++) {
      const idx = Math.floor(Math.random() * botPool.length);
      const bot = botPool.splice(idx, 1)[0];
      this.matchedOpponents.push({
        name: bot.name,
        avatar: bot.avatar,
        color: chosenColors[i]
      });
    }

    this.matchmakingInterval = setInterval(() => {
      this.matchmakingTimer--;
      this.playDiceTick();
      if (this.matchmakingTimer <= 0) {
        clearInterval(this.matchmakingInterval);
        this.initializeGameBoard();
      }
    }, 1000);
  }

  private initializeGameBoard(): void {
    this.players = [];
    this.logLines = ['Match started! Good luck.'];
    this.winnerName = '';
    this.winPayout = 0;
    this.serverSeed = '';
    this.rollCount = 0;

    // 1. Add User Profile
    const user = this.authService.currentUser();
    this.players.push({
      name: user ? user.email.split('@')[0] : 'Player',
      avatar: user?.avatar || 'avatar-ninja',
      color: this.selectedColor,
      isBot: false,
      tokens: this.createTokensForColor(this.selectedColor),
      hasWon: false
    });

    // 2. Add Opponents
    for (const opp of this.matchedOpponents) {
      this.players.push({
        name: opp.name,
        avatar: opp.avatar,
        color: opp.color,
        isBot: true,
        tokens: this.createTokensForColor(opp.color),
        hasWon: false
      });
    }

    // Set first turn
    this.activePlayerIndex = 0;
    this.isGameActive = true;
    this.currentMode = 'GAMEPLAY';

    this.logLines.push(`It's your turn! Roll the die.`);
  }

  private createTokensForColor(color: LudoColor): LudoToken[] {
    return Array.from({ length: 4 }, (_, i) => ({
      id: i,
      color,
      position: -1 // sitting in base
    }));
  }

  // --- Dice Rolling & Mechanics ---
  protected onRollClick(): void {
    if (!this.isGameActive || this.isRollingDice) return;
    if (this.players[this.activePlayerIndex].isBot) return; // bot is thinking

    this.isRollingDice = true;
    this.errorMessage = '';

    // Dice shaking animation steps
    let tick = 0;
    const interval = setInterval(() => {
      this.diceVisualValue = Math.floor(Math.random() * 6) + 1;
      this.playDiceTick();
      tick++;
      if (tick >= 8) {
        clearInterval(interval);
        this.requestRollResult();
      }
    }, 80);
  }

  private requestRollResult(): void {
    if (!this.gameId) return;

    this.gameService.rollLudo({
      gameId: this.gameId,
      rollIndex: this.rollCount++
    }).subscribe({
      next: (res) => {
        this.isRollingDice = false;
        this.lastRoll = res.roll;
        this.diceVisualValue = res.roll;

        this.processTurn(res.roll);
      },
      error: (err) => {
        this.isRollingDice = false;
        alert(err.error?.error || 'Roll failed.');
      }
    });
  }

  private processTurn(roll: number): void {
    const activePlayer = this.players[this.activePlayerIndex];
    this.logLines.push(`${activePlayer.name} rolled a ${roll}!`);

    // Check valid moves for this roll
    const validTokens = activePlayer.tokens.filter(tok => this.isValidMove(tok, roll));

    if (validTokens.length === 0) {
      this.logLines.push(`No valid moves for ${activePlayer.name}.`);
      this.rotateTurn(roll);
    } else {
      if (activePlayer.isBot) {
        // AI selects best token after a short pause
        setTimeout(() => this.makeBotMove(validTokens, roll), 800);
      } else {
        // User must click on one of the valid tokens to move
        this.logLines.push(`Select a token to move.`);
      }
    }
  }

  // Check if token can make a move
  protected isValidMove(token: LudoToken, roll: number): boolean {
    if (token.position === 57) return false; // already home
    if (token.position === -1) {
      return roll === 6; // needs a 6 to open
    }
    return token.position + roll <= 57; // cannot overshoot home
  }

  // Token Movement Animation & Collision checks
  protected onTokenClick(token: LudoToken): void {
    if (!this.isGameActive || this.isRollingDice) return;
    const activePlayer = this.players[this.activePlayerIndex];
    if (activePlayer.isBot) return; // not your turn
    if (token.color !== activePlayer.color) return; // not your token

    if (!this.isValidMove(token, this.lastRoll)) return;

    this.moveToken(token, this.lastRoll);
  }

  private moveToken(token: LudoToken, roll: number): void {
    const targetPos = token.position === -1 ? 0 : token.position + roll;

    // Step animation step by step
    const step = () => {
      if (token.position < targetPos) {
        token.position++;
        this.playBeep(480, 0.05);
        setTimeout(step, 180);
      } else {
        this.onTokenMoveComplete(token, roll);
      }
    };

    if (token.position === -1) {
      token.position = 0; // instantly step out of base
      this.playStarSound();
      this.onTokenMoveComplete(token, roll);
    } else {
      step();
    }
  }

  private onTokenMoveComplete(token: LudoToken, roll: number): void {
    // 1. Check if token landed Home
    if (token.position === 57) {
      this.logLines.push(`Token entered Home!`);
      this.playVictorySound();
      
      // Check if player won
      const allHome = this.players[this.activePlayerIndex].tokens.every(t => t.position === 57);
      if (allHome) {
        this.handleMatchWinner(this.players[this.activePlayerIndex]);
        return;
      }
    } else {
      // 2. Check Capture event
      const globalCellIndex = this.getGlobalTrackIndex(token);
      if (globalCellIndex !== -1 && !SAFE_INDICES.includes(globalCellIndex)) {
        // Look for opponent tokens resting on this cell
        for (const p of this.players) {
          if (p.color === token.color) continue;
          for (const enemy of p.tokens) {
            if (this.getGlobalTrackIndex(enemy) === globalCellIndex) {
              // Capture opponent token!
              enemy.position = -1; // send back to base
              this.logLines.push(`💥 Captured ${p.name}'s token at track cell ${globalCellIndex}!`);
              this.playCaptureSound();
              // Capture rewards attacker with an extra roll turn!
              this.logLines.push(`Extra turn awarded for capture!`);
              this.triggerNextRoll();
              return;
            }
          }
        }
      }
    }

    // 3. Rotate turn (or keep turn if rolled a 6)
    this.rotateTurn(roll);
  }

  private rotateTurn(roll: number): void {
    if (roll === 6 && this.isGameActive) {
      this.logLines.push(`Rolled a 6! Roll again.`);
      this.triggerNextRoll();
    } else {
      this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;
      this.triggerNextRoll();
    }
  }

  private triggerNextRoll(): void {
    if (!this.isGameActive) return;
    const activePlayer = this.players[this.activePlayerIndex];
    
    if (activePlayer.isBot) {
      this.logLines.push(`${activePlayer.name} is thinking...`);
      setTimeout(() => this.triggerBotRoll(), 1500);
    } else {
      this.logLines.push(`It's your turn! Roll the die.`);
    }
  }

  // --- Simulated Bot Turn Actions ---
  private triggerBotRoll(): void {
    if (!this.isGameActive) return;
    this.isRollingDice = true;

    let tick = 0;
    const interval = setInterval(() => {
      this.diceVisualValue = Math.floor(Math.random() * 6) + 1;
      this.playDiceTick();
      tick++;
      if (tick >= 8) {
        clearInterval(interval);
        this.gameService.rollLudo({
          gameId: this.gameId!,
          rollIndex: this.rollCount++
        }).subscribe({
          next: (res) => {
            this.isRollingDice = false;
            this.lastRoll = res.roll;
            this.diceVisualValue = res.roll;
            this.processTurn(res.roll);
          },
          error: () => {
            this.isRollingDice = false;
            this.rotateTurn(0);
          }
        });
      }
    }, 80);
  }

  private makeBotMove(validTokens: LudoToken[], roll: number): void {
    // 1. Bot prioritizes capture moves
    for (const tok of validTokens) {
      const targetPos = tok.position === -1 ? 0 : tok.position + roll;
      const dummyToken = { ...tok, position: targetPos };
      const globalCellIndex = this.getGlobalTrackIndex(dummyToken);
      if (globalCellIndex !== -1 && !SAFE_INDICES.includes(globalCellIndex)) {
        for (const p of this.players) {
          if (p.color === tok.color) continue;
          for (const enemy of p.tokens) {
            if (this.getGlobalTrackIndex(enemy) === globalCellIndex) {
              this.moveToken(tok, roll);
              return;
            }
          }
        }
      }
    }

    // 2. Bot prioritizes releasing a token from base
    const baseToken = validTokens.find(tok => tok.position === -1);
    if (baseToken && roll === 6) {
      this.moveToken(baseToken, roll);
      return;
    }

    // 3. Bot prioritizes home corridor entries
    const homeEntryToken = validTokens.find(tok => tok.position + roll === 57);
    if (homeEntryToken) {
      this.moveToken(homeEntryToken, roll);
      return;
    }

    // 4. Fallback: move furthest active token
    validTokens.sort((a, b) => b.position - a.position);
    this.moveToken(validTokens[0], roll);
  }

  // --- Win / Lose Handlers ---
  private handleMatchWinner(winner: PlayerProfile): void {
    this.isGameActive = false;
    this.winnerName = winner.name;
    this.currentMode = 'RESULTS';

    if (!winner.isBot) {
      // User won! Claim win payout
      this.gameService.cashoutLudo({
        gameId: this.gameId!,
        playerCount: this.selectedPlayerCount
      }).subscribe({
        next: (res) => {
          this.winPayout = res.payout;
          this.serverSeed = res.serverSeed;
          this.playVictorySound();
        },
        error: (err) => {
          alert('Failed to claim wins.');
        }
      });
    } else {
      // User lost. Reveal server seed
      this.gameService.cashoutLudo({
        gameId: this.gameId!,
        playerCount: 0 // credits 0 payout
      }).subscribe({
        next: (res) => {
          this.winPayout = 0;
          this.serverSeed = res.serverSeed;
          this.playCaptureSound();
        }
      });
    }
  }

  protected onReturnToLobby(): void {
    this.currentMode = 'LOBBY';
    this.gameId = null;
    this.players = [];
    this.matchedOpponents = [];
  }

  // --- Ludo Coordinate Mapping Helpers ---
  protected getCellClass(r: number, c: number): string {
    // Bases
    if (r < 6 && c < 6) return 'cell-base red-base-theme';
    if (r < 6 && c > 8) return 'cell-base green-base-theme';
    if (r > 8 && c > 8) return 'cell-base yellow-base-theme';
    if (r > 8 && c < 6) return 'cell-base blue-base-theme';

    // Center Home
    if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return 'cell-center';

    // Red Home Path
    if (r === 7 && c >= 1 && c <= 5) return 'cell-path red-path-theme';
    // Green Home Path
    if (c === 7 && r >= 1 && r <= 5) return 'cell-path green-path-theme';
    // Yellow Home Path
    if (r === 7 && c >= 9 && c <= 13) return 'cell-path yellow-path-theme';
    // Blue Home Path
    if (c === 7 && r >= 9 && r <= 13) return 'cell-path blue-path-theme';

    // Start Squares
    if (r === 6 && c === 1) return 'cell-path red-path-theme cell-start-icon';
    if (r === 1 && c === 8) return 'cell-path green-path-theme cell-start-icon';
    if (r === 8 && c === 13) return 'cell-path yellow-path-theme cell-start-icon';
    if (r === 13 && c === 6) return 'cell-path blue-path-theme cell-start-icon';

    // Safe Stars spots
    if ((r === 8 && c === 2) || (r === 2 && c === 6) || (r === 6 && c === 12) || (r === 12 && c === 8)) {
      return 'cell-path cell-safe-star';
    }

    return 'cell-path';
  }

  // Find if a token sits on this specific cell (r, c)
  protected getTokensAtCell(r: number, c: number): LudoToken[] {
    const list: LudoToken[] = [];
    for (const p of this.players) {
      for (const tok of p.tokens) {
        const coords = this.getTokenCoordinates(tok);
        if (coords && coords.r === r && coords.c === c) {
          list.push(tok);
        }
      }
    }
    return list;
  }

  // Get coordinates `{ r, c }` for a token based on its position steps
  private getTokenCoordinates(token: LudoToken): { r: number, c: number } | null {
    if (token.position === 57) {
      // Sitting at Home center triangle
      return { r: 7, c: 7 };
    }

    if (token.position === -1) {
      // Resting inside Base slots
      return BASE_SLOTS[token.color][token.id];
    }

    // Step mapping along the colors path
    const pathIndex = this.getPathIndexForColor(token.color, token.position);
    return pathIndex;
  }

  private getPathIndexForColor(color: LudoColor, position: number): { r: number, c: number } {
    const offsetMap: Record<LudoColor, number> = {
      red: 0,
      green: 13,
      yellow: 26,
      blue: 39
    };

    if (position < 51) {
      const globalIdx = (offsetMap[color] + position) % 52;
      return TRACK_COORDS[globalIdx];
    }

    // Home corridors steps (51 to 56)
    const homeStep = position - 51; // 0 to 5
    const homeCorridors: Record<LudoColor, { r: number, c: number }[]> = {
      red:    [{ r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 }],
      green:  [{ r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }, { r: 6, c: 7 }],
      yellow: [{ r: 7, c: 13 }, { r: 7, c: 12 }, { r: 7, c: 11 }, { r: 7, c: 10 }, { r: 7, c: 9 }, { r: 7, c: 8 }],
      blue:   [{ r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 }, { r: 9, c: 7 }, { r: 8, c: 7 }]
    };

    return homeCorridors[color][homeStep];
  }

  // Get index (0-51) on outer track if token is currently placed there, else -1
  private getGlobalTrackIndex(token: LudoToken): number {
    if (token.position === -1 || token.position >= 51) return -1;
    const offsetMap: Record<LudoColor, number> = {
      red: 0,
      green: 13,
      yellow: 26,
      blue: 39
    };
    return (offsetMap[token.color] + token.position) % 52;
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
      gain.gain.setValueAtTime(0.04, this.audioCtx.currentTime);
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
      osc.frequency.setValueAtTime(140 + Math.random() * 60, this.audioCtx.currentTime);
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
      this.playBeep(587.33, 0.08); // D5
      setTimeout(() => this.playBeep(698.46, 0.08), 80); // F5
      setTimeout(() => this.playBeep(880.00, 0.15), 160); // A5
    } catch (e) {}
  }

  private playCaptureSound(): void {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(290, this.audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(80, this.audioCtx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.4);
    } catch (e) {}
  }

  private playVictorySound(): void {
    try {
      this.playStarSound();
      setTimeout(() => this.playBeep(1174.66, 0.25), 240); // D6
    } catch (e) {}
  }
}
