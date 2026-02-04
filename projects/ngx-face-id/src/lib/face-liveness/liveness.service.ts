import { computed, Injectable, signal } from '@angular/core';
import * as faceapi from 'face-api.js';

type Step =
  // | 'NO_FACE'
  // | 'OUTSIDE_OVAL'
  // | 'COME_CLOSE'
  // | 'VERY_CLOSE'
  'BLINK' | 'MOUTH' | 'HEAD' | 'HOLD' | 'DONE';

type FaceInside = 'NO_FACE' | 'OUTSIDE_OVAL' | 'COME_CLOSE' | 'VERY_CLOSE' | 'VALID';

@Injectable({ providedIn: 'root' })
export class LivenessService {
  private step = signal<Step>('BLINK');
  private faceInsideStatus = signal<FaceInside>('OUTSIDE_OVAL');
  currentStep = computed(() => this.step());
  currentFaceInsideStatus = computed(() => this.faceInsideStatus());

  private prevBlinkAvg = 0;
  private blinkCount = 0;
  private prevNoseX?: number;
  private holdStart?: number;

  async loadModels() {
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
  }

  reset() {
    this.faceInsideStatus.set('OUTSIDE_OVAL');
    this.step.set('BLINK');
    this.blinkCount = 0;
    this.prevBlinkAvg = 0;
    this.prevNoseX = undefined;
    this.holdStart = undefined;
  }

  // ---------- HELPERS ----------

  private isFaceInsideOval(box: faceapi.Box, video: HTMLVideoElement): boolean {
    const cx = video.videoWidth / 2;
    const cy = video.videoHeight / 2;

    // ✅ CSS: width: 50% → radius = 25%
    const rx = video.videoWidth * 0.25;
    const ry = rx * (6 / 5); // aspect-ratio: 5/6

    // 1️⃣ Yuzning 4 ta chekkasi oval ichida bo'lishi kerak
    const points = [
      { x: box.x, y: box.y + box.height / 2 }, // chap
      { x: box.x + box.width, y: box.y + box.height / 2 }, // o'ng
      { x: box.x + box.width / 2, y: box.y }, // tepa
      { x: box.x + box.width / 2, y: box.y + box.height }, // past
    ];

    const inside = points.every((p) => {
      const v = Math.pow(p.x - cx, 2) / Math.pow(rx, 2) + Math.pow(p.y - cy, 2) / Math.pow(ry, 2);
      return v <= 1;
    });

    if (!inside) {
      this.faceInsideStatus.set('OUTSIDE_OVAL');
      return false;
    }

    // 2️⃣ Yuz ovalni yaxshi to'ldirishi kerak (70-90%)
    const faceArea = box.width * box.height;
    const ovalArea = Math.PI * rx * ry;
    const fillRatio = faceArea / ovalArea;

    // Juda uzoq
    if (fillRatio < 0.4) {
      this.faceInsideStatus.set('COME_CLOSE');
      return false;
    }

    // Juda yaqin
    if (fillRatio > 0.59) {
      this.faceInsideStatus.set('VERY_CLOSE');
      return false;
    }

    this.faceInsideStatus.set('VALID');
    return true;
  }

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

  private isMouthOpen(lm: faceapi.FaceLandmarks68) {
    const mouth = lm.getMouth();
    return this.dist(mouth[13], mouth[19]) / this.dist(mouth[0], mouth[6]) > 0.4;
  }

  private isHeadMoved(lm: faceapi.FaceLandmarks68) {
    const nose = lm.getNose()[3];
    if (!this.prevNoseX) {
      this.prevNoseX = nose.x;
      return false;
    }
    const moved = Math.abs(nose.x - this.prevNoseX) > 30;

    this.prevNoseX = nose.x;
    return moved;
  }

  // ---------- MAIN CHECK ----------

  async process(video: HTMLVideoElement): Promise<boolean> {
    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();

    if (!result) {
      this.faceInsideStatus.set('NO_FACE');
      return false;
    }

    // 👇 OVAL CHECK
    const insideOval = this.isFaceInsideOval(result.detection.box, video);

    if (!insideOval) {
      if (this.step() === 'HOLD') {
        this.holdStart = Date.now();
      }
      return false;
    }

    const lm = result.landmarks;

    if (this.step() === 'BLINK' && this.isBlink(lm)) {
      this.step.set('MOUTH');
    } else if (this.step() === 'MOUTH' && this.isMouthOpen(lm)) {
      this.step.set('HEAD');
    } else if (this.step() === 'HEAD' && this.isHeadMoved(lm)) {
      this.step.set('HOLD');
      this.holdStart = Date.now();
    } else if (this.step() === 'HOLD') {
      if (!this.holdStart) this.holdStart = Date.now();
      if (Date.now() - this.holdStart > 3000) {
        this.step.set('DONE');
        return true; // 📸 CAPTURE SIGNAL
      }
    }

    return false;
  }
}
