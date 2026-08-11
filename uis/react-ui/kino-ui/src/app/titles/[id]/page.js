"use client"
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useState } from 'react';
import { Button, CircularProgress, Container, Grid, Card, CardContent, Typography } from '@mui/material';
import { beginLogin } from '@/app/authentication';
import { fetchTitle, setTitle, fetchFacts } from '@/app/titles/[id]/slice';
import ViewingPlanControl from './ViewingPlanControl';

function formatGenres(genres) {
  if (!Array.isArray(genres) || genres.length === 0) {
    return 'Unknown';
  }
  return genres.join(', ');
}

function formatNullable(value) {
  return value ?? 'Unknown';
}

function formatAdultFlag(value) {
  if (value == null) {
    return 'Unknown';
  }
  return value ? 'Yes' : 'No';
}

async function responseBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function ticketReauthenticationRequired(response, body) {
  return (response.status === 403 && body.code === 'insufficient_scope')
    || (response.status === 401 && (
      body.code === 'authentication_required'
      || body.code === 'ticket_reauthentication_required'
    ));
}

export default function TitlePage() {
  const pathname = usePathname();
  const id = pathname.split('/').pop();

  const dispatch = useDispatch();
  const title = useSelector((state) => state.title.title);
  const titles = useSelector((state) => state.titles.content);
  const facts = useSelector((state) => state.title.facts);
  const [ticketShowtimeCount, setTicketShowtimeCount] = useState(0);

  useEffect(() => {
    if (title && title.id !== id) {
      dispatch(setTitle(null));
    }

    if (!title) {
      const foundTitle = titles.find((title) => title.id === id);
      if (foundTitle) {
        dispatch(setTitle(foundTitle));
      } else {
        dispatch(fetchTitle({ id }));
      }
    }

    if (!facts) {
      dispatch(fetchFacts({ id }));
    }
  }, [dispatch, id, title, titles, facts]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadTicketShowtimes() {
      setTicketShowtimeCount(0);
      try {
        const statusResponse = await fetch('/api/tickets/status', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const status = await responseBody(statusResponse);
        if (!statusResponse.ok || status.enabled !== true || !active) {
          return;
        }

        const screeningsResponse = await fetch(
          `/api/tickets/screenings?titleId=${encodeURIComponent(id)}`,
          { cache: 'no-store', signal: controller.signal }
        );
        const screenings = await responseBody(screeningsResponse);
        if (!active) {
          return;
        }
        if (ticketReauthenticationRequired(screeningsResponse, screenings)) {
          await beginLogin(`/titles/${encodeURIComponent(id)}`);
          return;
        }
        if (!screeningsResponse.ok) {
          return;
        }
        setTicketShowtimeCount(Array.isArray(screenings.screenings)
          ? screenings.screenings.length
          : 0);
      } catch {
        if (active) {
          setTicketShowtimeCount(0);
        }
      }
    }

    void loadTicketShowtimes();
    return () => {
      active = false;
      controller.abort();
    };
  }, [id]);

  if (!title) {
    return <CircularProgress />;
  }

  return (
    <Container sx={{ padding: 2, margin: 2 }}>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <Card sx={{ padding: 2, margin: 2 }}>
            <CardContent>
              <Typography variant="h2" gutterBottom>
                {title.primaryTitle}
              </Typography>
              <Typography variant="body1" gutterBottom>
                Type: {title.titleType}
              </Typography>
              <Typography variant="body1" gutterBottom>
                Original Title: {title.originalTitle}
              </Typography>
              <Typography variant="body1" gutterBottom>
                Is Adult: {formatAdultFlag(title.isAdult)}
              </Typography>
              <Typography variant="body1" gutterBottom>
                Start Year: {formatNullable(title.startYear)}
              </Typography>
              <Typography variant="body1" gutterBottom>
                End Year: {formatNullable(title.endYear)}
              </Typography>
              <Typography variant="body1" gutterBottom>
                Runtime Minutes: {formatNullable(title.runtimeMinutes)}
              </Typography>
              <Typography variant="body1" gutterBottom>
                Genres: {formatGenres(title.genres)}
              </Typography>
              {title.id === id && ticketShowtimeCount > 0 && (
                <Button component={Link} href={`/tickets/${id}`} variant="contained" sx={{ my: 2 }}>
                  Book tickets · {ticketShowtimeCount} {ticketShowtimeCount === 1 ? 'showtime' : 'showtimes'}
                </Button>
              )}
              {title.id === id && <ViewingPlanControl titleId={id} />}
              <Typography variant="body1" gutterBottom>
                Facts:
              </Typography>
              {facts? (
                <Typography variant="body1" style={{ whiteSpace: 'pre-wrap' }} gutterBottom>
                  {facts}
                </Typography>
              ) : (
                <CircularProgress />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
