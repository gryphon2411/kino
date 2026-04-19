import * as React from 'react';
import { StoreProvider } from '@/store/provider';
import Link from 'next/link';
import { AppBar, Toolbar, Typography, Drawer, Divider, List, ListItem, ListItemButton,
ListItemIcon, ListItemText } from '@mui/material';
import LocalMoviesIcon from '@mui/icons-material/LocalMovies';
import DashboardIcon from '@mui/icons-material/Dashboard';
import HomeIcon from '@mui/icons-material/Home';
import StarIcon from '@mui/icons-material/Star';
import ChecklistIcon from '@mui/icons-material/Checklist';
import SettingsIcon from '@mui/icons-material/Settings';
import SupportIcon from '@mui/icons-material/Support';
import LogoutIcon from '@mui/icons-material/Logout';
import ThemeRegistry from '@/components/ThemeRegistry/ThemeRegistry';
import MainFragment from '@/components/MainFragment';

export const metadata = {
  title: 'Kino',
  description: `Kino ("Cinema"), derived from Yiddish (קינאָ), represents a personal 
  educational initiative focused on exploring various technologies within the context of a cinema.`,
};

const DRAWER_WIDTH = 240;

const LINKS = [
  { text: 'Home', href: '/', icon: HomeIcon },
  { text: 'Starred', href: '/starred', icon: StarIcon },
  { text: 'Tasks', href: '/tasks', icon: ChecklistIcon },
  { text: 'Titles', href: '/titles', icon: LocalMoviesIcon }
];

const PLACEHOLDER_LINKS = [
  { text: 'Settings', icon: SettingsIcon },
  { text: 'Support', icon: SupportIcon },
  { text: 'Logout', icon: LogoutIcon },
];

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <ThemeRegistry>
            <AppBar position="fixed" sx={{ zIndex: 2000 }}>
              <Toolbar sx={{ backgroundColor: 'background.paper' }}>
                <DashboardIcon sx={{ color: '#444', mr: 2, transform: 'translateY(-2px)' }} />
                <Typography variant="h6" noWrap component="div" color="black">
                  Kino
                </Typography>
              </Toolbar>
            </AppBar>
            <Drawer
              sx={{
                width: DRAWER_WIDTH,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                  width: DRAWER_WIDTH,
                  boxSizing: 'border-box',
                  top: ['48px', '56px', '64px'],
                  height: 'auto',
                  bottom: 0,
                },
              }}
              variant="permanent"
              anchor="left"
            >
              <Divider />
              <List>
                {LINKS.map(({ text, href, icon: Icon }) => (
                  <ListItem key={href} disablePadding>
                    <ListItemButton component={Link} href={href}>
                      <ListItemIcon>
                        <Icon />
                      </ListItemIcon>
                      <ListItemText primary={text} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
              <Divider sx={{ mt: 'auto' }} />
              <List>
                {PLACEHOLDER_LINKS.map(({ text, icon: Icon }) => (
                  <ListItem key={text} disablePadding>
                    <ListItemButton>
                      <ListItemIcon>
                        <Icon />
                      </ListItemIcon>
                      <ListItemText primary={text} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Drawer>
            <MainFragment marginLeft={DRAWER_WIDTH}>{children}</MainFragment>
          </ThemeRegistry>
        </StoreProvider>
      </body>
    </html>
  );
}
