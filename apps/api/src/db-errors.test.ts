import { randomUUID } from 'node:crypto';
import { STARTER_POSE, type TechniqueUpdateInput } from '@tatamap/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from './db';
import { isForeignKeyViolation, isRecordNotFound, isUniqueViolation } from './db-errors';
import { ApiFailure } from './errors';
import type { PrismaClient } from './generated/prisma/client';
import { createTechnique, duplicateTechnique, updateTechnique } from './techniques/technique-write';
import { createTestTechnique } from './test-utils';

describe('db error helpers', () => {
  it('map Prisma codes', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isForeignKeyViolation({ code: 'P2003' })).toBe(true);
    expect(isRecordNotFound({ code: 'P2025' })).toBe(true);
    expect(isForeignKeyViolation({ code: 'P2002' })).toBe(false);
    expect(isForeignKeyViolation(new Error('x'))).toBe(false);
    expect(isForeignKeyViolation(null)).toBe(false);
  });
});

/** A client whose transactions fail with a foreign key violation, as after a race with a delete. */
const racingPrisma = {
  $transaction: () => Promise.reject(Object.assign(new Error('fk'), { code: 'P2003' })),
} as unknown as PrismaClient;

const failure = async (run: () => Promise<unknown>) => {
  const error = await run().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiFailure);
  return error as ApiFailure;
};

describe('foreign key violations become unknown_reference (400)', () => {
  const update: TechniqueUpdateInput = {
    version: 1,
    slug: 'x-y',
    name: 'X',
    category: 'submission',
    level: 'beginner',
    gi: 'both',
    startPositionId: randomUUID(),
    endPositionId: null,
    keyPoints: [],
    commonMistakes: [],
    tagIds: [],
    chains: [],
    steps: [{ title: 'a', text: '', transitionMs: 1300, pose: STARTER_POSE }],
  };

  it('in createTechnique, updateTechnique and duplicateTechnique', async () => {
    const created = await failure(() =>
      createTechnique(racingPrisma, {
        slug: 'ab',
        name: 'X',
        category: 'submission',
        level: 'beginner',
        gi: 'both',
        startPositionId: randomUUID(),
        endPositionId: null,
      }),
    );
    const updated = await failure(() => updateTechnique(racingPrisma, randomUUID(), update));
    const duplicated = await failure(() => duplicateTechnique(racingPrisma, randomUUID()));
    for (const f of [created, updated, duplicated]) {
      expect(f.status).toBe(400);
      expect(f.reason).toBe('unknown_reference');
    }
  });
});

describe('a real foreign key violation is recognised', () => {
  const prisma = createPrisma(process.env.DATABASE_URL ?? '');
  afterAll(() => prisma.$disconnect());

  it('when a chain targets a technique that does not exist', async () => {
    const from = await createTestTechnique(prisma);
    try {
      const error = await prisma.chain
        .create({ data: { fromId: from.id, toId: randomUUID(), type: 'followup' } })
        .catch((e: unknown) => e);
      expect(isForeignKeyViolation(error)).toBe(true);
    } finally {
      await prisma.technique.delete({ where: { id: from.id } });
    }
  });
});
