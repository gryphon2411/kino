"use client"
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useState } from 'react';
import { Button, CircularProgress, Container, Grid, Card, CardContent, Typography } from '@mui/material';
import { fetchTitle, setTitle, fetchFacts } from '@/app/titles/[id]/slice';

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

export default function TitlePage() {
  const pathname = usePathname();
  const id = pathname.split('/').pop();

  const dispatch = useDispatch();
  const title = useSelector((state) => state.title.title);
  const titles = useSelector((state) => state.titles.content);
  const facts = useSelector((state) => state.title.facts);
  const [ticketServiceEnabled, setTicketServiceEnabled] = useState(false);

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
    fetch('/api/tickets/status', { cache: 'no-store' })
      .then((response) => response.json())
      .then((status) => {
        if (active) {
          setTicketServiceEnabled(status.enabled === true);
        }
      })
      .catch(() => {
        if (active) {
          setTicketServiceEnabled(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

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
              {id === 'tt0000001' && ticketServiceEnabled && (
                <Button component={Link} href={`/tickets/${id}`} variant="contained" sx={{ my: 2 }}>
                  Book tickets
                </Button>
              )}
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
