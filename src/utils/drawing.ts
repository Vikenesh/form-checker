import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export const POSE_CONNECTIONS = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Right Arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Left Arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // Right Leg
  [24, 26], [26, 28], [28, 30], [28, 32], [32, 30],
  // Left Leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Face (minimal)
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10]
];

export const drawSkeleton = (
  ctx: CanvasRenderingContext2D, 
  landmarks: NormalizedLandmark[], 
  width: number, 
  height: number
) => {
  ctx.clearRect(0, 0, width, height);

  // Draw connections (bones)
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)'; // accent-primary matches index.css
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  POSE_CONNECTIONS.forEach(([startIdx, endIdx]) => {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];
    if (start.visibility && start.visibility > 0.6 && end.visibility && end.visibility > 0.6) {
      ctx.beginPath();
      ctx.moveTo(start.x * width, start.y * height);
      ctx.lineTo(end.x * width, end.y * height);
      ctx.stroke();
    }
  });

  // Draw joints
  ctx.fillStyle = '#10b981'; // success color matches index.css
  landmarks.forEach((landmark) => {
    if (landmark.visibility && landmark.visibility > 0.6) {
      ctx.beginPath();
      ctx.arc(landmark.x * width, landmark.y * height, 6, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
};
