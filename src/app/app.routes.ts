import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'comparision',
    pathMatch: 'full',
  },
  {
    path: 'comparision',
    loadComponent: () => import('./face-id/face-id').then((m) => m.FaceId),
  },
  {
    path: 'liveness',
    loadComponent: () => import('./ngx-face-id/ngx-face-id').then((m) => m.NgxFaceId),
  },
];
