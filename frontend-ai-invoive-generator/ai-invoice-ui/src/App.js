import React, { useState, useEffect } from 'react';

import {
  CssBaseline,
  Box,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Switch,
  IconButton,
  Toolbar,
  useMediaQuery,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import BarChartIcon from '@mui/icons-material/BarChart';

import Clients from './Clients';
import Invoices from './Invoices';
import Reports from './Reports';

const drawerWidth = 240;

const menuItems = [
  { text: 'Clients', icon: <PeopleIcon />, index: 0 },
  { text: 'Invoices', icon: <ReceiptIcon />, index: 1 },
  { text: 'Reports', icon: <BarChartIcon />, index: 2 },
];

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [selectedTab, setSelectedTab] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: { main: '#1976d2' },
      secondary: { main: '#ac2f2f' },
    },
    typography: {
      fontFamily: "'Roboto', 'Helvetica', 'Arial', sans-serif",
    },
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 900,
        lg: 1200,
        xl: 1536,
      },
    },
  });

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));

  const handleSidebarToggle = () => setSidebarOpen((open) => !open);

  const drawerHeader = (
    <Toolbar sx={{ display: "flex", alignItems: "center", px: 2, minHeight: { xs: 56, sm: 64 } }}>
      <IconButton
        color="inherit"
        aria-label="toggle sidebar"
        edge="start"
        onClick={handleSidebarToggle}
        sx={{ mr: 2 }}
      >
        <MenuIcon />
      </IconButton>
      <Typography 
        variant={isMobile ? "subtitle1" : "h6"} 
        noWrap
        sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
      >
        AI Invoice Generator
      </Typography>
    </Toolbar>
  );

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {drawerHeader}
      <List sx={{ flexGrow: 1, pt: 0 }}>
        {menuItems.map(({ text, icon, index }) => (
          <ListItem
            button
            key={text}
            selected={selectedTab === index}
            onClick={() => {
              setSelectedTab(index);
              if (isMobile) setSidebarOpen(false);
            }}
            sx={{
              py: { xs: 1, sm: 1.5 },
              px: { xs: 2, sm: 3 },
              '&.Mui-selected': {
                backgroundColor: theme.palette.primary.main + '20',
              }
            }}
          >
            <ListItemIcon 
              sx={{ 
                color: selectedTab === index ? theme.palette.primary.main : "inherit",
                minWidth: { xs: 40, sm: 56 }
              }}
            >
              {icon}
            </ListItemIcon>
            <ListItemText 
              primary={text}
              primaryTypographyProps={{
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }}
            />
          </ListItem>
        ))}
      </List>
      <Box sx={{ p: { xs: 1.5, sm: 2 }, mt: "auto" }}>
        <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
          Theme
        </Typography>
        <Switch
          checked={darkMode}
          onChange={() => setDarkMode((prev) => !prev)}
          inputProps={{ "aria-label": "Toggle dark mode" }}
          size={isMobile ? "small" : "medium"}
        />
      </Box>
    </Box>
  );

  let content = null;
  if (selectedTab === 0) content = <Clients />;
  else if (selectedTab === 1) content = <Invoices />;
  else if (selectedTab === 2) content = <Reports />;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {!sidebarOpen && (
        <IconButton
          onClick={handleSidebarToggle}
          color="primary"
          sx={{
            position: 'fixed',
            top: { xs: 8, sm: 16 },
            left: { xs: 8, sm: 16 },
            zIndex: 1401,
            bgcolor: "background.paper",
            boxShadow: 2,
            '&:hover': {
              bgcolor: "background.paper",
              boxShadow: 4,
            }
          }}
          aria-label="open sidebar"
        >
          <MenuIcon />
        </IconButton>
      )}
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Drawer
          variant={isMobile ? 'temporary' : 'persistent'}
          open={sidebarOpen}
          onClose={handleSidebarToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': { 
              width: { xs: 280, sm: drawerWidth }, 
              boxSizing: 'border-box' 
            },
            display: { xs: 'block', sm: 'block' },
          }}
        >
          {drawer}
        </Drawer>
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            bgcolor: "background.default",
            color: "text.primary",
            p: { xs: 1, sm: 2, md: 3 },
            width: "100%",
            minHeight: "100vh",
            ml: { 
              xs: 0, 
              sm: sidebarOpen ? `${drawerWidth}px` : 0 
            },
            transition: "margin-left 0.3s",
            overflow: "auto",
          }}
        >
          <Box sx={{ 
            width: "100%", 
            maxWidth: { xs: '100%', sm: 900, lg: 1200 }, 
            mx: "auto", 
            my: { xs: 1, sm: 2, md: 3 } 
          }}>
            {content}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
