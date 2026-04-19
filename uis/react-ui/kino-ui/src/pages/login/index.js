'use client'
import * as React from 'react';
import { useState } from 'react';
import Image from "next/image";
import { useSelector, useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { Container, TextField, Button, Box, Card, Snackbar, Alert, Checkbox, FormControlLabel} from '@mui/material';
import { loginUser } from '@/pages-slices/login/slice';
import { clearError } from '@/app/slice';

export default function LoginPage() {
  const dispatch = useDispatch();
  const error = useSelector((state) => state.app.error);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  
  const router = useRouter();
  const loginStatus = useSelector((state) => state.login.status);

  const handleClose = (event, reason) => {
    dispatch(clearError());
  };

  const handleLogin = (event) => {
    event.preventDefault();
    dispatch(loginUser({ username, password, rememberMe }));
  };

  if (loginStatus === 'succeeded') {
    router.push('/');
  }

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
            src="/logo.png"
            alt="Kino Logo"
            width={376}
            height={160}
            style={{ aspectRatio: "376 / 160" }}
            priority
          />
          <Box
            component="form"
            onSubmit={handleLogin}
            sx={{ 
              mt: 2, 
              width: '100%', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center' }}
          >
            <TextField
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              required
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              fullWidth
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  name="rememberMe"
                  color="primary"
                />
              }
              label="Remember me"
            />
            <Button type="submit" variant="contained" 
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
