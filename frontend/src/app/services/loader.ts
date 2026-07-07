import { Injectable, signal, inject } from '@angular/core';
import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class LoaderService {
  public readonly isLoading = signal(false);
  private activeRequests = 0;

  public show(): void {
    this.activeRequests++;
    this.isLoading.set(true);
  }

  public hide(): void {
    this.activeRequests--;
    if (this.activeRequests <= 0) {
      this.activeRequests = 0;
      this.isLoading.set(false);
    }
  }
}

export const loaderInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const loaderService = inject(LoaderService);
  
  // Show loader only if request exceeds 150ms threshold
  const timeoutId = setTimeout(() => {
    loaderService.show();
  }, 150);

  return next(req).pipe(
    finalize(() => {
      clearTimeout(timeoutId);
      loaderService.hide();
    })
  );
};
