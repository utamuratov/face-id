import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'face-id',
    loadComponent: () => import('./face-id/face-id').then((m) => m.FaceId),
  },
  {
    path: 'face-liveness',
    loadComponent: () => import('./face-liveness/face-liveness').then((m) => m.FaceLiveness),
  },
  {
    path: 'ngx-face-id',
    loadComponent: () => import('./ngx-face-id/ngx-face-id').then((m) => m.NgxFaceId),
  },
];
