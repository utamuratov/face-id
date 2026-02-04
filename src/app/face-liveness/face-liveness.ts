import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  computed,
  output,
  OnDestroy,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LivenessService } from './liveness.service';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-face-liveness',
  imports: [NgClass],
  template: `
    <div class="camera-wrapper">
      <video #video autoplay muted playsinline class="camera-video"></video>

      <!-- Overlay -->
      <div class="overlay">
        <div class="oval-mask" [ngClass]="{ 'border-red-500!': isNotValidOval() }"></div>
        <p class="hint">{{ stepText() }}</p>
      </div>
    </div>
  `,
  styleUrls: ['./face-liveness.scss'],
})
export class FaceLiveness implements OnInit, OnDestroy {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  intervalId: any;

  capturedImage = output<Blob>();

  constructor(
    private liveness: LivenessService,
    private http: HttpClient,
  ) {}

  async ngOnInit() {
    await this.liveness.loadModels();
    await this.start();
  }

  currentStep = computed(() => this.liveness.currentStep());
  currentFaceInsideStatus = computed(() => this.liveness.currentFaceInsideStatus());
  isNotValidOval = computed(
    () =>
      this.currentFaceInsideStatus() === 'OUTSIDE_OVAL' ||
      this.currentFaceInsideStatus() === 'NO_FACE',
  );
  stepText = computed(() => {
    const currentFaceStatus = this.currentFaceInsideStatus();

    if (currentFaceStatus === 'NO_FACE') {
      return '❌ Yuz aniqlanmadi, iltimos, kameraga qarang';
    }
    if (currentFaceStatus === 'OUTSIDE_OVAL') {
      return '📐 Iltimos, yuzingizni oval ichiga joylashtiring';
    }
    if (currentFaceStatus === 'COME_CLOSE') {
      return '🔍 Iltimos, kameraga yaqinroq turing';
    }
    if (currentFaceStatus === 'VERY_CLOSE') {
      return '📷 Juda yaqin, kamerani orqaroq oling';
    }

    switch (this.currentStep()) {
      case 'BLINK':
        return '👁 Ko‘zingizni yumib oching(kamida 2 marta)';
      case 'MOUTH':
        return '🙂 Og‘zingizni ochib yuming (kamida yarim ochish kerak)';
      case 'HEAD':
        return '↔️ Boshni chapga yoki o‘ngga burang';
      case 'HOLD':
        return '✋ Barqaror turing (2 soniya)';
      default:
        return '✅ Tayyor!';
    }
  });

  async start() {
    this.liveness.reset();
    await this.openCamera();

    this.intervalId = setInterval(async () => {
      const done = await this.liveness.process(this.videoRef.nativeElement);

      if (done) {
        clearInterval(this.intervalId);
        const blob = await this.capture();
        this.sendToBackend(blob);
      }
    }, 300);
  }

  async openCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
    });
    this.videoRef.nativeElement.srcObject = stream;
  }

  async capture(): Promise<Blob> {
    const video = this.videoRef.nativeElement;
    const canvas = document.createElement('canvas');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    canvas.getContext('2d')!.drawImage(video, 0, 0);

    return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.9));
  }

  sendToBackend(blob: Blob) {
    this.capturedImage.emit(blob);
    console.log(blob);

    // const fd = new FormData();
    // fd.append('file', blob, 'face.jpg');
    // this.http.post('/api/face/verify', fd).subscribe();
  }

  ngOnDestroy(): void {}
}
