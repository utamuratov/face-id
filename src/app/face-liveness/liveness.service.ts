import { computed, Injectable, signal } from '@angular/core';
import * as faceapi from 'face-api.js';

type Step = 'BLINK' | 'MOUTH' | 'HEAD' | 'DONE';

@Injectable({ providedIn: 'root' })
export class LivenessService {
  private step = signal<Step>('BLINK');
  currentStep = computed(() => this.step());

  private prevBlinkAvg = 0;
  private blinkCount = 0;
  private prevNoseX?: number;

  async loadModels() {
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
  }

  reset() {
    this.step.set('BLINK');
    this.blinkCount = 0;
    this.prevBlinkAvg = 0;
    this.prevNoseX = undefined;
  }

  // ---------- HELPERS ----------

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

    if (!result) return false;

    const lm = result.landmarks;

    if (this.step() === 'BLINK' && this.isBlink(lm)) {
      this.step.set('MOUTH');
    } else if (this.step() === 'MOUTH' && this.isMouthOpen(lm)) {
      this.step.set('HEAD');
    } else if (this.step() === 'HEAD' && this.isHeadMoved(lm)) {
      this.step.set('DONE');
      return true;
    }

    return false;
  }
}
