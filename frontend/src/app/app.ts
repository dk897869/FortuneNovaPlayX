import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { AuthService } from './services/auth';
import { LoaderService } from './services/loader';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  public readonly authService = inject(AuthService);
  public readonly loaderService = inject(LoaderService);
  private readonly router = inject(Router);

  public logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth']);
  }
}
