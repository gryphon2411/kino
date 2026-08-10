import {
  Prisma,
  type PrismaClient,
} from './generated/prisma/client.js';
import {
  ConflictError,
  ServiceUnavailableError,
} from './errors.js';
import type {
  CreateSeatPreset,
  SeatPreset,
  SeatPresetRepository,
} from './seat-presets.js';

const ownerNameUniqueConstraint = 'seat_presets_holder_subject_name_unique';

type SeatPresetRow = {
  id: string;
  name: string;
  seats: { seatCode: string }[];
};

function toSeatPreset(row: SeatPresetRow): SeatPreset {
  return {
    id: row.id,
    name: row.name,
    seatCodes: row.seats.map((seat) => seat.seatCode),
  };
}

function isOwnerNameUniqueTarget(target: unknown): boolean {
  if (target === ownerNameUniqueConstraint) {
    return true;
  }
  if (!Array.isArray(target) || target.length !== 2 || target[1] !== 'name') {
    return false;
  }
  return target[0] === 'holder_subject' || target[0] === 'holderSubject';
}

function isOwnerNameUniqueError(error: Prisma.PrismaClientKnownRequestError): boolean {
  if (isOwnerNameUniqueTarget(error.meta?.target)) {
    return true;
  }
  // PrismaPg currently omits P2002 metadata for this PostgreSQL constraint.
  // Its database-field message still identifies this exact two-column unique
  // constraint, while an `id` or future unique constraint remains unexpected.
  return error.message.includes('(`holder_subject`, `name`)');
}

function translatePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002' && isOwnerNameUniqueError(error)) {
      throw new ConflictError(
        'preset_name_taken',
        'A saved seat group with that name already exists.'
      );
    }
    if (['P1001', 'P1008', 'P2024', 'P2037'].includes(error.code)) {
      throw new ServiceUnavailableError();
    }
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    throw new ServiceUnavailableError();
  }
  throw error;
}

export class PrismaSeatPresetRepository implements SeatPresetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(subject: string): Promise<SeatPreset[]> {
    try {
      const presets = await this.prisma.seatPreset.findMany({
        where: { holderSubject: subject },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          seats: {
            orderBy: { seatCode: 'asc' },
            select: { seatCode: true },
          },
        },
      });
      return presets.map(toSeatPreset);
    } catch (error) {
      return translatePrismaError(error);
    }
  }

  async create(subject: string, request: CreateSeatPreset): Promise<SeatPreset> {
    try {
      const preset = await this.prisma.seatPreset.create({
        data: {
          holderSubject: subject,
          name: request.name,
          seats: {
            create: request.seatCodes.map((seatCode) => ({ seatCode })),
          },
        },
        select: {
          id: true,
          name: true,
          seats: {
            orderBy: { seatCode: 'asc' },
            select: { seatCode: true },
          },
        },
      });
      return toSeatPreset(preset);
    } catch (error) {
      return translatePrismaError(error);
    }
  }

  async delete(subject: string, presetId: string): Promise<boolean> {
    try {
      const result = await this.prisma.seatPreset.deleteMany({
        where: { id: presetId, holderSubject: subject },
      });
      return result.count === 1;
    } catch (error) {
      return translatePrismaError(error);
    }
  }

  async ready(): Promise<void> {
    try {
      await this.prisma.seatPreset.findFirst({ select: { id: true } });
    } catch (error) {
      return translatePrismaError(error);
    }
  }
}
