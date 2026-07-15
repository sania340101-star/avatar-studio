export const DEFAULT_POSE_PRESETS: { label: string; value: string }[] = [
  {
    label: 'Male Full-body Idle',
    value: `Natural idle full-body animation of a photorealistic man. Solid black background. Static camera. Neutral standing start.

Constraints:
- Feet stay grounded throughout — no stepping or sliding
- Eyes maintain direct camera contact at all times — no looking at floor, ceiling, or sides
- Head stays mostly forward-facing with small natural micro-movements — no full head turns or significant drift away from camera
- All movement stays contained within the camera frame — no limbs or body parts extending beyond frame edges
- Movements are restrained and subtle — no wide or exaggerated motions

Continuous micro-movements for natural life:
- Slow weight shifting between legs, driven from hips with subtle secondary motion in torso and shoulders
- Natural irregular breathing visible in chest and upper torso
- Soft blinking at uneven intervals
- Subtle side-to-side body sway with smooth balance corrections
- Small postural micro-adjustments: slight shoulder settling, spine corrections
- Hand and finger micro-movements: gentle relaxation shifts, subtle grip changes, occasional repositioning of hands
- Wrists and fingers must not remain frozen — small natural adjustments keep them alive

All movement should feel calm, grounded, and physically realistic with natural timing variations. No robotic or frozen body parts. The entire body stays alive with continuous organic micro-motion.`,
  },
  {
    label: 'Female Full-body Idle',
    value: `Natural idle full-body animation of a photorealistic woman. Solid black background. Static camera. Neutral standing start.

Constraints:
- Feet stay grounded throughout — no stepping or sliding, only natural micro-adjustments for balance
- Eyes maintain direct camera contact at all times — no looking at floor, ceiling, or sides
- Head stays mostly forward-facing with small natural micro-movements — no full head turns or significant drift away from camera
- All movement stays contained within the camera frame — no limbs or body parts extending beyond frame edges
- Movements are restrained and graceful — no wide or exaggerated motions

Continuous micro-movements for natural life:
- Graceful slow weight shifting between legs, creating gentle hip movement with natural follow-through in torso
- Soft natural breathing visible as gentle rise and fall of chest and shoulders
- Delicate blinking at natural uneven intervals
- Subtle fluid body sway, smooth and balanced
- Small postural adjustments: gentle shoulder settling, soft spine corrections
- Delicate hand and finger micro-movements: subtle finger relaxation, gentle wrist adjustments, occasional light repositioning
- Wrists and fingers must not remain frozen — small graceful adjustments keep them alive

All movement should feel poised, graceful, and physically realistic with natural timing variations. No stiff or frozen body parts. The entire body stays alive with continuous elegant micro-motion.`,
  },
  {
    label: 'Male Bust Idle (Solo)',
    value: `Natural idle bust animation (head and shoulders only) of a photorealistic man. Solid black background. Static camera.

Constraints:
- Eyes maintain direct camera contact at all times — no looking at floor, ceiling, or sides
- Head forward-facing and steady — only very subtle stabilizing micro-movements, no significant nodding, tilting, or rotation

The man is framed from chest up in a relaxed posture with continuous subtle life:
- Natural irregular breathing visible in upper chest and shoulder area
- Soft blinking at uneven intervals
- Small shoulder settling and postural micro-adjustments
- Slight natural facial micro-expressions: subtle jaw relaxation, gentle brow shifts
No hand, arm, or lower body motion visible. All movement contained in head, face, and upper chest area. Motion should feel calm, human, and present.`,
  },
  {
    label: 'Female Bust Idle (Solo)',
    value: `Natural idle bust animation (head and shoulders only) of a photorealistic woman. Solid black background. Static camera.

Constraints:
- Eyes maintain direct camera contact at all times — no looking at floor, ceiling, or sides
- Head forward-facing and steady — only very subtle graceful micro-movements, no significant nodding, tilting, or rotation

The woman is framed from chest up in an elegant posture with continuous subtle life:
- Soft natural breathing visible in upper chest and shoulders
- Delicate blinking at natural intervals
- Gentle shoulder settling and small postural shifts
- Subtle natural facial micro-expressions: soft lip relaxation, gentle brow movement
No hand, arm, or lower body motion visible. All movement contained in head, face, and upper chest area. Motion should feel poised, feminine, and naturally alive.`,
  },
  {
    label: 'Male Full-body Talk',
    value: `Natural talking full-body animation of a photorealistic man. Solid black background. Static camera. Feet stay grounded.

Constraints:
- Eyes maintain direct camera contact at all times — no looking at floor, ceiling, or sides
- All movement stays contained within the camera frame — no limbs or body parts extending beyond frame edges
- Gestures are restrained and controlled — no wide sweeping arm movements that could exit the frame
- IMPORTANT: lips must NOT move. The speaking impression comes entirely from body language and gestures

The man appears to be actively engaged in conversation with natural body language:
- Expressive but contained hand gestures: hands move to emphasize points, open palm gestures, occasional pointing. Gestures are varied and natural, not repetitive
- Arms move from shoulders with natural follow-through in elbows and wrists
- Natural weight shifting between legs as he speaks
- Subtle torso movement following gesture energy
- Head makes small natural nods while speaking — stays mostly forward-facing
- Natural breathing and blinking throughout
- Occasional pauses in gesturing with hands returning to rest position before next gesture
- Hand and finger movements remain natural and alive — no frozen or stiff hands
All motion should feel energetic but controlled, like a real person explaining something with conviction.`,
  },
  {
    label: 'Female Full-body Talk',
    value: `Natural talking full-body animation of a photorealistic woman. Solid black background. Static camera. Feet stay grounded.

Constraints:
- Eyes maintain direct camera contact at all times — no looking at floor, ceiling, or sides
- All movement stays contained within the camera frame — no limbs or body parts extending beyond frame edges
- Gestures are graceful and contained — no wide movements that could exit the frame
- IMPORTANT: lips must NOT move. The speaking impression comes entirely from body language and gestures

The woman appears to be actively engaged in conversation with graceful body language:
- Elegant but contained hand gestures: expressive movements to emphasize points, open gestures, gentle illustrative motions. Gestures are fluid and natural
- Arms move gracefully with smooth follow-through
- Subtle weight shifting creating gentle hip movement
- Soft torso movement following gesture energy
- Head makes natural nods and gentle tilts while speaking — stays mostly forward-facing
- Natural breathing and delicate blinking throughout
- Graceful pauses between gestures with hands settling naturally
- Hand and finger movements remain natural and alive — no frozen or stiff hands
All motion should feel expressive yet poised, like a real person communicating with warmth and confidence.`,
  },
  {
    label: 'Male Bust Talk (Solo)',
    value: `Natural talking bust animation (head and shoulders only) of a photorealistic man. Solid black background. Static camera.

Constraints:
- Eyes maintain direct camera contact at all times — no looking at floor, ceiling, or sides
- Head stays mostly forward-facing — small natural nods and tilts are fine, but no full head turns or significant drift
- IMPORTANT: lips must NOT move. The speaking impression comes from head movement, expressions, and shoulder energy

The man is framed from chest up, appearing to be actively speaking:
- Small natural head nods, slight tilts for emphasis
- Animated shoulder shifts that suggest underlying gesture energy
- Dynamic facial micro-expressions: eyebrow raises, engaged expression
- Natural breathing and blinking throughout
- Occasional pauses with settling before next expressive movement
Motion should feel engaged and communicative, with natural rhythm and variation.`,
  },
  {
    label: 'Female Bust Talk (Solo)',
    value: `Natural talking bust animation (head and shoulders only) of a photorealistic woman. Solid black background. Static camera.

Constraints:
- Eyes maintain direct camera contact at all times — no looking at floor, ceiling, or sides
- Head stays mostly forward-facing — small graceful nods and tilts are fine, but no full head turns or significant drift
- IMPORTANT: lips must NOT move. The speaking impression comes from head movement, expressions, and shoulder energy

The woman is framed from chest up, appearing to be actively speaking:
- Graceful small head nods, soft tilts for natural emphasis
- Subtle shoulder shifts suggesting expressive body language
- Animated feminine facial micro-expressions: gentle brow movement, engaged expression
- Soft breathing and delicate blinking throughout
- Graceful pauses with elegant settling between expressive movements
Motion should feel warm, communicative, and naturally feminine with smooth rhythm.`,
  },
];
