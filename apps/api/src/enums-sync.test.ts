import {
  CATEGORIES,
  CHAIN_TYPES,
  GI_MODES,
  LEVELS,
  POSITION_ROLES,
  TECHNIQUE_STATUSES,
} from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import {
  Category,
  ChainType,
  GiMode,
  Level,
  PositionRole,
  TechniqueStatus,
} from './generated/prisma/enums';

const sorted = (values: readonly string[]) => [...values].sort();

describe('Prisma enums match @tatamap/shared', () => {
  it.each([
    ['Category', Category, CATEGORIES],
    ['Level', Level, LEVELS],
    ['GiMode', GiMode, GI_MODES],
    ['PositionRole', PositionRole, POSITION_ROLES],
    ['TechniqueStatus', TechniqueStatus, TECHNIQUE_STATUSES],
    ['ChainType', ChainType, CHAIN_TYPES],
  ])('%s', (_name, prismaEnum, shared) => {
    expect(sorted(Object.values(prismaEnum))).toEqual(sorted(shared));
  });
});
