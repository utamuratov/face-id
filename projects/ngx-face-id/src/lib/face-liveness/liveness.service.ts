import { computed, Injectable, signal } from '@angular/core';
import * as faceapi from 'face-api.js';

type Step =
  | 'START'
  | 'CHALLENGE' // Tasodifiy yo'nalishga qarash
  | 'BLINK'
  | 'HEAD'
  | 'HOLD'
  | 'DONE'
  | 'SPOOF_DETECTED'
  | 'MY_ID_FAIL';

type FaceInside = 'FACE_UNSTABLE' | 'OUTSIDE_OVAL' | 'COME_CLOSE' | 'VERY_CLOSE' | 'VALID';

type ChallengeDirection = 'LEFT' | 'RIGHT';
// 'UP' |
// | 'DOWN';

@Injectable({ providedIn: 'root' })
export class LivenessService {
  private step = signal<Step>('START');
  private faceInsideStatus = signal<FaceInside>('OUTSIDE_OVAL');
  currentStep = computed(() => this.step());
  currentFaceInsideStatus = computed(() => this.faceInsideStatus());

  // Challenge yo'nalishi
  private challengeDirection = signal<ChallengeDirection | null>(null);
  currentChallenge = computed(() => this.challengeDirection());

  // Counters
  private missCount = 0;
  private prevBlinkAvg = 0;
  private blinkCount = 0;
  private prevNoseX?: number;
  private holdStart?: number;
  private challengeStartTime?: number;

  // Anti-spoofing
  private previousFrames: ImageData[] = [];
  private readonly FRAME_BUFFER_SIZE = 5;
  private textureVariances: number[] = [];
  private motionVariances: number[] = [];

  private readonly MAX_ATTEMPTS_FACE_UNSTABLE = isMobile() ? 6 : 3;
  private readonly CHALLENGE_TIMEOUT = 5000; // 5 soniya

  reset() {
    this.faceInsideStatus.set('OUTSIDE_OVAL');
    this.step.set('START');
    this.blinkCount = 0;
    this.prevBlinkAvg = 0;
    this.prevNoseX = undefined;
    this.holdStart = undefined;
    this.missCount = 0;
    this.challengeDirection.set(null);
    this.challengeStartTime = undefined;
    this.previousFrames = [];
    this.textureVariances = [];
    this.motionVariances = [];
  }

  changeStep(step: Step) {
    this.step.set(step);
  }

  /**
   * Challenge yo'nalishini generatsiya qilish
   */
  private generateChallenge() {
    const challenges: ChallengeDirection[] = [
      'LEFT',
      'RIGHT',
      // 'UP',
      // 'DOWN'
    ];
    const randomIndex = Math.floor(Math.random() * challenges.length);
    this.challengeDirection.set(challenges[randomIndex]);
    this.challengeStartTime = Date.now();
    // console.log('🎯 Challenge:', challenges[randomIndex]);
  }

  /**
   * Challenge javobini tekshirish
   */
  private checkChallengeResponse(lm: faceapi.FaceLandmarks68): boolean {
    if (!this.challengeDirection() || !this.challengeStartTime) {
      return false;
    }

    // Timeout
    if (Date.now() - this.challengeStartTime > this.CHALLENGE_TIMEOUT) {
      // console.warn('⏰ Challenge timeout');
      return false;
    }

    const nose = lm.getNose()[3];
    const leftEye = lm.getLeftEye()[0];
    const rightEye = lm.getRightEye()[3];

    const centerX = (leftEye.x + rightEye.x) / 2;
    // const centerY = (leftEye.y + rightEye.y) / 2;

    const threshold = isMobile() ? 15 : 20;

    switch (this.challengeDirection()) {
      case 'RIGHT':
        return nose.x < centerX - threshold;
      case 'LEFT':
        return nose.x > centerX + threshold;
      // case 'UP':
      //     return nose.y < centerY - threshold;
      // case 'DOWN':
      //     return nose.y > centerY + threshold;
      default:
        return false;
    }
  }

  // ---------- OVAL VA YUZ TEKSHIRUVI ----------

