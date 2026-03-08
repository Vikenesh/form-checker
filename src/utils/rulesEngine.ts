import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export const PoseState = {
  STANDING_START: 0,
  ARMS_CROSSED: 1,
  LEGS_CROSSED: 2,
  SITTING_DOWN: 3,
  KNEE_TOUCH: 4,
  DEEP_SQUAT: 5,
};

export const POSE_STATE_NAMES = {
  [PoseState.STANDING_START]: "Standing Start",
  [PoseState.ARMS_CROSSED]: "Arms Crossed",
  [PoseState.LEGS_CROSSED]: "Legs Crossed",
  [PoseState.SITTING_DOWN]: "Sitting Posture",
  [PoseState.KNEE_TOUCH]: "Knee Touching Floor",
  [PoseState.DEEP_SQUAT]: "Deep Squat",
};

export interface TrackingContext {
  currentState: number;
  reps: number;
  score: number;
  stateEnteredAtMs: number;
  message: string;
  debugInfo: Record<string, boolean>;
  recommendation?: string;
  repFeedback: string[][];
  currentRepFailures: Set<string>;
}

export const INITIAL_CONTEXT: TrackingContext = {
  currentState: PoseState.STANDING_START,
  reps: 0,
  score: 0,
  stateEnteredAtMs: 0,
  message: "Stand tall to begin.",
  debugInfo: {},
  recommendation: "",
  repFeedback: [],
  currentRepFailures: new Set<string>(),
};

const getDist = (a: NormalizedLandmark, b: NormalizedLandmark) => 
  Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

const L_SHOULDER = 11, R_SHOULDER = 12;
const L_WRIST = 15, R_WRIST = 16;
const L_HIP = 23, R_HIP = 24;
const L_KNEE = 25, R_KNEE = 26;
const L_ANKLE = 27, R_ANKLE = 28;
const MIN_VISIBILITY = 0.4;

