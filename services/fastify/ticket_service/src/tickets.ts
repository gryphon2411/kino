import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { TicketConfig } from './config.js';
import { withTransaction, type TicketDatabase } from './database.js';
import { BadRequestError, ConflictError, NotFoundError } from './errors.js';
import {
  TicketRepository,
  type Reservation,
} from './ticket-repository.js';

export {
  reservationStates,
  type Reservation,
  type ReservationState,
  type Seat,
  type Screening,
} from './ticket-repository.js';

export class TicketService {
  private readonly repository: TicketRepository;

  constructor(
    private readonly database: TicketDatabase,
    private readonly config: TicketConfig
  ) {
    this.repository = new TicketRepository(database);
  }

  async screenings(titleId: string) {
    return this.repository.screenings(titleId);
  }

  async seats(screeningId: string, subject: string) {
    const screening = await this.repository.screening(screeningId);
    if (!screening) {
      throw new NotFoundError('The requested screening was not found.');
    }

    return {
      screening,
      seats: await this.repository.seats(screeningId, subject),
    };
  }

  async hold(
    screeningId: string,
    subject: string,
    seatCodes: string[],
    signal?: AbortSignal
  ): Promise<Reservation> {
    const allocateHold = async (client: PoolClient): Promise<Reservation> => {
      const screening = await this.repository.screeningForAllocation(client, screeningId);
      if (!screening) {
        throw new NotFoundError('The requested screening was not found.');
      }

      const lockedSeatCodes = await this.repository.lockSeats(client, screeningId, seatCodes);
      if (lockedSeatCodes.length !== seatCodes.length) {
        throw new BadRequestError('unknown_seat', 'One or more requested seats do not exist.');
      }

      // A conflicting hold can commit while this transaction waits for a seat
      // lock. Query the reservation state in a new statement so PostgreSQL's
      // Read Committed snapshot includes that committed allocation.
      if (await this.repository.hasActiveAllocation(client, screeningId, seatCodes)) {
        throw new ConflictError('seat_unavailable', 'One or more requested seats are unavailable.');
      }

      const reservationId = randomUUID();
      const reservation = await this.repository.createHold(
        client,
        reservationId,
        screeningId,
        subject,
        this.config.holdDurationSeconds,
        seatCodes
      );
      await this.repository.assignReservation(client, reservationId, screeningId, seatCodes);
      return reservation;
    };

    return withTransaction(this.database, this.config, allocateHold, signal);
  }

  async confirm(reservationId: string, subject: string, signal?: AbortSignal): Promise<Reservation> {
    const confirmReservation = async (client: PoolClient): Promise<Reservation> => {
      if (!(await this.repository.reservationIsOwned(client, reservationId, subject))) {
        throw new NotFoundError('The requested reservation was not found.');
      }

      const lockedSeatCodes = await this.repository.lockReservationSeats(client, reservationId);
      const reservation = await this.repository.reservationForConfirmation(
        client,
        reservationId,
        subject,
        lockedSeatCodes
      );
      if (!reservation) {
        throw new NotFoundError('The requested reservation was not found.');
      }
      if (reservation.state === 'CONFIRMED') {
        return reservation;
      }

      const confirmed = await this.repository.confirmHold(
        client,
        reservationId,
        subject,
        lockedSeatCodes
      );
      if (!confirmed) {
        throw new ConflictError('hold_expired', 'The ticket hold has expired.');
      }
      return confirmed;
    };

    return withTransaction(this.database, this.config, confirmReservation, signal);
  }
}
