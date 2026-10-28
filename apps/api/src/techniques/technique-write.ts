import {
  DEFAULT_TRANSITION_MS,
  STARTER_POSE,
  type StepInput,
  slugify,
  slugSchema,
  type TechniqueCreateInput,
  type TechniqueUpdateInput,
} from '@tatamap/shared';
import { isUniqueViolation } from '../db-errors';
import { ApiFailure } from '../errors';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { findAdminTechnique } from './admin-technique-repository';
import { toStepCreateData } from './step-data';

type WriteFields = Pick<
  Prisma.TechniqueUncheckedCreateInput,
  | 'slug'
  | 'name'
  | 'category'
  | 'level'
  | 'gi'
  | 'keyPoints'
  | 'commonMistakes'
  | 'startPositionId'
  | 'endPositionId'
>;

/** The only mapping from validated input to technique columns: never spread a body into Prisma. */
export const toTechniqueWriteData = (
  input: Pick<TechniqueUpdateInput, keyof WriteFields>,
): WriteFields => ({
  slug: input.slug,
  name: input.name,
  category: input.category,
  level: input.level,
  gi: input.gi,
  keyPoints: input.keyPoints,
  commonMistakes: input.commonMistakes,
  startPositionId: input.startPositionId,
  endPositionId: input.endPositionId,
});

export const unknownReference = (what: string) =>
  new ApiFailure(400, 'bad_request', `Unknown ${what}`, 'unknown_reference');
export const slugTaken = () =>
  new ApiFailure(409, 'conflict', 'This slug is already used', 'slug_taken');

/** Throws unknown_reference when one of the ids does not exist (one count per table). */
export async function assertPositionsExist(
  tx: Prisma.TransactionClient,
  ids: ReadonlyArray<string | null>,
): Promise<void> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return;
  if ((await tx.position.count({ where: { id: { in: wanted } } })) !== wanted.length) {
    throw unknownReference('position');
  }
}

/** Creates a draft with one starter step. Throws ApiFailure for business errors. */
export async function createTechnique(prisma: PrismaClient, input: TechniqueCreateInput) {
  const slug = slugSchema.safeParse(input.slug ?? slugify(input.name));
  if (!slug.success) throw new ApiFailure(400, 'bad_request', 'Invalid slug');

  const firstStep: StepInput = {
    title: 'Étape 1',
    text: '',
    transitionMs: DEFAULT_TRANSITION_MS,
    pose: STARTER_POSE,
  };
  try {
    const id = await prisma.$transaction(async (tx) => {
      await assertPositionsExist(tx, [input.startPositionId, input.endPositionId]);
      const created = await tx.technique.create({
        data: {
          ...toTechniqueWriteData({
            slug: slug.data,
            name: input.name,
            category: input.category,
            level: input.level,
            gi: input.gi,
            keyPoints: [],
            commonMistakes: [],
            startPositionId: input.startPositionId,
            endPositionId: input.endPositionId,
          }),
          status: 'draft',
        },
      });
      await tx.step.createMany({ data: toStepCreateData(created.id, [firstStep]) });
      return created.id;
    });
    return await findAdminTechnique(prisma, id);
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken();
    throw error;
  }
}
