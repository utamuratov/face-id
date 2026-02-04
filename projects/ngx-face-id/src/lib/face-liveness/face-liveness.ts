import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  computed,
  output,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { LivenessService } from './liveness.service';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'ngx-face-liveness',
  template: `
    <div class="camera-wrapper" [hidden]="loadingResourses()">
      @if (capturesImageSrc()) {
        <img [src]="capturesImageSrc()" alt="Captured Image" class="captured-image" />
      }
      <video #video autoplay muted playsinline class="camera-video"></video>

      <!-- Overlay -->
      <div class="overlay">
        <div class="oval-mask" [style.borderColor]="isNotValidOval() ? '#fb2c36' : '#65a0f8'"></div>
        <p class="hint">{{ stepText() }}</p>
      </div>
    </div>
    @if (loadingResourses()) {
      <p class="loading-text">{{ loadingMessage() }}</p>
    }
  `,
  styleUrls: ['./face-liveness.scss'],
})
export class NgxFaceLiveness implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  loadingResourses = signal(true);
  loadingMessage = signal('Kamera yuklanmoqda...');

  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  intervalId: any;

  capturedImage = output<Blob>();
  capturesImageSrc = signal<string | null>(null);

  constructor(private liveness: LivenessService) {}

  async ngOnInit() {
    if (!this.isBrowser) return;

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
      return '❌ Yuz aniqlanmadi, kameraga qarang';
    }
    if (currentFaceStatus === 'OUTSIDE_OVAL') {
      return '📐 Yuzingizni oval ichiga joylashtiring';
    }
    if (currentFaceStatus === 'COME_CLOSE') {
      return '🔍 Kameraga yaqinroq turing';
    }
    if (currentFaceStatus === 'VERY_CLOSE') {
      return '📷 Juda yaqin, kamerani orqaroq oling';
    }

    switch (this.currentStep()) {
      case 'BLINK':
        return '👁 Ko‘zingizni yumib oching(2 marta)';
      case 'MOUTH':
        return '🙂 Og‘zingizni ochib yuming';
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
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      if (!videoDevices.length) {
        this.loadingMessage.set('Kamera qurilmasi topilmadi!');
        throw new Error('No video devices found');
      }

      // USB yoki default camera tanlash
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: videoDevices[0].deviceId,
        }, // birinchi topilgan kamera
      });

      this.videoRef.nativeElement.srcObject = stream;
      this.loadingResourses.set(false);
    } catch (err) {
      console.error('Cannot access camera:', err);
    }

    // const stream = await navigator.mediaDevices.getUserMedia({
    //   video: { facingMode: 'user', aspectRatio: 3 / 4, width: { min: 480 }, height: { min: 640 } },
    // });
    // this.videoRef.nativeElement.srcObject = stream;
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
    this.capturesImageSrc.set(URL.createObjectURL(blob));
    console.log(blob);

    // const fd = new FormData();
    // fd.append('file', blob, 'face.jpg');
    // this.http.post('/api/face/verify', fd).subscribe();
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;

    this.cleanup();
  }

  private cleanup() {
    // 1️⃣ Interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // 2️⃣ Kamera
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.pause();

      const stream = video.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      video.srcObject = null;
    }

    // 3️⃣ Service state
    this.liveness.reset();
  }
}
