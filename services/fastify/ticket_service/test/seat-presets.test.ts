import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '../src/generated/prisma/client.js';
import { PrismaSeatPresetRepository } from '../src/prisma-seat-preset-repository.js';
import {
  type SeatPresetRepository,
  SeatPresetService,
} from '../src/seat-presets.js';
import {
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
} from '../src/errors.js';

function repository(overrides: Partial<SeatPresetRepository> = {}): SeatPresetRepository {
  return {
    list: async () => [],
    create: async (_subject, request) => ({
      id: '00000000-0000-0000-0000-000000000098',
      ...request,
    }),
    delete: async () => true,
    ready: async () => undefined,
    ...overrides,
  };
}

test('saved seat group policy normalizes names and seat order before persistence', async () => {
  const created: { subject: string; name: string; seatCodes: string[] }[] = [];
  const service = new SeatPresetService(repository({
    create: async (subject, request) => {
      created.push({ subject, ...request });
      return { id: '00000000-0000-0000-0000-000000000098', ...request };
    },
  }));

  const preset = await service.create('opaque-subject', {
    name: '  Our aisle seats  ',
    seatCodes: ['A3', 'A2'],
  });

  assert.deepEqual(created, [{
    subject: 'opaque-subject',
    name: 'Our aisle seats',
    seatCodes: ['A2', 'A3'],
  }]);
  assert.deepEqual(preset.seatCodes, ['A2', 'A3']);
});

test('saved seat group policy rejects invalid normalized names and codes', async () => {
  const service = new SeatPresetService(repository());

  await assert.rejects(
    async () => service.create('opaque-subject', { name: '   ', seatCodes: ['A1'] }),
    (error: unknown) => error instanceof BadRequestError && error.code === 'invalid_preset_name'
  );
  await assert.rejects(
    async () => service.create('opaque-subject', { name: 'x'.repeat(41), seatCodes: ['A1'] }),
    (error: unknown) => error instanceof BadRequestError && error.code === 'invalid_preset_name'
  );
  await assert.rejects(
    async () => service.create('opaque-subject', { name: 'Usual seats', seatCodes: ['A1', 'A1'] }),
    (error: unknown) => error instanceof BadRequestError && error.code === 'invalid_seat_codes'
  );
  await assert.rejects(
    async () => service.create('opaque-subject', { name: 'Usual seats', seatCodes: ['E1'] }),
    (error: unknown) => error instanceof BadRequestError && error.code === 'invalid_seat_codes'
  );
});

test('Prisma repository maps only the named saved-seat-group duplicate constraint', async () => {
  const namedDuplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '7.9.1',
    meta: { target: 'seat_presets_holder_subject_name_unique' },
  });
  const repositoryWithDuplicate = new PrismaSeatPresetRepository({
    seatPreset: {
      create: async () => {
        throw namedDuplicate;
      },
    },
  } as never);

  await assert.rejects(
    repositoryWithDuplicate.create('opaque-subject', { name: 'Usual seats', seatCodes: ['A1'] }),
    (error: unknown) => error instanceof ConflictError && error.code === 'preset_name_taken'
  );

  const unknownDuplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '7.9.1',
    meta: { target: 'some_future_unique_constraint' },
  });
  const repositoryWithUnknownDuplicate = new PrismaSeatPresetRepository({
    seatPreset: {
      create: async () => {
        throw unknownDuplicate;
      },
    },
  } as never);
  await assert.rejects(
    repositoryWithUnknownDuplicate.create('opaque-subject', { name: 'Usual seats', seatCodes: ['A1'] }),
    (error: unknown) => error === unknownDuplicate
  );
});

test('Prisma repository maps retryable client failures to service unavailable', async () => {
  const unavailable = new Prisma.PrismaClientKnownRequestError('database unreachable', {
    code: 'P1001',
    clientVersion: '7.9.1',
  });
  const prismaRepository = new PrismaSeatPresetRepository({
    seatPreset: {
      findMany: async () => {
        throw unavailable;
      },
    },
  } as never);

  await assert.rejects(prismaRepository.list('opaque-subject'), ServiceUnavailableError);
});
