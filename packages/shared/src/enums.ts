import { z } from 'zod';

export const CATEGORIES = ['submission', 'pass', 'sweep', 'escape', 'takedown'] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;
export const CATEGORY_LABELS_FR: Record<Category, string> = {
  submission: 'Soumission',
  pass: 'Passage de garde',
  sweep: 'Renversement',
  escape: 'Sortie',
  takedown: 'Projection',
};

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const levelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof levelSchema>;
export const LEVEL_LABELS_FR: Record<Level, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
};

export const GI_MODES = ['gi', 'nogi', 'both'] as const;
export const giModeSchema = z.enum(GI_MODES);
export type GiMode = z.infer<typeof giModeSchema>;
export const GI_MODE_LABELS_FR: Record<GiMode, string> = {
  gi: 'Gi',
  nogi: 'No-gi',
  both: 'Gi et no-gi',
};

export const POSITION_ROLES = ['top', 'bottom', 'neutral'] as const;
export const positionRoleSchema = z.enum(POSITION_ROLES);
export type PositionRole = z.infer<typeof positionRoleSchema>;
export const POSITION_ROLE_LABELS_FR: Record<PositionRole, string> = {
  top: 'Dessus',
  bottom: 'Dessous',
  neutral: 'Neutre',
};

export const TECHNIQUE_STATUSES = ['draft', 'published'] as const;
export const techniqueStatusSchema = z.enum(TECHNIQUE_STATUSES);
export type TechniqueStatus = z.infer<typeof techniqueStatusSchema>;

export const CHAIN_TYPES = ['followup', 'counter', 'alternative'] as const;
export const chainTypeSchema = z.enum(CHAIN_TYPES);
export type ChainType = z.infer<typeof chainTypeSchema>;
export const CHAIN_TYPE_LABELS_FR: Record<ChainType, string> = {
  followup: 'Suite',
  counter: 'Contre',
  alternative: 'Alternative',
};
