import { Injectable, isDevMode, signal } from '@angular/core';
import * as faceapi from 'face-api.js';
import { defer, Observable } from 'rxjs';

export type FaceVerifyStatus = 'PASS' | 'SHUBHALI' | 'FAIL';

export interface FaceVerifyResult {
    distance: number;
    similarity: number;
    status: FaceVerifyStatus;
}

@Injectable()
export class FaceIdService {
    faceRecognationResult = signal<{
        similarity?: number;
        distance?: number;
        isChecking: boolean;
    } | null>(null);

    constructor() {
        this.loadModels();
    }

    async loadModels() {
        const MODEL_URL = isDevMode() ? '/models' : '/admin/models';

        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        console.log('Face API modellari yuklandi');
    }

    async getDescriptor(img: HTMLImageElement) {
        const detection = await faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();

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

    verify$(
        first: HTMLImageElement,
        second: HTMLImageElement
    ): Observable<FaceVerifyResult> {
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

    // async verify(
    //     firstPhotoOfPerson: HTMLImageElement,
    //     secondPhotoOfPerson: HTMLImageElement
    // ) {
    //     try {
    //         const distance = await this.compareFaces(
    //             firstPhotoOfPerson,
    //             secondPhotoOfPerson
    //         );

    //         const similarity = this.distanceToSimilarity(distance);

    //         console.log('Distance:', distance);
    //         console.log('Similarity:', similarity + '%');

    //         // if (similarity >= 75) {
    //         if (distance < 0.5) {
    //             console.log('✅ Bu o‘sha odam');
    //         } else if (distance < 0.6) {
    //             console.log('Shubhali');
    //         } else {
    //             console.log('❌ Mos kelmadi');
    //         }
    //         this.faceRecognationResult.set({
    //             distance,
    //             similarity,
    //             isChecking: false
    //         });
    //     } catch (err) {
    //         console.error(err);
    //     }
    // }
}
