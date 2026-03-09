import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export const PoseState = {
  STANDING_START: 0,
  ARMS_CROSSED: 1,
  LEGS_CROSSED: 2,
  SITTING_DOWN: 3,
  SIT_ON_FLOOR: 4,
  DRIVE_KNEE: 5,
  KNEE_TOUCH: 6,
  DEEP_SQUAT: 7,
  FINAL_STAND: 8,
};

export const POSE_STATE_NAMES = {
  [PoseState.STANDING_START]: "1. Stand tall (Shoulder width apart)",
  [PoseState.ARMS_CROSSED]: "2. Cross hands on opposite shoulders",
  [PoseState.LEGS_CROSSED]: "3. Cross your legs",
  [PoseState.SITTING_DOWN]: "4. Sit down with legs crossed",
  [PoseState.SIT_ON_FLOOR]: "5. Sit on the floor",
  [PoseState.DRIVE_KNEE]: "6. Drive knee forward (Legs crossed)",
  [PoseState.KNEE_TOUCH]: "7. Knee touching the ground",
  [PoseState.DEEP_SQUAT]: "8. Uncross legs & drop to deep squat",
  [PoseState.FINAL_STAND]: "9. Stand tall (Heels grounded)",
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
  completionTime: string;
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
const MIN_VISIBILITY = 0.3; // Lowered to avoid interruptions during crouch/sit

export const evaluatePose = (
  landmarks: NormalizedLandmark[], 
  context: TrackingContext, 
  timestampMs: number
): TrackingContext => {
  if (!landmarks || landmarks.length === 0) return context;
  if (context.reps >= 10) return { ...context, message: "Challenge Completed!" };

  const ctx = { ...context };
  
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
    // Permissive standing check: Shoulders above hips, hips above knees, knees above ankles
    const hipsAboveKnees = (landmarks[L_HIP].y < landmarks[L_KNEE].y - 0.05) &&
                           (landmarks[R_HIP].y < landmarks[R_KNEE].y - 0.05);
    const kneesAboveAnkles = (landmarks[L_KNEE].y < landmarks[L_ANKLE].y - 0.05) &&
                             (landmarks[R_KNEE].y < landmarks[R_ANKLE].y - 0.05);
    const shouldersAboveHips = (landmarks[L_SHOULDER].y < landmarks[L_HIP].y - 0.05) &&
                               (landmarks[R_SHOULDER].y < landmarks[R_HIP].y - 0.05);
                               
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
    // Permissive deep squat: Hips near or below knees
    return hipAvgY > kneeAvgY - 0.05; 
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
      ctx.message = "1. Stand tall, place legs shoulder width apart!";
      if (ctx.debugInfo.isStanding) {
        ctx.currentState = PoseState.ARMS_CROSSED;
        ctx.recommendation = "";
      } else {
        ctx.recommendation = "Please stand tall and ensure full body is visible.";
      }
      break;

    case PoseState.ARMS_CROSSED:
      ctx.message = "2. Cross your hands on opposite shoulders!";
      if (ctx.debugInfo.armsCrossed) {
        ctx.currentState = PoseState.LEGS_CROSSED;
        ctx.recommendation = "";
      } else {
        ctx.recommendation = "Cross your hands and place them on your opposite shoulders.";
      }
      break;

    case PoseState.LEGS_CROSSED:
      ctx.message = "3. Now cross your legs!";
      if (ctx.debugInfo.legsCrossed) {
        ctx.currentState = PoseState.SITTING_DOWN;
        ctx.recommendation = "";
      } else {
        ctx.recommendation = "Cross your legs completely.";
      }
      break;

    case PoseState.SITTING_DOWN:
      ctx.message = "4. Sit down with legs crossed!";
      if (ctx.debugInfo.sitting && ctx.debugInfo.legsCrossed) {
        ctx.legsWereCrossedDuringSit = true; 
        ctx.currentState = PoseState.SIT_ON_FLOOR;
        ctx.recommendation = "";
      } else if (ctx.debugInfo.sitting && !ctx.debugInfo.legsCrossed) {
         ctx.recommendation = "Keep your legs crossed while sitting down.";
      } else {
         ctx.recommendation = "Slowly sit down while maintaining the posture.";
      }
      break;

    case PoseState.SIT_ON_FLOOR:
      ctx.message = "5. Sit on the floor! (Touching ground)";
      if (ctx.debugInfo.sitting && ctx.debugInfo.legsCrossed) {
        // We've already confirmed sitting, this is just to confirm the state
        ctx.currentState = PoseState.DRIVE_KNEE;
        ctx.recommendation = "";
      }
      break;

    case PoseState.DRIVE_KNEE:
      ctx.message = "6. Drive your knee forward (Keep legs crossed)!";
      if (ctx.debugInfo.kneeTouching && ctx.debugInfo.legsCrossed) {
        ctx.currentState = PoseState.KNEE_TOUCH;
        ctx.recommendation = "";
      } else if (ctx.debugInfo.kneeTouching && !ctx.debugInfo.legsCrossed) {
        ctx.recommendation = "Make sure legs are crossed when knee hits the floor.";
      } else {
        ctx.recommendation = "Lean forward and drive one knee toward the floor.";
      }
      break;

    case PoseState.KNEE_TOUCH:
      ctx.message = "7. Great! Knee touched floor.";
      if (ctx.debugInfo.kneeTouching) {
        ctx.kneeDidTouch = true;
        ctx.currentState = PoseState.DEEP_SQUAT;
        ctx.recommendation = "";
      }
      break;

    case PoseState.DEEP_SQUAT:
      ctx.message = "8. Uncross legs and drop into deep squat!";
      if (ctx.debugInfo.deepSquat && !ctx.debugInfo.legsCrossed) {
        ctx.deepSquatReached = true;
        ctx.currentState = PoseState.FINAL_STAND;
        ctx.recommendation = "";
      } else if (ctx.debugInfo.legsCrossed) {
        ctx.recommendation = "Uncross your legs to transition to deep squat.";
      } else {
        ctx.recommendation = "Lower your hips below your knees for a deep squat.";
      }
      break;

    case PoseState.FINAL_STAND:
      ctx.message = "9. Stand tall once again with heels grounded!";
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
          completionTime: new Date(timestampMs).toLocaleTimeString(),
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
          ctx.message = `Rep ${ctx.reps} — ❌ 0 pts (${disqualifyingReasons.length} issues).`;
        }
        ctx.recommendation = "";
      } else {
        ctx.recommendation = "Stand tall to complete the rep.";
      }
      break;
  }

  if (ctx.recommendation) {
     ctx.currentRepFailures.add(ctx.recommendation);
  }

  return ctx;
};