  private isFaceInsideOval(box: faceapi.Box, video: HTMLVideoElement): boolean {
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const cx = vw / 2;
    const cy = vh / 2;

    const ry = vh * 0.45;
    const rx = ry * (5 / 6);

    const mirrorX = (x: number) => vw - x;

    const points = [
      { x: mirrorX(box.x), y: box.y + box.height / 2 },
      { x: mirrorX(box.x + box.width), y: box.y + box.height / 2 },
      { x: mirrorX(box.x + box.width / 2), y: box.y },
      { x: mirrorX(box.x + box.width / 2), y: box.y + box.height },
    ];

    const inside = points.every(
      (p) => Math.pow((p.x - cx) / rx, 2) + Math.pow((p.y - cy) / ry, 2) <= 1.2,
    );

    if (!inside) {
      this.updateFacInsideWithDelay('OUTSIDE_OVAL');
      if (this.step() !== 'START') {
        this.updateStepWithDelay('START');
        this.challengeDirection.set(null);
      }
      return false;
    }

    const faceArea = box.width * box.height;
    const ovalArea = Math.PI * rx * ry;
    const fillRatio = faceArea / ovalArea;

    if (fillRatio < 0.42) {
      this.updateFacInsideWithDelay('COME_CLOSE');
      // if (this.step() !== 'START') {
      //     this.step.set('START');
      // }
      return false;
    }

    if (fillRatio > 1.1) {
      this.updateFacInsideWithDelay('VERY_CLOSE');
      // if (this.step() !== 'START') {
      //     this.step.set('START');
      // }
      return false;
    }

    this.faceInsideStatus.set('VALID');
    return true;
  }

  // ---------- BLINK, HEAD, MOUTH ----------

  private dist(a: any, b: any) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private eyeEAR(eye: faceapi.Point[]) {
    return (
      (this.dist(eye[1], eye[5]) + this.dist(eye[2], eye[4])) / (2 * this.dist(eye[0], eye[3]))
    );
  }

  private isBlink(lm: faceapi.FaceLandmarks68) {
    const left = this.eyeEAR(lm.getLeftEye());
    const right = this.eyeEAR(lm.getRightEye());
    const avg = (left + right) / 2;

    if (this.prevBlinkAvg === 0 || Math.abs(avg - this.prevBlinkAvg) < 0.01) {
      this.prevBlinkAvg = avg;
      return false;
    }

    this.prevBlinkAvg = avg;
    this.blinkCount++;
    return this.blinkCount > 2;
  }

  private isHeadMoved(lm: faceapi.FaceLandmarks68) {
    const nose = lm.getNose()[3];
    if (!this.prevNoseX) {
      this.prevNoseX = nose.x;
      return false;
    }
    const moved = Math.abs(nose.x - this.prevNoseX) > 40;
    this.prevNoseX = nose.x;
    return moved;
  }

  // ---------- MAIN PROCESS ----------

  async process(
    video: HTMLVideoElement,
  ): Promise<{ done: boolean; capture: boolean; reset?: boolean }> {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    const tinyOptions = new faceapi.TinyFaceDetectorOptions(
      isMobile()
        ? { inputSize: 224, scoreThreshold: 0.4 }
        : { inputSize: 416, scoreThreshold: 0.4 },
    );

    const result = await faceapi.detectSingleFace(canvas, tinyOptions).withFaceLandmarks();

    // Yuz topilmasa
    if (!result) {
      this.missCount++;

      if (this.missCount > this.MAX_ATTEMPTS_FACE_UNSTABLE) {
        this.updateFacInsideWithDelay('FACE_UNSTABLE');
        if (this.step() !== 'START') {
          this.updateStepWithDelay('START');
          this.challengeDirection.set(null);
        }
      }

      return { done: false, capture: false };
    }

    this.missCount = 0;

    // ✅ Oval ichida ekanligini tekshirish
    const insideOval = this.isFaceInsideOval(result.detection.box, video);
    if (!insideOval) {
      // if (this.step() === 'HOLD') {
      //     this.holdStart = Date.now();
      // }
      return { done: false, capture: false };
    }

    const lm = result.landmarks;

    // ✅ Step bo'yicha jarayon
    if (this.step() === 'START') {
      this.updateStepWithDelay('CHALLENGE');
      this.generateChallenge();
      return { done: false, capture: true, reset: true };
    } else if (this.step() === 'CHALLENGE') {
      if (this.checkChallengeResponse(lm)) {
        // console.log('✅ Challenge passed');
        this.updateStepWithDelay('BLINK');
        this.challengeDirection.set(null);
        return { done: false, capture: true };
      }
      // Challenge kutilmoqda
      return { done: false, capture: false };
    } else if (this.step() === 'BLINK' && this.isBlink(lm)) {
      this.blinkCount = 0;
      this.updateStepWithDelay('HEAD');
      return { done: false, capture: true };
    } else if (this.step() === 'HEAD' && this.isHeadMoved(lm)) {
      this.updateStepWithDelay('HOLD');
      this.holdStart = Date.now();
      return { done: false, capture: true };
    } else if (this.step() === 'HOLD') {
      if (!this.holdStart) {
        this.holdStart = Date.now();
      }
      if (Date.now() - this.holdStart >= 2000) {
        this.step.set('DONE');
        return { done: true, capture: true };
      }
    }

    return { done: false, capture: false };
  }

  updateStepWithDelay(step: Step) {
    setTimeout(() => {
      this.step.set(step);
    }, 200);
  }

  updateFacInsideWithDelay(step: FaceInside) {
    setTimeout(() => {
      this.faceInsideStatus.set(step);
    }, 200);
  }
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
