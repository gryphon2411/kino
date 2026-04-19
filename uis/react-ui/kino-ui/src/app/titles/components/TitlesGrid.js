import { useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  Grid, CircularProgress, Card, CardContent, CardMedia, CardActionArea, Typography 
} from '@mui/material';
import Link from 'next/link';
import LocalMoviesIcon from '@mui/icons-material/LocalMovies';
import { fetchTitles, setPage } from '@/app/titles/slice';


export default function TitlesGrid() {
  const dispatch = useDispatch();
  const titles = useSelector((state) => state.titles.content);
  const page = useSelector((state) => state.titles.page);
  const status = useSelector((state) => state.titles.status);

  const handleInfinitScroll = useCallback(() => {
    if (window.innerHeight + document.documentElement.scrollTop !== document.documentElement.offsetHeight) {
      return; 
    }
  
    dispatch(setPage(page + 1));
    dispatch(fetchTitles());
  }, [dispatch, page]);

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchTitles());
    }
  }, [status, dispatch]);

  useEffect(() => {
    window.addEventListener('scroll', handleInfinitScroll);
    return () => window.removeEventListener('scroll', handleInfinitScroll);
  }, [handleInfinitScroll]);

  return (
    <div>
      <Grid container spacing={3}>
        {titles.map((title, index) => (
          <Grid item key={title.id} xs={12} sm={6} md={4} lg={4}>
            <Link style={{ textDecoration: 'none' }} href={`/titles/${title.id}`} passHref>
              <Card>
                <CardActionArea>
                  <CardMedia component={() => <LocalMoviesIcon sx={{ fontSize: 50 }} />} />
                  <CardContent>
                    <Typography variant="h5">{title.primaryTitle}</Typography>
                    <Typography variant="subtitle1" color="text.secondary">{title.titleType}</Typography>
                    <Typography variant="body2">{title.startYear}</Typography>
                    <Typography variant="body2">{title.genres.join(', ')}</Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Link>
          </Grid>
        ))}
      </Grid>
      {status === 'loading' && <CircularProgress />}
    </div>
  );
};
