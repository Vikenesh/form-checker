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

// Critical failure keys — any of these set to true will disqualify the rep
export const CRITICAL_FAILURES = {
  LEGS_NOT_CROSSED_SITTING: "Legs not crossed while sitting (Rule: legs must be crossed during sit)",
  KNEE_DID_NOT_TOUCH: "Knee did not touch the floor (Rule: knee must touch floor forward)",
  DEEP_SQUAT_NOT_PERFORMED: "Deep squat not performed (Rule: must be in deep squat before standing)",
} as const;

export interface RepStatus {
  repNumber: number;
  valid: boolean;
  pointsAwarded: number;
  disqualifyingReasons: string[];
  formCorrections: string[];
}

export interface TrackingContext {
  currentState: number;
  reps: number;           // total attempts (valid + invalid)
  score: number;
  stateEnteredAtMs: number;
  message: string;
  debugInfo: Record<string, boolean>;
  recommendation?: string;
  repFeedback: string[][];
  repStatus: RepStatus[];
  currentRepFailures: Set<string>;
  currentRepCriticalFailures: Set<string>;
  legsWereCrossedDuringSit: boolean;
  kneeDidTouch: boolean;
  deepSquatReached: boolean;
  accumulatedHoldMs: number;
  lastProcessedMs: number;
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
  repStatus: [],
  currentRepFailures: new Set<string>(),
  currentRepCriticalFailures: new Set<string>(),
  legsWereCrossedDuringSit: false,
  kneeDidTouch: false,
  deepSquatReached: false,
  accumulatedHoldMs: 0,
  lastProcessedMs: 0,
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
  
  const deltaMs = ctx.lastProcessedMs === 0 ? 0 : timestampMs - ctx.lastProcessedMs;
  ctx.lastProcessedMs = timestampMs;

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
    // Strict standing check: Shoulders above hips, hips above knees, knees above ankles
    const hipsAboveKnees = (landmarks[L_HIP].y < landmarks[L_KNEE].y - 0.1) &&
                           (landmarks[R_HIP].y < landmarks[R_KNEE].y - 0.1);
    const kneesAboveAnkles = (landmarks[L_KNEE].y < landmarks[L_ANKLE].y - 0.1) &&
                             (landmarks[R_KNEE].y < landmarks[R_ANKLE].y - 0.1);
    const shouldersAboveHips = (landmarks[L_SHOULDER].y < landmarks[L_HIP].y - 0.1) &&
                               (landmarks[R_SHOULDER].y < landmarks[R_HIP].y - 0.1);
                               
    return hipsAboveKnees && kneesAboveAnkles && shouldersAboveHips;
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
    // For a deep squat, hips should be near or below the knees
    return hipAvgY > kneeAvgY - 0.1; 
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
        ctx.accumulatedHoldMs = 0;
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
      if (ctx.debugInfo.sitting && ctx.debugInfo.legsCrossed) {
        ctx.legsWereCrossedDuringSit = true; // ✅ legs crossed while sitting — required
        ctx.accumulatedHoldMs += deltaMs;
        // Rule 5: Sit down on the floor for 2 seconds
        if (ctx.accumulatedHoldMs >= 2000) {
          ctx.currentState = PoseState.SITTING_DOWN;
          ctx.stateEnteredAtMs = timestampMs;
          ctx.accumulatedHoldMs = 0;
          ctx.recommendation = "";
        } else {
          const remaining = Math.max(0, 2 - ctx.accumulatedHoldMs / 1000).toFixed(1);
          ctx.message = `Sitting — hold for ${remaining}s more...`;
          ctx.recommendation = "";
        }
      } else {
        ctx.accumulatedHoldMs = Math.max(0, ctx.accumulatedHoldMs - (deltaMs * 1.5));
        if (ctx.accumulatedHoldMs === 0) {
          if (ctx.debugInfo.sitting && !ctx.debugInfo.legsCrossed) {
            ctx.recommendation = "Make sure your legs remain crossed while sitting down.";
          } else {
            ctx.recommendation = "Lower your hips all the way down close to your ankles while keeping legs crossed.";
          }
        }
      }
      break;

