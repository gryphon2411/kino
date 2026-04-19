"use client"
import { usePathname } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { useEffect } from 'react';
import { CircularProgress, Container, Grid, Card, CardContent, Typography, Button } from '@mui/material';
import { fetchTitle, setTitle, fetchFacts } from '@/app/titles/[id]/slice';

export default function TitlePage() {
  const pathname = usePathname();
  const id = pathname.split('/').pop();

  const dispatch = useDispatch();
  const title = useSelector((state) => state.title.title);
  const titles = useSelector((state) => state.titles.content);
  const facts = useSelector((state) => state.title.facts);

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
                Is Adult: {title.isAdult? 'Yes' : 'No'}
              </Typography>
              <Typography variant="body1" gutterBottom>
                Start Year: {title.startYear}
              </Typography>
              <Typography variant="body1" gutterBottom>
                End Year: {title.endYear}
              </Typography>
              <Typography variant="body1" gutterBottom>
                Runtime Minutes: {title.runtimeMinutes}
              </Typography>
              <Typography variant="body1" gutterBottom>
                Genres: {title.genres.join(', ')}
              </Typography>
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