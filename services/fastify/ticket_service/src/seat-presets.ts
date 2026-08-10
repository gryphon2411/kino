import {
  BadRequestError,
  NotFoundError,
} from './errors.js';
import { isSeatCode } from './seat-code.js';

export type SeatPreset = {
  id: string;
  name: string;
  seatCodes: string[];
};

export type CreateSeatPreset = {
  name: string;
  seatCodes: string[];
};

export interface SeatPresetOperations {
  list(subject: string): Promise<SeatPreset[]>;
  create(subject: string, request: CreateSeatPreset): Promise<SeatPreset>;
  delete(subject: string, presetId: string): Promise<void>;
}

export interface SeatPresetReadiness {
  ready(): Promise<void>;
}

export interface SeatPresetRepository {
  list(subject: string): Promise<SeatPreset[]>;
  create(subject: string, request: CreateSeatPreset): Promise<SeatPreset>;
  delete(subject: string, presetId: string): Promise<boolean>;
  ready(): Promise<void>;
}

function normalizedName(name: string): string {
  const normalized = name.trim();
  const characterCount = Array.from(normalized).length;
  if (characterCount < 1 || characterCount > 40) {
    throw new BadRequestError(
      'invalid_preset_name',
      'A saved seat group name must contain between one and 40 characters.'
    );
  }
  return normalized;
}

function normalizedSeatCodes(seatCodes: string[]): string[] {
  if (seatCodes.length < 1 || seatCodes.length > 8) {
    throw new BadRequestError(
      'invalid_seat_codes',
      'A saved seat group must contain between one and eight seats.'
    );
  }
  if (seatCodes.some((seatCode) => !isSeatCode(seatCode))) {
    throw new BadRequestError(
      'invalid_seat_codes',
      'A saved seat group contains an unsupported seat code.'
    );
  }
  const uniqueSeatCodes = [...new Set(seatCodes)].sort();
  if (uniqueSeatCodes.length !== seatCodes.length) {
    throw new BadRequestError(
      'invalid_seat_codes',
      'A saved seat group cannot contain the same seat twice.'
    );
  }
  return uniqueSeatCodes;
}

export class SeatPresetService implements SeatPresetOperations, SeatPresetReadiness {
  constructor(private readonly repository: SeatPresetRepository) {}

  list(subject: string): Promise<SeatPreset[]> {
    return this.repository.list(subject);
  }

  async create(subject: string, request: CreateSeatPreset): Promise<SeatPreset> {
    return this.repository.create(subject, {
      name: normalizedName(request.name),
      seatCodes: normalizedSeatCodes(request.seatCodes),
    });
  }

  async delete(subject: string, presetId: string): Promise<void> {
    if (!await this.repository.delete(subject, presetId)) {
      throw new NotFoundError('The requested saved seat group was not found.');
    }
  }

  ready(): Promise<void> {
    return this.repository.ready();
  }
}
