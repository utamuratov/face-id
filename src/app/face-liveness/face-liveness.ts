import { Component, ElementRef, ViewChild, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LivenessService } from './liveness.service';

@Component({
  selector: 'app-face-liveness',
  template: `
    <div class="m-auto max-w-160 p-6">
      <video
        #video
        autoplay
        muted
        playsinline
        class="rounded-xl border-2 border-gray-300 aspect-4/3 w-160"
      ></video>

      <p class="mt-2 font-semibold">
        {{ stepText() }}
      </p>

      <button (click)="start()" class="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg">
        Boshlash
      </button>
    </div>
  `,
})
export class FaceLiveness implements OnInit {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  intervalId: any;

  constructor(
    private liveness: LivenessService,
    private http: HttpClient,
  ) {}

  async ngOnInit() {
    await this.liveness.loadModels();
  }

  stepText = computed(() => {
    switch (this.liveness.currentStep()) {
      case 'BLINK':
        return '👁 Ko‘zingizni yumib oching(kamida 2 marta)';
      case 'MOUTH':
        return '🙂 Og‘zingizni ochib yuming (kamida yarim ochish kerak)';
      case 'HEAD':
        return '↔️ Boshni chapga yoki o‘ngga burang';
      default:
        return '✅ Tayyor';
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
    const fd = new FormData();
    fd.append('file', blob, 'face.jpg');
    this.http.post('/api/face/verify', fd).subscribe();
  }
}
