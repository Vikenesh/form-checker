import { useState, useEffect, useCallback, useRef } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';

export const usePoseTracker = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);

  useEffect(() => {
    let isMounted = true;
    const initModel = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numPoses: 1
        });
        if (isMounted) {
          landmarkerRef.current = landmarker;
          setIsLoaded(true);
        }
      } catch (e) {
        console.error("Failed to load MediaPipe model", e);
      }
    };
    initModel();
    return () => {
      isMounted = false;
      if (landmarkerRef.current) {
         landmarkerRef.current.close();
      }
    };
  }, []);

  const detectFrame = useCallback((videoElement: HTMLVideoElement, timestamp: number): PoseLandmarkerResult | null => {
    if (!landmarkerRef.current) return null;
    return landmarkerRef.current.detectForVideo(videoElement, timestamp);
  }, []);

  return { isLoaded, detectFrame };
};
