INSERT INTO kino_ticket.screenings (id, title_id, label, starts_at)
VALUES (
    '00000000-0000-0000-0000-000000000007',
    'tt0000001',
    'Kino allocation',
    '2030-01-03T20:00:00Z'
);

WITH row_codes (row_code) AS (
    VALUES ('A'), ('B'), ('C'), ('D')
), seat_numbers (seat_number) AS (
    VALUES (1), (2), (3), (4), (5)
)
INSERT INTO kino_ticket.screening_seats (screening_id, seat_code)
SELECT '00000000-0000-0000-0000-000000000007'::uuid,
       row_codes.row_code || seat_numbers.seat_number::text
  FROM row_codes
 CROSS JOIN seat_numbers
 ORDER BY row_codes.row_code, seat_numbers.seat_number;
