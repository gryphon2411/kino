CREATE TABLE kino_ticket.screenings (
    id uuid PRIMARY KEY,
    title_id text NOT NULL,
    label text NOT NULL,
    starts_at timestamptz NOT NULL
);

CREATE TABLE kino_ticket.reservations (
    id uuid PRIMARY KEY,
    screening_id uuid NOT NULL REFERENCES kino_ticket.screenings (id),
    holder_subject text NOT NULL CHECK (btrim(holder_subject) <> ''),
    state text NOT NULL CHECK (state IN ('HELD', 'CONFIRMED')),
    hold_expires_at timestamptz NOT NULL,
    confirmed_at timestamptz,
    CONSTRAINT reservations_id_screening_unique UNIQUE (id, screening_id),
    CONSTRAINT reservations_state_timestamp_check CHECK (
        (state = 'HELD' AND confirmed_at IS NULL)
        OR (state = 'CONFIRMED' AND confirmed_at IS NOT NULL)
    )
);

CREATE TABLE kino_ticket.screening_seats (
    screening_id uuid NOT NULL REFERENCES kino_ticket.screenings (id),
    seat_code text NOT NULL,
    reservation_id uuid,
    PRIMARY KEY (screening_id, seat_code),
    CONSTRAINT screening_seats_reservation_screening_fk
        FOREIGN KEY (reservation_id, screening_id)
        REFERENCES kino_ticket.reservations (id, screening_id)
);

CREATE INDEX screening_seats_reservation_id_idx
    ON kino_ticket.screening_seats (reservation_id);

-- The lab deliberately uses one immutable screening. No Mongo cross-database
-- foreign key is needed: title_id is the source-catalogue reference.
INSERT INTO kino_ticket.screenings (id, title_id, label, starts_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'tt0000001',
    'Kino allocation lab',
    '2030-01-01T20:00:00Z'
);

INSERT INTO kino_ticket.screening_seats (screening_id, seat_code)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'A1'),
    ('00000000-0000-0000-0000-000000000001', 'A2'),
    ('00000000-0000-0000-0000-000000000001', 'A3'),
    ('00000000-0000-0000-0000-000000000001', 'A4'),
    ('00000000-0000-0000-0000-000000000001', 'A5'),
    ('00000000-0000-0000-0000-000000000001', 'B1'),
    ('00000000-0000-0000-0000-000000000001', 'B2'),
    ('00000000-0000-0000-0000-000000000001', 'B3'),
    ('00000000-0000-0000-0000-000000000001', 'B4'),
    ('00000000-0000-0000-0000-000000000001', 'B5'),
    ('00000000-0000-0000-0000-000000000001', 'C1'),
    ('00000000-0000-0000-0000-000000000001', 'C2'),
    ('00000000-0000-0000-0000-000000000001', 'C3'),
    ('00000000-0000-0000-0000-000000000001', 'C4'),
    ('00000000-0000-0000-0000-000000000001', 'C5');

GRANT SELECT ON kino_ticket.screenings TO kino_ticket_runtime;
GRANT SELECT, UPDATE (reservation_id)
    ON kino_ticket.screening_seats TO kino_ticket_runtime;
GRANT SELECT,
    INSERT (id, screening_id, holder_subject, state, hold_expires_at),
    UPDATE (state, confirmed_at)
    ON kino_ticket.reservations TO kino_ticket_runtime;
