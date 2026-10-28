export type ReapplyInput = {
  playing: boolean;
  /** The controlled `stepIndex` differs from the one of the previous run. */
  stepIndexChanged: boolean;
  /** `steps` is a new reference since the previous run (editing). */
  stepsChanged: boolean;
  /** The new `stepIndex` is the parent echoing our own onStepChange. */
  isEcho: boolean;
};

/**
 * Whether the scene must (re)apply the pose of `steps[stepIndex]`.
 * - A new `stepIndex` from outside jumps to it (echoes of onStepChange are ignored).
 * - Edited `steps` while stopped re-apply the current pose, even at the same index.
 * - While playing, edited `steps` never interrupt the animation.
 */
export function shouldReapplyPose({
  playing,
  stepIndexChanged,
  stepsChanged,
  isEcho,
}: ReapplyInput): boolean {
  if (stepIndexChanged) return !isEcho;
  return stepsChanged && !playing;
}
