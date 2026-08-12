'use client';

import { useRouter } from 'next/navigation';
import { ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

export default function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.logoutUrl) {
      window.location.assign(body.logoutUrl);
    } else {
      router.replace('/');
      router.refresh();
    }
  };

  return (
    <ListItem disablePadding>
      <ListItemButton onClick={logout}>
        <ListItemIcon>
          <LogoutIcon />
        </ListItemIcon>
        <ListItemText primary="Logout" />
      </ListItemButton>
    </ListItem>
  );
}