export const evaluatePose = (
  landmarks: NormalizedLandmark[], 
  context: TrackingContext, 
  timestampMs: number
): TrackingContext => {
  if (!landmarks || landmarks.length === 0) return context;
  if (context.reps >= 10) return { ...context, message: "Challenge Completed!" };

  const ctx = { ...context };

  // Safety check for visibility of key joints
  const keyJoints = [L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANKLE, R_ANKLE, L_SHOULDER, R_SHOULDER];
  const missingJoints = keyJoints.some(j => (landmarks[j].visibility || 0) < MIN_VISIBILITY);
  if (missingJoints) {
    if (ctx.message !== "Adjusting... Please ensure full body is visible.") {
      ctx.message = "Adjusting... Please ensure full body is visible.";
    }
    return ctx;
  }

  // y goes down from 0 (top) to 1 (bottom) in MediaPipe Image Coordinates
  const isStandingInt = () => {
    // Relaxed standing check: Hips must be higher than knees
    return (landmarks[L_HIP].y < landmarks[L_KNEE].y - 0.05) &&
           (landmarks[R_HIP].y < landmarks[R_KNEE].y - 0.05);
  };

  const areArmsCrossed = () => {
    const dist1 = getDist(landmarks[L_WRIST], landmarks[R_SHOULDER]);
    const dist2 = getDist(landmarks[R_WRIST], landmarks[L_SHOULDER]);
    return dist1 < 0.4 && dist2 < 0.4;
  };

  const areLegsCrossed = () => {
    const ankleDx = landmarks[L_ANKLE].x - landmarks[R_ANKLE].x;
    const hipDx = landmarks[L_HIP].x - landmarks[R_HIP].x;
    return Math.sign(ankleDx) !== Math.sign(hipDx) || Math.abs(ankleDx) < 0.1;
  };

  const isSitting = () => {
    const hipAvgY = (landmarks[L_HIP].y + landmarks[R_HIP].y) / 2;
    const ankleAvgY = (landmarks[L_ANKLE].y + landmarks[R_ANKLE].y) / 2;
    return Math.abs(hipAvgY - ankleAvgY) < 0.35;
  };

  const isKneeTouching = () => {
    // MediaPipe Y is 0 at top, 1 at bottom.
    // If knee Y is roughly equal to or greater than the average ankle Y, it's touching the ground.
    const avgAnkleY = (landmarks[L_ANKLE].y + landmarks[R_ANKLE].y) / 2;
    return landmarks[L_KNEE].y > avgAnkleY - 0.2 || landmarks[R_KNEE].y > avgAnkleY - 0.2;
  };

  const isDeepSquat = () => {
    const hipAvgY = (landmarks[L_HIP].y + landmarks[R_HIP].y) / 2;
    const kneeAvgY = (landmarks[L_KNEE].y + landmarks[R_KNEE].y) / 2;
    // hip Y bounds softened significantly to just be "near" the knees
    return hipAvgY > kneeAvgY - 0.3; 
  };

  ctx.debugInfo = {
    isStanding: isStandingInt(),
    armsCrossed: areArmsCrossed(),
    legsCrossed: areLegsCrossed(),
    sitting: isSitting(),
    kneeTouching: isKneeTouching(),
    deepSquat: isDeepSquat(),
  };

  switch (ctx.currentState) {
    case PoseState.STANDING_START:
      ctx.message = "Stand tall, now cross your arms on your shoulders!";
      if (ctx.debugInfo.isStanding && ctx.debugInfo.armsCrossed) {
        ctx.currentState = PoseState.ARMS_CROSSED;
        ctx.recommendation = "";
      } else if (!ctx.debugInfo.isStanding) {
        ctx.recommendation = "Stand fully straight with hips and knees extended.";
      } else if (!ctx.debugInfo.armsCrossed) {
        ctx.recommendation = "Cross arms and rest your hands firmly on your opposite shoulders.";
      }
      break;

    case PoseState.ARMS_CROSSED:
      ctx.message = "Arms crossed! Now cross your legs.";
      // Relaxed backwards checking to avoid jitter failing
      if (ctx.debugInfo.legsCrossed) {
        ctx.currentState = PoseState.LEGS_CROSSED;
        ctx.stateEnteredAtMs = timestampMs;
        ctx.recommendation = "";
      } else {
        // If they sit down too fast, just skip to legs crossed state
        if (ctx.debugInfo.sitting) {
            ctx.currentState = PoseState.LEGS_CROSSED;
            ctx.stateEnteredAtMs = timestampMs;
            ctx.recommendation = "";
        } else {
            ctx.recommendation = "Cross one ankle completely over the other so your feet overlap.";
        }
      }
      break;

    case PoseState.LEGS_CROSSED:
      ctx.message = "Legs crossed. Sit down while keeping legs/arms crossed.";
      if (ctx.debugInfo.sitting) {
        // PDF Rule 5: Sit down on the floor for 2 seconds
        if (timestampMs - ctx.stateEnteredAtMs >= 2000) {
          ctx.currentState = PoseState.SITTING_DOWN;
          ctx.stateEnteredAtMs = timestampMs;
          ctx.recommendation = "";
        } else {
          ctx.recommendation = `Hold the sitting position steady... (${Math.max(0, 2 - (timestampMs - ctx.stateEnteredAtMs)/1000).toFixed(1)}s remaining)`;
        }
      } else {
        ctx.stateEnteredAtMs = timestampMs;
        ctx.recommendation = "Lower your hips all the way down close to your ankles.";
      }
      break;

    case PoseState.SITTING_DOWN:
      ctx.message = "Great! Drive one knee forward to touch the floor.";
      if (ctx.debugInfo.kneeTouching) {
        // PDF Rule 7: Maintain this posture for 1 second
        if (timestampMs - ctx.stateEnteredAtMs >= 1000) {
          ctx.currentState = PoseState.KNEE_TOUCH;
          ctx.recommendation = "";
        } else {
          ctx.recommendation = `Hold the knee touch cleanly... (${Math.max(0, 1 - (timestampMs - ctx.stateEnteredAtMs)/1000).toFixed(1)}s remaining)`;
        }
      } else {
        ctx.stateEnteredAtMs = timestampMs;
        ctx.recommendation = "Lean forward and touch one of your knees fully to the floor.";
      }
      break;

    case PoseState.KNEE_TOUCH:
      ctx.message = "Knee touched! Uncross legs and fall back into a deep squat.";
      // PDF Rule 8: Once knee is on the ground, remove the crossed leg and fall back to sit on deep squat
      if (ctx.debugInfo.deepSquat || (ctx.debugInfo.sitting && !ctx.debugInfo.legsCrossed)) {
        ctx.currentState = PoseState.DEEP_SQUAT;
        ctx.recommendation = "";
      } else if (ctx.debugInfo.legsCrossed) {
        ctx.recommendation = "Uncross your legs entirely to transition into the deep squat.";
      } else {
        ctx.recommendation = "Sit back with your hips physically lower than your knees.";
      }
      break;

    case PoseState.DEEP_SQUAT:
      ctx.message = "Deep squat locked! Stand tall with heels grounded to finish the rep.";
      // To ensure reps increment, allow either strict standing or if hips raise significantly above knees
      const hipsRaised = ((landmarks[L_HIP].y + landmarks[R_HIP].y)/2) < (((landmarks[L_KNEE].y + landmarks[R_KNEE].y)/2) - 0.2);
      
      if (ctx.debugInfo.isStanding || hipsRaised) {
        // Save the failures recorded during this rep
        ctx.repFeedback.push(Array.from(ctx.currentRepFailures));
        ctx.currentRepFailures = new Set<string>(); // reset for next rep
        
        ctx.reps++;
        ctx.score += 8;
        ctx.currentState = PoseState.STANDING_START;
        ctx.message = `Rep ${ctx.reps} Complete! +8 points.`;
        ctx.recommendation = "";
      } else {
        ctx.recommendation = "Push up through your heels until you are standing completely straight.";
      }
      break;
  }

  if (ctx.recommendation) {
     ctx.currentRepFailures.add(ctx.recommendation);
  }

  return ctx;
};
