import { computed, Injectable, signal } from '@angular/core';
import * as faceapi from 'face-api.js';

type Step = 'START' | 'BLINK' | 'MOUTH' | 'HEAD' | 'HOLD' | 'DONE';

type FaceInside = 'NO_FACE' | 'OUTSIDE_OVAL' | 'COME_CLOSE' | 'VERY_CLOSE' | 'VALID';

@Injectable({ providedIn: 'root' })
export class LivenessService {
  private step = signal<Step>('START');
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
    this.step.set('START');
    this.blinkCount = 0;
    this.prevBlinkAvg = 0;
    this.prevNoseX = undefined;
    this.holdStart = undefined;
  }

  // ---------- HELPERS ----------

  private isFaceInsideOval(box: faceapi.Box, video: HTMLVideoElement): boolean {
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Oval markazi
    const cx = vw / 2;
    const cy = vh / 2;

    // Oval radius
    const ry = vh * 0.45; // height = 90%
    const rx = ry * (5 / 6); // aspect-ratio = 5/6

    // Mirror x for CSS scaleX(-1)
    const mirrorX = (x: number) => vw - x;

    // Face edge points
    const points = [
      { x: mirrorX(box.x), y: box.y + box.height / 2 }, // left
      { x: mirrorX(box.x + box.width), y: box.y + box.height / 2 }, // right
      { x: mirrorX(box.x + box.width / 2), y: box.y }, // top
      { x: mirrorX(box.x + box.width / 2), y: box.y + box.height }, // bottom
    ];

    const inside = points.every(
      (p) => Math.pow((p.x - cx) / rx, 2) + Math.pow((p.y - cy) / ry, 2) <= 1,
    );

    if (!inside) {
      this.faceInsideStatus.set('OUTSIDE_OVAL');
      return false;
    }

    // Fill ratio
    const faceArea = box.width * box.height;
    const ovalArea = Math.PI * rx * ry;
    const fillRatio = faceArea / ovalArea;

    if (fillRatio < 0.42) {
      this.faceInsideStatus.set('COME_CLOSE');
      return false;
    }

    if (fillRatio > 0.6) {
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
    const step = this.step();

    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();

    if (!result) {
      if (step === 'START') {
        this.faceInsideStatus.set('NO_FACE');
      }
      return false;
    }

    if (step === 'START') {
      // 👇 OVAL CHECK
      const insideOval = this.isFaceInsideOval(result.detection.box, video);

      if (!insideOval) {
        if (this.step() === 'HOLD') {
          this.holdStart = Date.now();
        }
        return false;
      }
    }

    const lm = result.landmarks;

    if (step === 'START') {
      this.step.set('BLINK');
    } else if (step === 'BLINK' && this.isBlink(lm)) {
      this.step.set('MOUTH');
    } else if (step === 'MOUTH' && this.isMouthOpen(lm)) {
      this.step.set('HEAD');
    } else if (step === 'HEAD' && this.isHeadMoved(lm)) {
      this.step.set('HOLD');
      this.holdStart = Date.now();
    } else if (step === 'HOLD') {
      if (!this.holdStart) this.holdStart = Date.now();
      if (Date.now() - this.holdStart > 3000) {
        this.step.set('DONE');
        return true; // 📸 CAPTURE SIGNAL
      }
    }

    return false;
  }
}
