import type { PoolClient, QueryResultRow } from 'pg';
import type { TicketDatabase } from './database.js';

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

type AllocationStateRow = QueryResultRow & {
  active_allocation: boolean;
};

type ReservationRow = QueryResultRow & {
  id: string;
  state: ReservationState;
  hold_expires_at: Date;
  confirmed_at: Date | null;
};

type QueryExecutor = Pick<PoolClient, 'query'>;

export type Screening = {
  id: string;
  titleId: string;
  label: string;
  startsAt: string;
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

function toScreening(row: ScreeningRow): Screening {
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

export class TicketRepository {
  constructor(private readonly database: TicketDatabase) {}

  async screenings(titleId: string): Promise<Screening[]> {
    const result = await this.database.query<ScreeningRow>(
      `SELECT id, title_id, label, starts_at
         FROM kino_ticket.screenings
        WHERE title_id = $1
        ORDER BY starts_at`,
      [titleId]
    );
    return result.rows.map(toScreening);
  }

  async screening(screeningId: string): Promise<Screening | undefined> {
    return this.findScreening(this.database, screeningId);
  }

  async screeningForAllocation(client: PoolClient, screeningId: string): Promise<Screening | undefined> {
    return this.findScreening(client, screeningId);
  }

  async seats(screeningId: string, subject: string): Promise<Seat[]> {
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

    return result.rows.map((row): Seat => ({
      code: row.seat_code,
      status: row.status,
      ...(row.reservation_id ? { reservationId: row.reservation_id } : {}),
      ...(row.hold_expires_at ? { expiresAt: row.hold_expires_at.toISOString() } : {}),
    }));
  }

  async lockSeats(client: PoolClient, screeningId: string, seatCodes: string[]): Promise<string[]> {
    const result = await client.query<{ seat_code: string }>(
      `SELECT s.seat_code
         FROM kino_ticket.screening_seats s
        WHERE s.screening_id = $1 AND s.seat_code = ANY($2::text[])
        ORDER BY s.seat_code
        FOR UPDATE OF s`,
      [screeningId, seatCodes]
    );
    return result.rows.map((seat) => seat.seat_code);
  }

  async hasActiveAllocation(client: PoolClient, screeningId: string, seatCodes: string[]): Promise<boolean> {
    const result = await client.query<AllocationStateRow>(
      `SELECT EXISTS (
         SELECT 1
           FROM kino_ticket.screening_seats s
           LEFT JOIN kino_ticket.reservations r ON r.id = s.reservation_id
          WHERE s.screening_id = $1
            AND s.seat_code = ANY($2::text[])
            AND (
              r.state = 'CONFIRMED'
              OR (r.state = 'HELD' AND r.hold_expires_at > clock_timestamp())
            )
       ) AS active_allocation`,
      [screeningId, seatCodes]
    );
    return result.rows[0].active_allocation;
  }

  async createHold(
    client: PoolClient,
    reservationId: string,
    screeningId: string,
    subject: string,
    holdDurationSeconds: number,
    seatCodes: string[]
  ): Promise<Reservation> {
    const result = await client.query<ReservationRow>(
      `INSERT INTO kino_ticket.reservations (
         id, screening_id, holder_subject, state, hold_expires_at
       ) VALUES (
         $1, $2, $3, 'HELD', clock_timestamp() + make_interval(secs => $4)
       )
       RETURNING id, state, hold_expires_at, confirmed_at`,
      [reservationId, screeningId, subject, holdDurationSeconds]
    );
    return toReservation(result.rows[0], [...seatCodes].sort());
  }

  async assignReservation(
    client: PoolClient,
    reservationId: string,
    screeningId: string,
    seatCodes: string[]
  ): Promise<void> {
    await client.query(
      `UPDATE kino_ticket.screening_seats
          SET reservation_id = $1
        WHERE screening_id = $2 AND seat_code = ANY($3::text[])`,
      [reservationId, screeningId, seatCodes]
    );
  }

  async reservationIsOwned(client: PoolClient, reservationId: string, subject: string): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT id
         FROM kino_ticket.reservations
        WHERE id = $1 AND holder_subject = $2`,
      [reservationId, subject]
    );
    return result.rowCount === 1;
  }

  async lockReservationSeats(client: PoolClient, reservationId: string): Promise<string[]> {
    const result = await client.query<{ seat_code: string }>(
      `SELECT seat_code
         FROM kino_ticket.screening_seats
        WHERE reservation_id = $1
        ORDER BY seat_code
        FOR UPDATE`,
      [reservationId]
    );
    return result.rows.map((seat) => seat.seat_code);
  }

  async reservationForConfirmation(
    client: PoolClient,
    reservationId: string,
    subject: string,
    seatCodes: string[]
  ): Promise<Reservation | undefined> {
    const result = await client.query<ReservationRow>(
      `SELECT id, state, hold_expires_at, confirmed_at
         FROM kino_ticket.reservations
        WHERE id = $1 AND holder_subject = $2
        FOR UPDATE`,
      [reservationId, subject]
    );
    return result.rowCount === 1 ? toReservation(result.rows[0], seatCodes) : undefined;
  }

  async confirmHold(
    client: PoolClient,
    reservationId: string,
    subject: string,
    seatCodes: string[]
  ): Promise<Reservation | undefined> {
    const result = await client.query<ReservationRow>(
      `UPDATE kino_ticket.reservations
          SET state = 'CONFIRMED', confirmed_at = clock_timestamp()
        WHERE id = $1
          AND holder_subject = $2
          AND state = 'HELD'
          AND hold_expires_at > clock_timestamp()
      RETURNING id, state, hold_expires_at, confirmed_at`,
      [reservationId, subject]
    );
    return result.rowCount === 1 ? toReservation(result.rows[0], seatCodes) : undefined;
  }

  private async findScreening(
    executor: QueryExecutor,
    screeningId: string
  ): Promise<Screening | undefined> {
    const result = await executor.query<ScreeningRow>(
      `SELECT id, title_id, label, starts_at
         FROM kino_ticket.screenings
        WHERE id = $1`,
      [screeningId]
    );
    return result.rowCount === 1 ? toScreening(result.rows[0]) : undefined;
  }
}
