CREATE TYPE kino_ticket.reservation_state AS ENUM ('HELD', 'CONFIRMED');

ALTER TABLE kino_ticket.reservations
    DROP CONSTRAINT reservations_state_check,
    DROP CONSTRAINT reservations_state_timestamp_check,
    ALTER COLUMN state TYPE kino_ticket.reservation_state
        USING state::text::kino_ticket.reservation_state,
    ADD CONSTRAINT reservations_state_timestamp_check CHECK (
        (state = 'HELD'::kino_ticket.reservation_state AND confirmed_at IS NULL)
        OR (state = 'CONFIRMED'::kino_ticket.reservation_state AND confirmed_at IS NOT NULL)
    );
