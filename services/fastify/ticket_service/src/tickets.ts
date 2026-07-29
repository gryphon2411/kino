import { randomUUID } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import type { TicketConfig } from './config.js';
import { withTransaction, type TicketDatabase } from './database.js';
import { BadRequestError, ConflictError, NotFoundError } from './errors.js';

export const reservationStates = ['HELD', 'CONFIRMED'] as const;
export type ReservationState = (typeof reservationStates)[number];

type ScreeningRow = QueryResultRow & {
  id: string;
  title_id: string;
  label: string;
  starts_at: Date;
};

type SeatRow = QueryResultRow & {
  seat_code: string;
  status: 'AVAILABLE' | 'HELD' | 'HELD_BY_YOU' | 'SOLD';
  reservation_id: string | null;
  hold_expires_at: Date | null;
};

type LockedSeatRow = QueryResultRow & {
  seat_code: string;
};

type AllocationStateRow = QueryResultRow & {
  active_allocation: boolean;
};

type ReservationRow = QueryResultRow & {
  id: string;
  state: ReservationState;
  hold_expires_at: Date;
  confirmed_at: Date | null;
};

export type Seat = {
  code: string;
  status: 'AVAILABLE' | 'HELD' | 'HELD_BY_YOU' | 'SOLD';
  reservationId?: string;
  expiresAt?: string;
};

export type Reservation = {
  id: string;
  state: ReservationState;
  expiresAt: string;
  confirmedAt?: string;
  seatCodes: string[];
};

function toScreening(row: ScreeningRow) {
  return {
    id: row.id,
    titleId: row.title_id,
    label: row.label,
    startsAt: row.starts_at.toISOString(),
  };
}

function toReservation(row: ReservationRow, seatCodes: string[]): Reservation {
  return {
    id: row.id,
    state: row.state,
    expiresAt: row.hold_expires_at.toISOString(),
    ...(row.confirmed_at ? { confirmedAt: row.confirmed_at.toISOString() } : {}),
    seatCodes,
  };
}

async function screeningForId(client: PoolClient, screeningId: string): Promise<ScreeningRow> {
  const result = await client.query<ScreeningRow>(
    `SELECT id, title_id, label, starts_at
       FROM kino_ticket.screenings
      WHERE id = $1`,
    [screeningId]
  );
  if (result.rowCount !== 1) {
    throw new NotFoundError('The requested screening was not found.');
  }
  return result.rows[0];
}

export class TicketService {
  constructor(
    private readonly database: TicketDatabase,
    private readonly config: TicketConfig
  ) {}

  async screenings(titleId: string) {
    const result = await this.database.query<ScreeningRow>(
      `SELECT id, title_id, label, starts_at
         FROM kino_ticket.screenings
        WHERE title_id = $1
        ORDER BY starts_at`,
      [titleId]
    );
    return result.rows.map(toScreening);
  }

  async seats(screeningId: string, subject: string) {
    const screen = await this.database.query<ScreeningRow>(
      `SELECT id, title_id, label, starts_at
         FROM kino_ticket.screenings
        WHERE id = $1`,
      [screeningId]
    );
    if (screen.rowCount !== 1) {
      throw new NotFoundError('The requested screening was not found.');
    }

    const result = await this.database.query<SeatRow>(
      `SELECT s.seat_code,
              CASE
                WHEN r.id IS NULL OR (r.state = 'HELD' AND r.hold_expires_at <= clock_timestamp())
                  THEN 'AVAILABLE'
                WHEN r.state = 'CONFIRMED' THEN 'SOLD'
                WHEN r.holder_subject = $2 THEN 'HELD_BY_YOU'
                ELSE 'HELD'
              END AS status,
              CASE
                WHEN r.state = 'HELD' AND r.hold_expires_at > clock_timestamp()
                  AND r.holder_subject = $2 THEN r.id
                ELSE NULL
              END AS reservation_id,
              CASE
                WHEN r.state = 'HELD' AND r.hold_expires_at > clock_timestamp()
                  AND r.holder_subject = $2 THEN r.hold_expires_at
                ELSE NULL
              END AS hold_expires_at
         FROM kino_ticket.screening_seats s
         LEFT JOIN kino_ticket.reservations r ON r.id = s.reservation_id
        WHERE s.screening_id = $1
        ORDER BY s.seat_code`,
      [screeningId, subject]
    );

    return {
      screening: toScreening(screen.rows[0]),
      seats: result.rows.map((row): Seat => ({
        code: row.seat_code,
        status: row.status,
        ...(row.reservation_id ? { reservationId: row.reservation_id } : {}),
        ...(row.hold_expires_at ? { expiresAt: row.hold_expires_at.toISOString() } : {}),
      })),
    };
  }

