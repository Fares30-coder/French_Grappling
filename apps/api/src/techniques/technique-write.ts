import {
  DEFAULT_TRANSITION_MS,
  publishIssues,
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
export const versionMismatch = () =>
  new ApiFailure(409, 'conflict', 'The technique was modified elsewhere', 'version_mismatch');
export const notPublishable = () =>
  new ApiFailure(409, 'conflict', 'The technique is not publishable', 'not_publishable');
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

/**
 * Full replacement of a technique (ADR 0003 C4), in one interactive transaction. `version` is the
 * optimistic-concurrency token: the winner of two concurrent saves bumps it, the loser gets
 * 409 version_mismatch. Throws ApiFailure for business errors.
 */
export async function updateTechnique(
  prisma: PrismaClient,
  id: string,
  input: TechniqueUpdateInput,
) {
  await prisma.$transaction(async (tx) => {
    // 1. Existence and version.
    const current = await tx.technique.findUnique({
      where: { id },
      select: { slug: true, status: true, version: true },
    });
    if (!current) throw new ApiFailure(404, 'not_found', 'Technique not found');
    if (current.version !== input.version) throw versionMismatch();

    // 2. A published technique keeps its URL and stays publishable.
    if (current.status === 'published') {
      if (input.slug !== current.slug) {
        throw new ApiFailure(
          409,
          'conflict',
          'The slug of a published technique is locked',
          'slug_locked',
        );
      }
      if (publishIssues(input).length > 0) throw notPublishable();
    }

    // 3. No chain to itself.
    if (input.chains.some((c) => c.toId === id)) {
      throw new ApiFailure(400, 'bad_request', 'A technique cannot chain to itself', 'self_chain');
    }

    // 4. Every referenced row exists.
    await assertPositionsExist(tx, [input.startPositionId, input.endPositionId]);
    if ((await tx.tag.count({ where: { id: { in: input.tagIds } } })) !== input.tagIds.length) {
      throw unknownReference('tag');
    }
    const targets = [...new Set(input.chains.map((c) => c.toId))];
    if ((await tx.technique.count({ where: { id: { in: targets } } })) !== targets.length) {
      throw unknownReference('chain target');
    }

    // 5. Compare-and-swap on the version (a concurrent save may have won since step 1).
    let updated: { count: number };
    try {
      updated = await tx.technique.updateMany({
        where: { id, version: input.version },
        data: { ...toTechniqueWriteData(input), version: { increment: 1 } },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw slugTaken(); // the only unique column written here
      throw error;
    }
    if (updated.count === 0) throw versionMismatch();

    // 6. Tags, steps and chains are replaced.
    await tx.technique.update({
      where: { id },
      data: { tags: { set: input.tagIds.map((tagId) => ({ id: tagId })) } },
    });
    await tx.step.deleteMany({ where: { techniqueId: id } });
    await tx.step.createMany({ data: toStepCreateData(id, input.steps) });
    await tx.chain.deleteMany({ where: { fromId: id } });
    await tx.chain.createMany({
      data: input.chains.map((c) => ({ fromId: id, toId: c.toId, type: c.type })),
    });
  });
  return findAdminTechnique(prisma, id);
}
