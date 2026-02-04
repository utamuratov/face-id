import { ChangeDetectionStrategy, Component } from '@angular/core';
// import { NgxFaceLiveness } from 'ngx-face-id';
import { NgxFaceLiveness } from '../../../projects/ngx-face-id/src/lib/face-liveness/face-liveness';

@Component({
  selector: 'app-ngx-face-id',
  imports: [NgxFaceLiveness],
  template: ` <ngx-face-liveness (capturedImage)="capturedImage($event)" /> `,
  styleUrl: './ngx-face-id.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgxFaceId {
  capturedImage(image: Blob) {
    console.log('Image captured from NgxFaceId component:', image);
  }
}
