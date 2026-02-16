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
  OnDestroy,
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
        <div class="oval-mask" [style.borderColor]="ovalColor()"></div>
        @let stepTxt = stepText();
        @if (stepTxt) {
          <p class="hint">{{ stepTxt }}</p>
        }

        <!-- Challenge yo'nalish ko'rsatkichi -->
        @if (currentChallenge()) {
          <div class="challenge-indicator">
            <div class="arrow" [class]="'arrow-' + currentChallenge()?.toLowerCase()">
              {{ getChallengeArrow() }}
            </div>
          </div>
        }
      </div>
    </div>
    @if (loadingResourses()) {
      <div class="loading-text-container">
        <p class="loading-text">{{ loadingMessage() }}</p>
      </div>
    }
  `,
  styleUrls: ['./face-liveness.scss'],
})
export class NgxFaceLiveness implements OnInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  loadingResourses = signal(true);
  loadingMessage = signal('Kamera yuklanmoqda...');
  private liveness = inject(LivenessService);

  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  intervalId: any;

  private attemptsImages: Blob[] = [];
  capturedImages = output<Blob[]>();
  capturesImageSrc = signal<string | null>(null);

  async ngOnInit() {
    if (!this.isBrowser) return;
    await this.start();
  }

  currentStep = computed(() => this.liveness.currentStep());
  currentFaceInsideStatus = computed(() => this.liveness.currentFaceInsideStatus());
  currentChallenge = computed(() => this.liveness.currentChallenge());

  ovalColor = computed(() => {
    const status = this.currentFaceInsideStatus();
    if (status === 'FACE_UNSTABLE') return '#ff0000'; // qizil
    if (status === 'OUTSIDE_OVAL') return '#ffa500'; // to'q sariq
    if (status === 'VERY_CLOSE') return '#ffff00'; // to'q sariq
    if (status === 'COME_CLOSE') return '#ffff00'; // sariq
    return '#65a0f8'; // default ko'k (sizning rangingiz)
  });

  stepText = computed(() => {
    const currentFaceStatus = this.currentFaceInsideStatus();

    if (currentFaceStatus === 'OUTSIDE_OVAL') {
      return '🔍 Yuzingizni oval ichiga joylashtiring';
    }
    if (currentFaceStatus === 'COME_CLOSE') {
      return '🔍 Kameraga yaqinroq turing';
    }
    if (currentFaceStatus === 'VERY_CLOSE') {
      return '📷 Kamera juda yaqin';
    }
    if (currentFaceStatus === 'FACE_UNSTABLE') {
      return '';
    }

    switch (this.currentStep()) {
      case 'CHALLENGE':
        return this.getChallengeText();
      case 'BLINK':
        return "👁 Ko'zingizni yumib oching (bir necha marta)";
      case 'HEAD':
        return '↔️ Boshni biroz burang';
      case 'HOLD':
        return "✋ Kameraga qarang va to'g'ri turing (2 soniya)";
      case 'DONE':
        return '✅ Tekshirilmoqda...';
      case 'SPOOF_DETECTED':
        return '🚫 Xavfsizlik tekshiruvi muvaffaqiyatsiz!';
      case 'MY_ID_FAIL':
        return "❌ O'xshashlik darajasi past!";
      default:
        return '';
    }
  });

  getChallengeText(): string {
    const direction = this.currentChallenge();
    if (!direction) return '';

    switch (direction) {
      case 'LEFT':
        return '⬅️ Yuzingizni chapga buring';
      case 'RIGHT':
        return "➡️ Yuzingizni o'ngga buring";
      // case 'UP':
      //     return '⬆️ Yuqoriga qarang';
      // case 'DOWN':
      //     return '⬇️ Pastga qarang';
      default:
        return '';
    }
  }

  getChallengeArrow(): string {
    const direction = this.currentChallenge();
    if (!direction) return '';

    switch (direction) {
      case 'LEFT':
        return '←';
      case 'RIGHT':
        return '→';
      // case 'UP':
      //     return '↑';
      // case 'DOWN':
      //     return '↓';
      default:
        return '';
    }
  }

  async start() {
    this.liveness.reset();
    await this.openCamera();

    this.intervalId = setInterval(async () => {
      const done = await this.liveness.process(this.videoRef.nativeElement);

      if (done.capture) {
        const blob = await this.capture();
        if (done.reset) {
          this.attemptsImages = [];
        }
        this.attemptsImages.push(blob);

        if (done.done) {
          clearInterval(this.intervalId);
          this.sendToBackend(blob);
        }
      }
    }, 400);
  }

  async openCamera() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      if (!videoDevices.length) {
        this.loadingMessage.set('Kamera qurilmasi topilmadi!');
        throw new Error('No video devices found');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: videoDevices[0].deviceId,
        },
      });

      this.videoRef.nativeElement.srcObject = stream;
      this.loadingResourses.set(false);
    } catch (err) {
      console.error('Cannot access camera:', err);
      this.loadingMessage.set('Kameraga kirish rad etildi!');
    }
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
    this.capturedImages.emit(this.attemptsImages);
    this.capturesImageSrc.set(URL.createObjectURL(blob));
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;
    this.cleanup();
  }

  private cleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const video = this.videoRef?.nativeElement;
    if (video) {
      video.pause();

      const stream = video.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      video.srcObject = null;
    }

    this.liveness.reset();
  }
}
