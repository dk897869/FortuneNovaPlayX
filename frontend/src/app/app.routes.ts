import { Routes } from '@angular/router';
import { Auth } from './components/auth/auth';
import { Dashboard } from './components/dashboard/dashboard';
import { Dice } from './components/dice/dice';
import { Mines } from './components/mines/mines';
import { FruitNinja } from './components/fruit-ninja/fruit-ninja';
import { Ludo } from './components/ludo/ludo';
import { Leaderboard } from './components/leaderboard/leaderboard';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
  { path: 'auth', component: Auth },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'dice', component: Dice, canActivate: [authGuard] },
  { path: 'mines', component: Mines, canActivate: [authGuard] },
  { path: 'fruit-ninja', component: FruitNinja, canActivate: [authGuard] },
  { path: 'ludo', component: Ludo, canActivate: [authGuard] },
  { path: 'leaderboard', component: Leaderboard, canActivate: [authGuard] },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' }
];
