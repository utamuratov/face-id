import { Injectable, isDevMode, signal } from '@angular/core';
import * as faceapi from 'face-api.js';
import { defer, Observable } from 'rxjs';

export type FaceVerifyStatus = 'PASS' | 'SHUBHALI' | 'FAIL';

export interface FaceVerifyResult {
  distance: number;
  similarity: number;
  status: FaceVerifyStatus;

  details?: {
    distances: number[];
    similarities: number[];
  };
}

@Injectable({ providedIn: 'root' })
export class FaceIdService {
  faceRecognationResult = signal<{
    similarity?: number;
    distance?: number;
    isChecking: boolean;
  } | null>(null);

  async loadModels() {
    const MODEL_URL = '/models';

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    console.log('Face API modellari yuklandi');
  }

  async getDescriptor(img: HTMLImageElement) {
    const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

    if (!detection) {
      throw new Error('Yuz topilmadi');
    }

    return detection.descriptor;
  }

  async compareFaces(oldImg: HTMLImageElement, newImg: HTMLImageElement) {
    const descriptor1 = await this.getDescriptor(oldImg);
    const descriptor2 = await this.getDescriptor(newImg);

    const distance = faceapi.euclideanDistance(descriptor1, descriptor2);

    return distance;
  }

  distanceToSimilarity(distance: number): number {
    const maxDistance = 0.6; // amaliy tajribada yaxshi
    const similarity = Math.max(0, 1 - distance / maxDistance) * 100;
    return Math.round(similarity);
  }

  verify$(first: HTMLImageElement, second: HTMLImageElement): Observable<FaceVerifyResult> {
    return defer(async () => {
      const distance = await this.compareFaces(first, second);
      const similarity = this.distanceToSimilarity(distance);

      let status: FaceVerifyStatus;

      if (distance < 0.5) status = 'PASS';
      else if (distance < 0.6) status = 'SHUBHALI';
      else status = 'FAIL';

      return { distance, similarity, status };
    });
  }

  // ---------- ADVANCED USAGE ----------
  async getReferenceDescriptor(img: HTMLImageElement) {
    return this.getDescriptor(img);
  }

  async compareMultiple(reference: Float32Array, liveDescriptors: Float32Array[]) {
    const distances = liveDescriptors.map((d) => faceapi.euclideanDistance(reference, d));

    return distances;
  }

  evaluate(distances: number[]): FaceVerifyResult {
    const similarities = distances.map((d) => this.distanceToSimilarity(d));

    // 0.55 dan kichkina bolsa oradagi rasmlarda notogri tushib qolsa 0.56 ham qaytyapti. Shunga Pass lar sonini kamaytirish kerka yoki shu turgani maqul
    const passCount = distances.filter((d) => d < 0.55).length;
    const minDistance = Math.min(...distances);
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

    let status: FaceVerifyStatus;

    console.log('PASS COUNT:', passCount);
    console.log('AVG DISTANCE:', avgDistance);

    // if (passCount >= 3 && avgDistance < 0.55) {
    // if (passCount === distances.length && avgDistance < 0.55) {
    // if (passCount === distances.length && avgDistance < 0.52) {
    if (passCount === distances.length && avgDistance < 0.51) {
      status = 'PASS';
    } else if (passCount >= 1) {
      status = 'SHUBHALI';
    } else {
      status = 'FAIL';
    }

    return {
      distance: minDistance,
      similarity: this.distanceToSimilarity(avgDistance),
      status,
      details: { distances, similarities },
    };
  }

  verifyMultiple$(
    referenceImg: HTMLImageElement,
    liveImgs: HTMLImageElement[],
  ): Observable<FaceVerifyResult> {
    return defer(async () => {
      const referenceDesc = await this.getDescriptor(referenceImg);

      const liveDescs = [];
      for (const img of liveImgs) {
        liveDescs.push(await this.getDescriptor(img));
      }

      const distances = await this.compareMultiple(referenceDesc, liveDescs);

      return this.evaluate(distances);
    });
  }
}
