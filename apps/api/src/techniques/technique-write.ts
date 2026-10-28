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
import { isForeignKeyViolation, isUniqueViolation } from '../db-errors';
import { ApiFailure } from '../errors';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { adminTechniqueInclude, findAdminTechnique } from './admin-technique-repository';
import { toStepCreateData } from './step-data';
import { toAdminTechnique } from './to-admin-technique';

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
    if (isForeignKeyViolation(error)) throw unknownReference('position'); // deleted since the check
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
  try {
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
        throw new ApiFailure(
          400,
          'bad_request',
          'A technique cannot chain to itself',
          'self_chain',
        );
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
  } catch (error) {
    // A referenced row deleted between the existence checks and the writes.
    if (isForeignKeyViolation(error)) throw unknownReference('reference');
    throw error;
  }
  return findAdminTechnique(prisma, id);
}

const stillPublished = () =>
  new ApiFailure(409, 'conflict', 'Unpublish the technique before deleting it', 'still_published');

/**
 * Publishes (or unpublishes) a technique, guarded by `version`. Publishing keeps the first
 * `publishedAt` and is idempotent; unpublishing keeps `publishedAt`.
 */
export async function setTechniqueStatus(
  prisma: PrismaClient,
  id: string,
  version: number,
  status: 'draft' | 'published',
) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.technique.findUnique({
      where: { id },
      select: {
        version: true,
        publishedAt: true,
        keyPoints: true,
        _count: { select: { steps: true } },
      },
    });
    if (!current) throw new ApiFailure(404, 'not_found', 'Technique not found');
    if (current.version !== version) throw versionMismatch();
    if (status === 'published') {
      const issues = publishIssues({
        steps: Array.from({ length: current._count.steps }), // only the length matters
        keyPoints: current.keyPoints,
      });
      if (issues.length > 0) throw notPublishable();
    }
    const updated = await tx.technique.updateMany({
      where: { id, version },
      data: {
        status,
        ...(status === 'published' ? { publishedAt: current.publishedAt ?? new Date() } : {}),
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) throw versionMismatch();
  });
  return findAdminTechnique(prisma, id);
}

/** Deletes a draft (steps and chains cascade). A published technique must be unpublished first. */
export async function deleteTechnique(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.technique.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new ApiFailure(404, 'not_found', 'Technique not found');
    if (current.status === 'published') throw stillPublished();
    const deleted = await tx.technique.deleteMany({ where: { id, status: 'draft' } });
    if (deleted.count === 0) throw stillPublished(); // published in between
  });
}

const COPY_SUFFIX = '-copie';

/** First free "<slug>-copie", "<slug>-copie-2"... (and the matching name suffix). */
async function freeCopyIdentity(
  tx: Prisma.TransactionClient,
  slug: string,
  name: string,
): Promise<{ slug: string; name: string }> {
  const room = (suffix: string) => slug.slice(0, 100 - suffix.length).replace(/-+$/, '') + suffix;
  const trimName = (suffix: string) => `${name.slice(0, 120 - suffix.length)}${suffix}`;
  for (let n = 1; n < 1000; n++) {
    const candidate = room(n === 1 ? COPY_SUFFIX : `${COPY_SUFFIX}-${n}`);
    if ((await tx.technique.count({ where: { slug: candidate } })) === 0) {
      return { slug: candidate, name: trimName(n === 1 ? ' (copie)' : ` (copie ${n})`) };
    }
  }
  throw slugTaken();
}

/** Copies a technique into a new draft: steps, tags, key points, mistakes; never the chains. */
export async function duplicateTechnique(prisma: PrismaClient, id: string) {
  try {
    const newId = await prisma.$transaction(async (tx) => {
      const source = await tx.technique.findUnique({
        where: { id },
        include: adminTechniqueInclude,
      });
      if (!source) throw new ApiFailure(404, 'not_found', 'Technique not found');
      const copy = await freeCopyIdentity(tx, source.slug, source.name);
      const data = toAdminTechnique(source);
      const created = await tx.technique.create({
        data: {
          ...toTechniqueWriteData({ ...data, ...copy }),
          status: 'draft',
          tags: { connect: data.tagIds.map((tagId) => ({ id: tagId })) },
        },
      });
      await tx.step.createMany({ data: toStepCreateData(created.id, data.steps) });
      return created.id;
    });
    return await findAdminTechnique(prisma, newId);
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken();
    if (isForeignKeyViolation(error)) throw unknownReference('reference');
    throw error;
  }
}
