# NgxFaceId

[DEMO](https://utamuratov.uz/face-id/)

## O'rantish

`npm install @utamuratov/ngx-face-id`

## Ushbu ishni qiling:

“Models papkasini angular.json → assets ga qo‘shing”. Bu sozlama kutubxona muhtoj bo'lgan modellarni sizning loyihangizga qo'shib qo'yadi!

```json
{
  "glob": "**/*",
  "input": "node_modules/@utamuratov/ngx-face-id/models/",
  "output": "/models/"
}
```

## Ishlatish

- Ushbu `NgxFaceLiveness` ni kerakli joyda import qiling va uni qayerda ishalatayotgan bo'lsangiz o'sha joyda `FaceIdService` ni inject qiling va loadModels methodini chaqiring:

```ts
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
```
