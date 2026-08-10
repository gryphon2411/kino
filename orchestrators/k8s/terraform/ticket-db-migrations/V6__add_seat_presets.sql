CREATE TABLE kino_ticket.seat_presets (
    id uuid PRIMARY KEY,
    holder_subject text NOT NULL CHECK (btrim(holder_subject) <> ''),
    name text NOT NULL CHECK (
        name = btrim(name)
        AND char_length(name) BETWEEN 1 AND 40
    ),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT seat_presets_holder_subject_name_unique
        UNIQUE (holder_subject, name)
);

CREATE TABLE kino_ticket.seat_preset_seats (
    seat_preset_id uuid NOT NULL
        REFERENCES kino_ticket.seat_presets (id) ON DELETE CASCADE,
    seat_code text NOT NULL CHECK (seat_code ~ '^[A-D][1-5]$'),
    PRIMARY KEY (seat_preset_id, seat_code)
);

GRANT SELECT, INSERT, DELETE ON kino_ticket.seat_presets TO kino_ticket_runtime;
GRANT SELECT, INSERT ON kino_ticket.seat_preset_seats TO kino_ticket_runtime;
