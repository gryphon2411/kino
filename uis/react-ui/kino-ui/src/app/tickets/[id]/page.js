'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { beginLogin } from '@/app/authentication';
import { refreshAfterWriteFailure } from './ticket-page-actions';

function ticketReturnTo(titleId) {
  return `/tickets/${encodeURIComponent(titleId)}`;
}

function formatCountdown(expiresAt, now) {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const seconds = Math.ceil(remaining / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function seatRowCode(seatCode) {
  return seatCode.replace(/\d+$/, '');
}

async function responseBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function TicketPage() {
  const pathname = usePathname();
  const titleId = pathname.split('/').pop();
  const [screening, setScreening] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [now, setNow] = useState(Date.now());

  const reauthenticateIfNeeded = useCallback(async (response, body) => {
    if (
      (response.status === 403 && body.code === 'insufficient_scope') ||
      (response.status === 401 && (
        body.code === 'authentication_required' ||
        body.code === 'ticket_reauthentication_required'
      ))
    ) {
      await beginLogin(ticketReturnTo(titleId));
      return true;
    }
    return false;
  }, [titleId]);

  const loadSeats = useCallback(async ({ preserveError = false } = {}) => {
    setLoading(true);
    if (!preserveError) {
      setError(null);
    }
    try {
      const screeningsResponse = await fetch(
        `/api/tickets/screenings?titleId=${encodeURIComponent(titleId)}`,
        { cache: 'no-store' }
      );
      const screeningsBody = await responseBody(screeningsResponse);
      if (await reauthenticateIfNeeded(screeningsResponse, screeningsBody)) {
        return;
      }
      if (!screeningsResponse.ok) {
        throw new Error(screeningsBody.error || 'Unable to load ticket screenings.');
      }
      const nextScreening = screeningsBody.screenings?.[0];
      if (!nextScreening) {
        throw new Error('No ticket screening is available for this title.');
      }
      setScreening(nextScreening);

      const seatsResponse = await fetch(
        `/api/tickets/screenings/${encodeURIComponent(nextScreening.id)}/seats`,
        { cache: 'no-store' }
      );
      const seatsBody = await responseBody(seatsResponse);
      if (await reauthenticateIfNeeded(seatsResponse, seatsBody)) {
        return;
      }
      if (!seatsResponse.ok) {
        throw new Error(seatsBody.error || 'Unable to load seats.');
      }
      setSeats(seatsBody.seats || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [reauthenticateIfNeeded, titleId]);

  useEffect(() => {
    void loadSeats();
  }, [loadSeats]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const holds = useMemo(() => {
    const grouped = new Map();
    seats.filter((seat) => seat.status === 'HELD_BY_YOU').forEach((seat) => {
      const current = grouped.get(seat.reservationId) || {
        id: seat.reservationId,
        expiresAt: seat.expiresAt,
        seatCodes: [],
      };
      current.seatCodes.push(seat.code);
      grouped.set(seat.reservationId, current);
    });
    return [...grouped.values()];
  }, [seats]);

  const seatRows = useMemo(() => {
    const rows = new Map();
    seats.forEach((seat) => {
      const rowCode = seatRowCode(seat.code);
      rows.set(rowCode, [...(rows.get(rowCode) || []), seat]);
    });
    return [...rows.entries()].map(([rowCode, rowSeats]) => ({ rowCode, rowSeats }));
  }, [seats]);

  const nextHoldExpiry = useMemo(() => holds
    .map((hold) => new Date(hold.expiresAt).getTime())
    .sort((left, right) => left - right)[0], [holds]);

  useEffect(() => {
    if (!nextHoldExpiry) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      setSelected([]);
      void loadSeats();
    }, Math.max(0, nextHoldExpiry - Date.now()) + 50);
    return () => window.clearTimeout(timeout);
  }, [loadSeats, nextHoldExpiry]);

  function toggleSeat(seat) {
    if (seat.status !== 'AVAILABLE' || submitting) {
      return;
    }
    if (!selected.includes(seat.code) && selected.length >= 8) {
      setError('A hold can contain at most eight seats.');
      return;
    }
    setSelected((current) => current.includes(seat.code)
      ? current.filter((code) => code !== seat.code)
      : [...current, seat.code].sort());
  }

  async function createHold() {
    if (!screening || selected.length === 0) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tickets/screenings/${encodeURIComponent(screening.id)}/holds`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seatCodes: selected }),
        }
      );
      const body = await responseBody(response);
      if (await reauthenticateIfNeeded(response, body)) {
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || 'Unable to hold the selected seats.');
      }
      setSelected([]);
      await loadSeats();
    } catch (holdError) {
      await refreshAfterWriteFailure(
        holdError,
        'Unable to hold the selected seats.',
        setError,
        loadSeats
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmHold(reservationId) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tickets/reservations/${encodeURIComponent(reservationId)}/confirm`,
        { method: 'POST' }
      );
      const body = await responseBody(response);
      if (await reauthenticateIfNeeded(response, body)) {
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || 'Unable to confirm the ticket hold.');
      }
      setConfirmation(body);
      await loadSeats();
    } catch (confirmError) {
      await refreshAfterWriteFailure(
        confirmError,
        'Unable to confirm the ticket hold.',
        setError,
        loadSeats
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !screening) {
    return <CircularProgress />;
  }

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 4 } }}>
      <Stack spacing={2}>
        <Box>
          <Typography component="h1" variant="h4">Tickets</Typography>
          <Typography color="text.secondary">
            Choose your seats and confirm your booking before the hold expires.
          </Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {confirmation && (
          <Alert severity="success">
            Booking confirmed for {confirmation.seatCodes.join(', ')}.
          </Alert>
        )}
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography component="h2" variant="h6" gutterBottom>Choose seats</Typography>
          <Box sx={{ mx: 'auto', maxWidth: 480 }}>
            <Typography
              align="center"
              color="text.secondary"
              sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}
            >
              Screen
            </Typography>
            <Box sx={{ bgcolor: 'divider', borderRadius: 1, height: 4, mb: 3, mt: 1, mx: 'auto', width: '70%' }} />
            <Stack spacing={1}>
              {seatRows.map(({ rowCode, rowSeats }) => (
                <Box
                  key={rowCode}
                  sx={{
                    alignItems: 'center',
                    display: 'grid',
                    gap: 1,
                    gridTemplateColumns: '24px repeat(2, minmax(40px, 1fr)) 16px repeat(3, minmax(40px, 1fr))',
                  }}
                >
                  <Typography align="center" color="text.secondary" variant="body2">{rowCode}</Typography>
                  {rowSeats.slice(0, 2).map((seat) => (
                    <SeatButton
                      key={seat.code}
                      seat={seat}
                      selected={selected.includes(seat.code)}
                      selectionLimitReached={selected.length >= 8}
                      submitting={submitting}
                      onClick={toggleSeat}
                    />
                  ))}
                  <Box aria-hidden="true" />
                  {rowSeats.slice(2).map((seat) => (
                    <SeatButton
                      key={seat.code}
                      seat={seat}
                      selected={selected.includes(seat.code)}
                      selectionLimitReached={selected.length >= 8}
                      submitting={submitting}
                      onClick={toggleSeat}
                    />
                  ))}
                </Box>
              ))}
            </Stack>
          </Box>
          <Button
            sx={{ mt: 2 }}
            variant="contained"
            disabled={selected.length === 0 || submitting}
            onClick={createHold}
          >
            Hold seats
          </Button>
          <Button sx={{ mt: 2, ml: 1 }} disabled={submitting} onClick={() => void loadSeats()}>
            Refresh seats
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Select up to eight seats. Holds expire after two minutes.
          </Typography>
        </Paper>
        {holds.map((hold) => (
          <Paper key={hold.id} variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography component="h2" variant="h6">Seats on hold</Typography>
            <Typography>{hold.seatCodes.join(', ')}</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Confirm within {formatCountdown(hold.expiresAt, now)}
            </Typography>
            <Button
              variant="contained"
              disabled={submitting || new Date(hold.expiresAt).getTime() <= now}
              onClick={() => confirmHold(hold.id)}
            >
              Confirm booking
            </Button>
          </Paper>
        ))}
      </Stack>
    </Container>
  );
}

function SeatButton({ seat, selected, selectionLimitReached, submitting, onClick }) {
  return (
    <Button
      aria-label={`Seat ${seat.code}, ${seat.status.toLowerCase().replace(/_/g, ' ')}`}
      disabled={seat.status !== 'AVAILABLE' || submitting || (!selected && selectionLimitReached)}
      color={seat.status === 'SOLD' ? 'error' : seat.status === 'HELD' ? 'warning' : 'primary'}
      onClick={() => onClick(seat)}
      sx={{ aspectRatio: '1', borderRadius: 1.5, minWidth: 0, p: 0 }}
      variant={selected ? 'contained' : 'outlined'}
    >
      {seat.code.replace(/^[A-Z]+/, '')}
    </Button>
  );
}