  async hold(
    screeningId: string,
    subject: string,
    seatCodes: string[],
    signal?: AbortSignal
  ): Promise<Reservation> {
    return withTransaction(
      this.database,
      this.config,
      async (client) => {
        await screeningForId(client, screeningId);
        const lockedSeats = await client.query<LockedSeatRow>(
          `SELECT s.seat_code
             FROM kino_ticket.screening_seats s
            WHERE s.screening_id = $1 AND s.seat_code = ANY($2::text[])
            ORDER BY s.seat_code
            FOR UPDATE OF s`,
          [screeningId, seatCodes]
        );
        if (lockedSeats.rowCount !== seatCodes.length) {
          throw new BadRequestError('unknown_seat', 'One or more requested seats do not exist.');
        }
        // A conflicting hold can commit while this transaction waits for a seat
        // lock. Query the reservation state in a new statement so PostgreSQL's
        // Read Committed snapshot includes that committed allocation.
        const allocationStates = await client.query<AllocationStateRow>(
          `SELECT CASE
                    WHEN r.id IS NULL THEN FALSE
                    WHEN r.state = 'CONFIRMED' THEN TRUE
                    WHEN r.state = 'HELD' AND r.hold_expires_at > clock_timestamp() THEN TRUE
                    ELSE FALSE
                  END AS active_allocation
             FROM kino_ticket.screening_seats s
             LEFT JOIN kino_ticket.reservations r ON r.id = s.reservation_id
            WHERE s.screening_id = $1 AND s.seat_code = ANY($2::text[])
            ORDER BY s.seat_code`,
          [screeningId, seatCodes]
        );
        if (allocationStates.rows.some((seat) => seat.active_allocation)) {
          throw new ConflictError('seat_unavailable', 'One or more requested seats are unavailable.');
        }

        const reservationId = randomUUID();
        const reservation = await client.query<ReservationRow>(
          `INSERT INTO kino_ticket.reservations (
             id, screening_id, holder_subject, state, hold_expires_at
           ) VALUES (
             $1, $2, $3, 'HELD', clock_timestamp() + make_interval(secs => $4)
           )
           RETURNING id, state, hold_expires_at, confirmed_at`,
          [reservationId, screeningId, subject, this.config.holdDurationSeconds]
        );
        await client.query(
          `UPDATE kino_ticket.screening_seats
              SET reservation_id = $1
            WHERE screening_id = $2 AND seat_code = ANY($3::text[])`,
          [reservationId, screeningId, seatCodes]
        );
        return toReservation(reservation.rows[0], [...seatCodes].sort());
      },
      signal
    );
  }

  async confirm(reservationId: string, subject: string, signal?: AbortSignal): Promise<Reservation> {
    const confirmReservation = async (client: PoolClient): Promise<Reservation> => {
      const ownedReservation = await client.query<{ id: string }>(
        `SELECT id
           FROM kino_ticket.reservations
          WHERE id = $1 AND holder_subject = $2`,
        [reservationId, subject]
      );
      if (ownedReservation.rowCount !== 1) {
        throw new NotFoundError('The requested reservation was not found.');
      }

      const lockedSeats = await client.query<{ seat_code: string }>(
        `SELECT seat_code
           FROM kino_ticket.screening_seats
          WHERE reservation_id = $1
          ORDER BY seat_code
          FOR UPDATE`,
        [reservationId]
      );
      const parent = await client.query<ReservationRow>(
        `SELECT id, state, hold_expires_at, confirmed_at
           FROM kino_ticket.reservations
          WHERE id = $1 AND holder_subject = $2
          FOR UPDATE`,
        [reservationId, subject]
      );
      if (parent.rowCount !== 1) {
        throw new NotFoundError('The requested reservation was not found.');
      }
      if (parent.rows[0].state === 'CONFIRMED') {
        return toReservation(parent.rows[0], lockedSeats.rows.map((seat) => seat.seat_code));
      }

      const confirmed = await client.query<ReservationRow>(
        `UPDATE kino_ticket.reservations
            SET state = 'CONFIRMED', confirmed_at = clock_timestamp()
          WHERE id = $1
            AND holder_subject = $2
            AND state = 'HELD'
            AND hold_expires_at > clock_timestamp()
        RETURNING id, state, hold_expires_at, confirmed_at`,
        [reservationId, subject]
      );
      if (confirmed.rowCount !== 1) {
        throw new ConflictError('hold_expired', 'The ticket hold has expired.');
      }
      return toReservation(confirmed.rows[0], lockedSeats.rows.map((seat) => seat.seat_code));
    };

    return withTransaction(
      this.database,
      this.config,
      confirmReservation,
      signal
    );
  }
}
