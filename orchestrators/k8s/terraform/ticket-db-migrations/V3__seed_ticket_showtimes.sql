INSERT INTO kino_ticket.screenings (id, title_id, label, starts_at)
VALUES
    ('00000000-0000-0000-0000-000000000002', 'tt0000001', 'Kino allocation', '2030-01-02T20:00:00Z'),
    ('00000000-0000-0000-0000-000000000003', 'tt0000002', 'Kino allocation', '2030-01-01T18:00:00Z'),
    ('00000000-0000-0000-0000-000000000004', 'tt0000002', 'Kino allocation', '2030-01-02T18:00:00Z'),
    ('00000000-0000-0000-0000-000000000005', 'tt0000003', 'Kino allocation', '2030-01-01T16:00:00Z'),
    ('00000000-0000-0000-0000-000000000006', 'tt0000003', 'Kino allocation', '2030-01-02T16:00:00Z');

WITH new_screenings (screening_id) AS (
    VALUES
        ('00000000-0000-0000-0000-000000000002'::uuid),
        ('00000000-0000-0000-0000-000000000003'::uuid),
        ('00000000-0000-0000-0000-000000000004'::uuid),
        ('00000000-0000-0000-0000-000000000005'::uuid),
        ('00000000-0000-0000-0000-000000000006'::uuid)
), seat_codes (seat_code) AS (
    VALUES
        ('A1'), ('A2'), ('A3'), ('A4'), ('A5'),
        ('B1'), ('B2'), ('B3'), ('B4'), ('B5'),
        ('C1'), ('C2'), ('C3'), ('C4'), ('C5')
)
INSERT INTO kino_ticket.screening_seats (screening_id, seat_code)
SELECT new_screenings.screening_id, seat_codes.seat_code
  FROM new_screenings
 CROSS JOIN seat_codes
 ORDER BY new_screenings.screening_id, seat_codes.seat_code;
