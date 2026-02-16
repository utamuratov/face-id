import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
// import { NgxFaceLiveness } from 'ngx-face-id';
import { NgxFaceLiveness } from '../../../projects/ngx-face-id/src/lib/face-liveness/face-liveness';
import { FaceIdService } from '../../../projects/ngx-face-id/src/lib/face-liveness/face-id.service';

@Component({
  selector: 'app-ngx-face-id',
  imports: [NgxFaceLiveness],
  template: ` <ngx-face-liveness (capturedImages)="capturedImages($event)" /> `,
  styleUrl: './ngx-face-id.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgxFaceId {
  private $faceId = inject(FaceIdService);
  constructor() {
    this.$faceId.loadModels();
  }

  capturedImages(blobs: Blob[]) {
    console.log(blobs);
  }
}
