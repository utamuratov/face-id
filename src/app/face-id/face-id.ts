import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { FaceIdService, FaceVerifyResult } from './face-id.service';
import { finalize } from 'rxjs';

@Component({
  selector: 'bam-face-id',
  imports: [],
  template: `
    <div class="m-auto max-w-200 p-6">
      <div class="mb-4">
        <h2 class="text-2xl font-bold">FACE ID recognation</h2>
        <p class="text-gray-500">
          Tekshirish uchun rasmlar ustiga bosib boshqa insonlar rasmini yuklang!
        </p>
      </div>
      <div class="border border-gray-200 rounded-2xl p-4">
        <div class="grid grid-cols-2 gap-4">
          <input
            #firstImage
            type="file"
            hidden
            (change)="handleUploadedImage($event, oldImg)"
            accept="image/*"
          />
          <button
            class="aspect-square overflow-hidden rounded-lg cursor-pointer"
            (click)="firstImage.click()"
          >
            <img #oldImg [src]="faces[1]" alt="" class="w-full h-full object-cover" />
          </button>
          <input
            #secondImage
            type="file"
            hidden
            (change)="handleUploadedImage($event, newImg)"
            accept="image/*"
          />
          <button
            class="aspect-square overflow-hidden rounded-lg cursor-pointer"
            (click)="secondImage.click()"
          >
            <img #newImg [src]="faces[0]" alt="" class="w-full h-full object-cover" />
          </button>
        </div>
        <button
          class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 w-full cursor-pointer"
          (click)="handleCheckButtonClick()"
          [disabled]="faceRecognationLoading()"
        >
          Check Faces
        </button>
      </div>

      @let faceRecognation = faceRecognationResult();
      @if (faceRecognation) {
        <div class="border border-gray-200 rounded-xl p-4 mt-4">
          @if (faceRecognationLoading()) {
            Tekshirilmoqda...
          } @else if (faceRecognation.distance) {
            <p class="text-xl font-semibold">
              @if (faceRecognation.distance < 0.5) {
                ✅ Bu o‘sha odam
              } @else if (faceRecognation.distance < 0.65) {
                ❗️ Shubhali
              } @else {
                ❌ Boshqa odam
              }
            </p>
            <p>Distance: {{ faceRecognation.distance }}</p>
            <p>Similarity: {{ faceRecognation.similarity }}%</p>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './face-id.css',
  providers: [FaceIdService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaceId {
  @ViewChild('oldImg')
  oldImg!: ElementRef;

  @ViewChild('newImg')
  newImg!: ElementRef;

  private $faceId = inject(FaceIdService);

  faceRecognationLoading = signal(false);
  faceRecognationResult = signal<FaceVerifyResult | null>(null);

  faces = [
    './images/faces/abama-1.jpg',
    './images/faces/abama-2.jpg',
    './images/faces/smith-1.png',
    './images/faces/smith-2.jpg',
    './images/faces/decabrio-1.jpg',
    './images/faces/decabrio-2.jpg',
  ];

  handleCheckButtonClick() {
    this.faceRecognationLoading.set(true);
    this.$faceId
      .verify$(this.oldImg.nativeElement, this.newImg.nativeElement)
      .pipe(finalize(() => this.faceRecognationLoading.set(false)))
      .subscribe((faceRecognationResult) => {
        this.faceRecognationResult.set(faceRecognationResult);
      });
  }

  protected handleUploadedImage(e: Event, imageElement: HTMLImageElement) {
    const file = (e.target as HTMLInputElement)?.files?.item(0);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        imageElement.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }
}
