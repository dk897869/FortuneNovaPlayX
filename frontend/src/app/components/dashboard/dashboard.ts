import { Component, inject, OnInit, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { WalletService, LedgerEntry } from '../../services/wallet';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {
  private readonly walletService = inject(WalletService);
  protected readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);

  protected get totalWagered(): number {
    const bets = this.history.filter(h => h.type === 'bet');
    if (bets.length === 0) return 0;
    return Math.abs(bets.reduce((sum, h) => sum + h.amount, 0));
  }

  protected get totalWon(): number {
    const wins = this.history.filter(h => h.type === 'win');
    if (wins.length === 0) return 0;
    return wins.reduce((sum, h) => sum + h.amount, 0);
  }

  protected get winRate(): number {
    const betsCount = this.history.filter(h => h.type === 'bet').length;
    if (betsCount === 0) return 0;
    const winsCount = this.history.filter(h => h.type === 'win').length;
    return Number(((winsCount / betsCount) * 100).toFixed(2));
  }

  protected get gamesPlayed(): number {
    const played = this.history.filter(h => h.type === 'bet').length;
    return played;
  }

  protected get biggestWin(): number {
    const wins = this.history.filter(h => h.type === 'win').map(h => h.amount);
    if (wins.length === 0) return 0;
    return Math.max(...wins);
  }

  protected get currentUserEmailName(): string {
    return this.authService.currentUser()?.email?.split('@')[0] || 'Player';
  }

  protected get gamesWonCount(): number {
    const wins = this.history.filter(h => h.type === 'win').length;
    return wins;
  }



  // Ledger history pagination states
  protected history: LedgerEntry[] = [];
  protected currentPage = 1;
  protected totalPages = 1;
  protected totalCount = 0;
  protected limit = 8;

  // Leaderboard & Play status
  protected hasPlayed = false;
  protected topBalances: Array<{ username: string; balance: number }> = [];

  // Fairness Verifier States
  protected verifierServerSeed = '';
  protected verifierClientSeed = '';
  protected verifierNonce = 1;
  protected verifierGameType: 'dice' | 'mines' | 'ludo' = 'dice';
  protected verifierMineCount = 3;
  protected verifierResult: any = null;
  protected verifierError = '';

  ngOnInit(): void {
    this.loadHistory(1);
    this.walletService.getBalance().subscribe(); // refresh balance
  }

  protected loadHistory(page: number): void {
    if (page < 1 || page > this.totalPages && this.totalPages > 0) return;
    
    this.walletService.getHistory(page, this.limit).subscribe({
      next: (res) => {
        this.history = res.history;
        this.currentPage = res.page;
        this.totalPages = res.totalPages;
        this.totalCount = res.totalCount;

        const hasBets = res.history.some(tx => tx.type === 'bet');
        this.hasPlayed = hasBets;

        if (this.hasPlayed) {
          this.walletService.getLeaderboard().subscribe({
            next: (leaderRes) => {
              this.topBalances = leaderRes.topBalances.slice(0, 5);
            }
          });
        }
      }
    });
  }

  protected nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.loadHistory(this.currentPage + 1);
    }
  }

  protected prevPage(): void {
    if (this.currentPage > 1) {
      this.loadHistory(this.currentPage - 1);
    }
  }

  // Provably Fair Verifier
  protected async onVerifyOutcome(): Promise<void> {
    this.verifierResult = null;
    this.verifierError = '';

    if (!this.verifierServerSeed || !this.verifierClientSeed || this.verifierNonce < 1) {
      this.verifierError = 'Please fill out all seed parameters (Server Seed, Client Seed, and Nonce).';
      return;
    }

    try {
      const serverSeedHex = this.verifierServerSeed.trim();
      const clientSeedStr = this.verifierClientSeed.trim();
      const nonceVal = this.verifierNonce;
      const dataStr = `${clientSeedStr}-${nonceVal}`;

      // 1. Calculate server seed hash (SHA-256)
      const enc = new TextEncoder();
      const serverSeedBytes = enc.encode(serverSeedHex);
      const serverSeedHashBuffer = await window.crypto.subtle.digest('SHA-256', serverSeedBytes);
      const serverSeedHash = Array.from(new Uint8Array(serverSeedHashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // 2. Generate HMAC-SHA256 signature
      // Parse key as hex bytes array
      if (!/^[0-9a-fA-F]+$/.test(serverSeedHex)) {
        this.verifierError = 'Server Seed must be a valid hex string.';
        return;
      }
      
      const keyBytes = new Uint8Array(serverSeedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const key = await window.crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signatureBuffer = await window.crypto.subtle.sign(
        'HMAC',
        key,
        enc.encode(dataStr)
      );
      const signatureBytes = new Uint8Array(signatureBuffer);
      const signatureHex = Array.from(signatureBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      if (this.verifierGameType === 'dice') {
        // Take first 8 hex characters
        const subHash = signatureHex.substring(0, 8);
        const val = parseInt(subHash, 16);
        const roll = (val % 10000) / 100;
        
        this.verifierResult = {
          game: 'Dice',
          serverSeedHash,
          hmacSignature: signatureHex,
          outcome: `Roll outcome was: ${roll.toFixed(2)}`
        };
      } else if (this.verifierGameType === 'ludo') {
        // Take first 8 hex characters
        const subHash = signatureHex.substring(0, 8);
        const val = parseInt(subHash, 16);
        const roll = (val % 6) + 1; // 1 to 6
        
        this.verifierResult = {
          game: 'Ludo',
          serverSeedHash,
          hmacSignature: signatureHex,
          outcome: `Die Roll outcome was: ${roll}`
        };
      } else {
        // Mines layout shuffle
        const indices = Array.from({ length: 25 }, (_, i) => i);
        let byteIndex = 0;
        let hashBuffer = signatureBytes;

        const getNextByte = async (): Promise<number> => {
          if (byteIndex >= hashBuffer.length) {
            const digest = await window.crypto.subtle.digest('SHA-256', hashBuffer);
            hashBuffer = new Uint8Array(digest);
            byteIndex = 0;
          }
          return hashBuffer[byteIndex++];
        };

        for (let i = 24; i > 0; i--) {
          const randomByte = await getNextByte();
          const j = randomByte % (i + 1);
          
          const temp = indices[i];
          indices[i] = indices[j];
          indices[j] = temp;
        }

        const minePositions = indices.slice(0, this.verifierMineCount);
        
        this.verifierResult = {
          game: `Mines (${this.verifierMineCount} Mines)`,
          serverSeedHash,
          hmacSignature: signatureHex,
          outcome: `Mine Indices (0 to 24): [ ${minePositions.join(', ')} ]`,
          minePositions
        };
      }
    } catch (e: any) {
      this.verifierError = `Verification failed: ${e.message}`;
    }
  }

  // Helper for grid layouts in verifier output
  protected isMineInCell(index: number): boolean {
    return this.verifierResult?.minePositions?.includes(index) || false;
  }

  protected openProfileEditor(): void {
    this.authService.showSettingsModal.set(true);
  }

  protected openWalletAction(type: 'deposit' | 'withdraw'): void {
    this.authService.showWalletModal.set({ active: true, type });
  }
}
