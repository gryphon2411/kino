'use client'
import * as React from 'react';
import { useEffect, useState } from 'react';
import Image from "next/image";
import { useSelector, useDispatch } from 'react-redux';
import { useRouter } from 'next/router';
import { Container, TextField, Button, Box, Card, Snackbar, Alert } from '@mui/material';
import { clearError, setError } from '@/app/slice';

export default function LoginPage() {
  const dispatch = useDispatch();
  const error = useSelector((state) => state.app.error);
  const router = useRouter();
  const [csrf, setCsrf] = useState(null);

  useEffect(() => {
    if (router.query.error) {
      dispatch(setError('Invalid username or password.'));
    }
  }, [dispatch, router.query.error]);

  useEffect(() => {
    let active = true;
    fetch('/api/v1/auth/csrf', { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to prepare secure login.');
        }
        return response.json();
      })
      .then((token) => {
        if (active) {
          setCsrf(token);
        }
      })
      .catch((requestError) => {
        dispatch(setError(requestError.message));
      });
    return () => {
      active = false;
    };
  }, [dispatch]);

  const handleClose = (event, reason) => {
    dispatch(clearError());
  };

  return (
    <Container>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center', 
        height: '100vh' }}
      >
        <Card elevation={8}
        sx={{ 
          p: 2, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          maxWidth: '400px', 
          margin: 'auto' }}
        >
          <Image
            src="/logo-scaled.png"
            alt="Kino Logo"
            width={376}
            height={160}
            style={{ aspectRatio: "376 / 160" }}
            priority
          />
          <Box
            component="form"
            action="/api/v1/auth/login"
            method="post"
            sx={{ 
              mt: 2, 
              width: '100%', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center' }}
          >
            <TextField
              label="Username"
              name="username"
              margin="normal"
              required
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              name="password"
              margin="normal"
              required
              fullWidth
            />
            {csrf && (
              <input
                type="hidden"
                name={csrf.parameterName}
                value={csrf.token}
              />
            )}
            <Button type="submit" variant="contained" disabled={!csrf}
              sx={{ 
                mt: 3, 
                width: '100%' }}
              >
              Log In
            </Button>
          </Box>
        </Card>
      </Box>
      <Snackbar
        open={error !== null}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleClose} severity="error">{error}</Alert>
      </Snackbar>
    </Container>
  );
}