    case PoseState.SITTING_DOWN:
      ctx.message = "Great! Drive one knee forward to touch the floor.";
      if (ctx.debugInfo.kneeTouching && ctx.debugInfo.legsCrossed) {
        ctx.kneeDidTouch = true; // ✅ knee touched floor — required
        ctx.accumulatedHoldMs += deltaMs;
        // Rule 7: Maintain this posture for 1 second
        if (ctx.accumulatedHoldMs >= 1000) {
          ctx.currentState = PoseState.KNEE_TOUCH;
          ctx.accumulatedHoldMs = 0;
          ctx.recommendation = "";
        } else {
          const remaining = Math.max(0, 1 - ctx.accumulatedHoldMs / 1000).toFixed(1);
          ctx.message = `Knee on floor — hold for ${remaining}s more...`;
          ctx.recommendation = "";
        }
      } else {
        ctx.accumulatedHoldMs = Math.max(0, ctx.accumulatedHoldMs - (deltaMs * 1.5));
        if (ctx.accumulatedHoldMs === 0) {
          if (ctx.debugInfo.kneeTouching && !ctx.debugInfo.legsCrossed) {
            ctx.recommendation = "Keep your legs crossed while driving your knee forward.";
          } else {
            ctx.recommendation = "Lean forward and touch one of your knees fully to the floor.";
          }
        }
      }
      break;

    case PoseState.KNEE_TOUCH:
      ctx.message = "Knee touched! Uncross legs and fall back into a deep squat.";
      // Rule 8: Once knee is on the ground, remove the crossed leg and fall back to sit on deep squat
      if (ctx.debugInfo.deepSquat && !ctx.debugInfo.legsCrossed) {
        ctx.deepSquatReached = true; // ✅ deep squat reached — required
        ctx.currentState = PoseState.DEEP_SQUAT;
        ctx.accumulatedHoldMs = 0;
        ctx.recommendation = "";
      } else if (ctx.debugInfo.legsCrossed) {
        ctx.recommendation = "Uncross your legs entirely to transition into the deep squat.";
      } else {
        ctx.recommendation = "Sit back into a deep squat with your hips physically lower than your knees.";
      }
      break;

    case PoseState.DEEP_SQUAT:
      ctx.message = "Deep squat locked! Stand tall with heels grounded to finish the rep.";
      
      // Must return to a fully standing tall position to complete the rep
      if (ctx.debugInfo.isStanding) {
        const repNum = ctx.reps + 1;

        // Determine disqualifying failures
        const disqualifyingReasons: string[] = [];
        if (!ctx.legsWereCrossedDuringSit) {
          disqualifyingReasons.push(CRITICAL_FAILURES.LEGS_NOT_CROSSED_SITTING);
        }
        if (!ctx.kneeDidTouch) {
          disqualifyingReasons.push(CRITICAL_FAILURES.KNEE_DID_NOT_TOUCH);
        }
        if (!ctx.deepSquatReached) {
          disqualifyingReasons.push(CRITICAL_FAILURES.DEEP_SQUAT_NOT_PERFORMED);
        }

        const isValidRep = disqualifyingReasons.length === 0;
        const pointsAwarded = isValidRep ? 8 : 0;

        const status: RepStatus = {
          repNumber: repNum,
          valid: isValidRep,
          pointsAwarded,
          disqualifyingReasons,
          formCorrections: Array.from(ctx.currentRepFailures),
        };

        ctx.repStatus.push(status);
        ctx.repFeedback.push(Array.from(ctx.currentRepFailures));
        ctx.currentRepFailures = new Set<string>();
        ctx.currentRepCriticalFailures = new Set<string>();

        // Reset per-rep tracking flags
        ctx.legsWereCrossedDuringSit = false;
        ctx.kneeDidTouch = false;
        ctx.deepSquatReached = false;

        ctx.reps++;
        ctx.score += pointsAwarded;
        ctx.currentState = PoseState.STANDING_START;
        
        if (isValidRep) {
          ctx.message = `Rep ${ctx.reps} Complete! ✅ +8 points.`;
        } else {
          ctx.message = `Rep ${ctx.reps} — ❌ 0 pts (${disqualifyingReasons.length} disqualifying issue${disqualifyingReasons.length > 1 ? 's' : ''}).`;
        }
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
