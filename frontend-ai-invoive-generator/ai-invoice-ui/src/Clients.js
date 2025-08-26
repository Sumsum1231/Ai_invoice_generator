import React, { useState, useEffect, useCallback } from 'react';

import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useMediaQuery,
  Alert,
  Snackbar,
  CircularProgress,
  Backdrop,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  InputAdornment,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import * as XLSX from 'xlsx';

// Icons
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SearchIcon from '@mui/icons-material/Search';
import BusinessIcon from '@mui/icons-material/Business';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';

const API_BASE_URL = "http://localhost:5000";

// Validation schema
const clientSchema = yup.object({
  name: yup.string().required("Client name is required").min(2, "Name must be at least 2 characters"),
  email: yup.string().email("Invalid email format").required("Email is required"),
  phone: yup.string().min(10, "Phone number must be at least 10 digits"),
  company: yup.string(),
  billing_address: yup.string(),
  actual_address: yup.string(),
  notes: yup.string(),
});

export default function Clients() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // State management
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingClient, setEditingClient] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);
  
  // Excel import/export states
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState([]);
  const [importResults, setImportResults] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  
  // Loading and error states
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form setup
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid }
  } = useForm({
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      company: '',
      billing_address: '',
      actual_address: '',
      notes: '',
    },
    resolver: yupResolver(clientSchema),
    mode: 'onChange'
  });

  // Utility functions
  const handleError = useCallback((error, customMessage = '') => {
    console.error('Client API Error:', error);
    setError(customMessage || error.message || 'An unexpected error occurred');
  }, []);

  const showSuccess = useCallback((message) => {
    setSuccess(message);
  }, []);

  // API helper function
  const apiCall = useCallback(async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Make sure Flask is running on port 5000.');
      }
      throw error;
    }
  }, []);

  // Data fetching
  const fetchClients = useCallback(async () => {
    try {
      setDataLoading(true);
      const data = await apiCall('/clients');
      const clientsArray = Array.isArray(data) ? data : [];
      setClients(clientsArray);
      setFilteredClients(clientsArray);
    } catch (e) {
      handleError(e, 'Failed to fetch clients');
      setClients([]);
      setFilteredClients([]);
    } finally {
      setDataLoading(false);
    }
  }, [apiCall, handleError]);

  // Initial data load
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredClients(clients);
    } else {
      const filtered = clients.filter(client => 
        client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.phone?.includes(searchQuery)
      );
      setFilteredClients(filtered);
    }
  }, [searchQuery, clients]);

  // Form submission
  const onSubmit = useCallback(async (data) => {
    setLoading(true);
    try {
      const endpoint = editingClient ? `/clients/${editingClient.id}` : '/clients';
      const method = editingClient ? 'PUT' : 'POST';

      await apiCall(endpoint, {
        method,
        body: JSON.stringify(data),
      });

      showSuccess(`Client ${editingClient ? 'updated' : 'created'} successfully`);
      setDialogOpen(false);
      setEditingClient(null);
      reset();
      await fetchClients();
    } catch (e) {
      handleError(e, `Failed to ${editingClient ? 'update' : 'create'} client`);
    } finally {
      setLoading(false);
    }
  }, [editingClient, apiCall, showSuccess, handleError, reset, fetchClients]);

  // Edit client
  const handleEdit = useCallback((client) => {
    setEditingClient(client);
    reset({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      company: client.company || '',
      billing_address: client.billing_address || '',
      actual_address: client.actual_address || '',
      notes: client.notes || '',
    });
    setDialogOpen(true);
  }, [reset]);

  // Delete client
  const handleDeleteClick = useCallback((client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!clientToDelete) return;

    setLoading(true);
    try {
      await apiCall(`/clients/${clientToDelete.id}`, { method: 'DELETE' });
      showSuccess('Client deleted successfully');
      setDeleteDialogOpen(false);
      setClientToDelete(null);
      await fetchClients();
    } catch (e) {
      handleError(e, 'Failed to delete client');
    } finally {
      setLoading(false);
    }
  }, [clientToDelete, apiCall, showSuccess, handleError, fetchClients]);

  // Excel Export functionality
  const handleExportExcel = useCallback(async () => {
    setExportLoading(true);
    try {
      console.log('📊 Starting Excel export...');
      
      if (clients.length === 0) {
        setError('No clients to export');
        return;
      }

      // Prepare data for Excel
      const excelData = clients.map(client => ({
        'Client Name': client.name || '',
        'Email': client.email || '',
        'Phone': client.phone || '',
        'Company': client.company || '',
        'Billing Address': client.billing_address || '',
        'Actual Address': client.actual_address || '',
        'Notes': client.notes || '',
        'Created Date': client.created_at ? new Date(client.created_at).toLocaleDateString() : '',
      }));

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Auto-adjust column widths
      const colWidths = [];
      const headers = Object.keys(excelData[0]);
      headers.forEach((header, index) => {
        const maxWidth = Math.max(
          header.length,
          ...excelData.map(row => String(row[header] || '').length)
        );
        colWidths[index] = { width: Math.min(maxWidth + 2, 50) };
      });
      ws['!cols'] = colWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Clients');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `clients-export-${timestamp}.xlsx`;

      // Save file
      XLSX.writeFile(wb, filename);
      
      showSuccess(`Exported ${clients.length} clients to ${filename}`);
      console.log('✅ Excel export completed');
      
    } catch (error) {
      console.error('❌ Export error:', error);
      handleError(error, 'Failed to export clients to Excel');
    } finally {
      setExportLoading(false);
    }
  }, [clients, showSuccess, handleError]);

  // Excel Import functionality
  const handleImportExcel = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log('📤 Starting Excel import...');
    setImportLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first worksheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (jsonData.length === 0) {
          throw new Error('Excel file is empty or has no valid data');
        }

        console.log('📋 Parsed Excel data:', jsonData);

        // Map Excel data to client format
        const mappedData = jsonData.map((row, index) => {
          // Try different possible column names
          const getName = () => 
            row['Client Name'] || row['Name'] || row['name'] || 
            row['client_name'] || row['CLIENT NAME'] || '';
            
          const getEmail = () => 
            row['Email'] || row['email'] || row['EMAIL'] || 
            row['Email Address'] || row['email_address'] || '';
            
          const getPhone = () => 
            row['Phone'] || row['phone'] || row['PHONE'] || 
            row['Phone Number'] || row['phone_number'] || '';
            
          const getCompany = () => 
            row['Company'] || row['company'] || row['COMPANY'] || 
            row['Company Name'] || row['company_name'] || '';

          return {
            rowIndex: index + 2, // +2 because Excel is 1-indexed and has header
            name: getName(),
            email: getEmail(),
            phone: getPhone(),
            company: getCompany(),
            billing_address: row['Billing Address'] || row['billing_address'] || row['Address'] || row['address'] || '',
            actual_address: row['Actual Address'] || row['actual_address'] || '',
            notes: row['Notes'] || row['notes'] || row['NOTES'] || '',
            isValid: !!(getName() && getEmail())
          };
        });

        setImportPreviewData(mappedData);
        setImportDialogOpen(true);
        
      } catch (error) {
        console.error('❌ Import parsing error:', error);
        handleError(error, 'Failed to parse Excel file. Please check the file format.');
      } finally {
        setImportLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
    // Reset input
    event.target.value = '';
  }, [handleError]);

  // Confirm import
  const confirmImport = useCallback(async () => {
    setImportLoading(true);
    try {
      const validClients = importPreviewData.filter(client => client.isValid);
      
      if (validClients.length === 0) {
        throw new Error('No valid clients to import');
      }

      console.log('📥 Importing clients:', validClients);

      const results = {
        successful: 0,
        failed: 0,
        errors: []
      };

      // Import clients one by one
      for (const clientData of validClients) {
        try {
          const { rowIndex, isValid, ...cleanData } = clientData;
          await apiCall('/clients', {
            method: 'POST',
            body: JSON.stringify(cleanData),
          });
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push(`Row ${clientData.rowIndex}: ${error.message}`);
        }
      }

      setImportResults(results);
      
      if (results.successful > 0) {
        showSuccess(`Successfully imported ${results.successful} clients`);
        await fetchClients();
      }
      
      if (results.failed > 0) {
        setError(`${results.failed} clients failed to import. Check the results for details.`);
      }

    } catch (error) {
      console.error('❌ Import error:', error);
      handleError(error, 'Failed to import clients');
    } finally {
      setImportLoading(false);
    }
  }, [importPreviewData, apiCall, showSuccess, handleError, fetchClients]);

  // Download template
  const handleDownloadTemplate = useCallback(() => {
    const template = [{
      'Client Name': 'John Doe',
      'Email': 'john@example.com',
      'Phone': '1234567890',
      'Company': 'ABC Corp',
      'Billing Address': '123 Main St, City, State',
      'Actual Address': '123 Main St, City, State',
      'Notes': 'Important client notes here',
    }];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);
    
    // Auto-adjust column widths
    const colWidths = Object.keys(template[0]).map(key => ({ width: 20 }));
    ws['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws, 'Client Template');
    XLSX.writeFile(wb, 'client-import-template.xlsx');
    
    showSuccess('Template downloaded successfully');
  }, [showSuccess]);

  // Dialog handlers
  const handleAddNew = useCallback(() => {
    setEditingClient(null);
    reset();
    setDialogOpen(true);
  }, [reset]);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingClient(null);
    reset();
  }, [reset]);

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Loading backdrop
  if (dataLoading) {
    return (
      <Backdrop open={true} sx={{ color: '#fff', zIndex: theme.zIndex.drawer + 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircularProgress color="inherit" />
          <Typography sx={{ mt: 2 }}>Loading clients...</Typography>
        </Box>
      </Backdrop>
    );
  }

  return (
    <Box sx={{ 
      width: '100%',
      maxWidth: 1200,
      mx: 'auto',
      p: { xs: 2, sm: 3 }
    }}>
      {/* Loading overlay */}
      <Backdrop open={loading || importLoading || exportLoading} sx={{ zIndex: theme.zIndex.drawer + 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircularProgress color="primary" />
          <Typography sx={{ mt: 2 }}>
            {loading && 'Processing...'}
            {importLoading && 'Importing clients...'}
            {exportLoading && 'Exporting clients...'}
          </Typography>
        </Box>
      </Backdrop>

      {/* Error Snackbar */}
      <Snackbar 
        open={!!error} 
        autoHideDuration={6000} 
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setError('')} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      {/* Success Snackbar */}
      <Snackbar 
        open={!!success} 
        autoHideDuration={4000} 
        onClose={() => setSuccess('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccess('')} severity="success" sx={{ width: '100%' }}>
          {success}
        </Alert>
      </Snackbar>

      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2,
        mb: 4 
      }}>
        <Typography 
          variant={isMobile ? "h5" : "h4"} 
          component="h1"
          fontWeight={600}
          color="primary.main"
        >
          Client Management
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddNew}
            size={isMobile ? "medium" : "large"}
            disabled={loading}
          >
            Add New Client
          </Button>
          
          <IconButton
            onClick={(event) => setAnchorEl(event.currentTarget)}
            disabled={loading}
            size="large"
          >
            <MoreVertIcon />
          </IconButton>
          
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={() => { handleDownloadTemplate(); handleMenuClose(); }}>
              <ListItemIcon>
                <CloudDownloadIcon />
              </ListItemIcon>
              <ListItemText>Download Template</ListItemText>
            </MenuItem>
            
            <MenuItem component="label">
              <ListItemIcon>
                <FileUploadIcon />
              </ListItemIcon>
              <ListItemText>Import Excel</ListItemText>
              <input
                type="file"
                hidden
                accept=".xlsx,.xls"
                onChange={(e) => { handleImportExcel(e); handleMenuClose(); }}
              />
            </MenuItem>
            
            <MenuItem 
              onClick={() => { handleExportExcel(); handleMenuClose(); }}
              disabled={clients.length === 0}
            >
              <ListItemIcon>
                <FileDownloadIcon />
              </ListItemIcon>
              <ListItemText>Export to Excel</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      {/* Search Bar */}
      <Paper sx={{ p: 2, mb: 4 }}>
        <TextField
          fullWidth
          placeholder="Search clients by name, email, company, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
          size={isMobile ? "small" : "medium"}
        />
      </Paper>

      {/* Client Statistics */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} sm={4} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="primary.main" fontWeight={600}>
              {clients.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Clients
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="success.main" fontWeight={600}>
              {filteredClients.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {searchQuery ? 'Search Results' : 'Active Clients'}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Clients List */}
      {filteredClients.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <BusinessIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {searchQuery ? 'No clients found' : 'No clients yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {searchQuery 
              ? 'Try adjusting your search terms'
              : 'Add your first client to get started with invoice management'
            }
          </Typography>
          {!searchQuery && (
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddNew}>
                Add First Client
              </Button>
              <Button variant="outlined" startIcon={<FileUploadIcon />} component="label">
                Import from Excel
                <input
                  type="file"
                  hidden
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                />
              </Button>
            </Box>
          )}
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {filteredClients.map((client) => (
            <Grid item xs={12} sm={6} md={4} key={client.id}>
              <Card 
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 4,
                  }
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <PersonIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h6" fontWeight={600} noWrap>
                      {client.name}
                    </Typography>
                  </Box>
                  
                  {client.company && (
                    <Chip 
                      label={client.company} 
                      size="small" 
                      color="primary" 
                      variant="outlined"
                      sx={{ mb: 2 }}
                    />
                  )}

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {client.email && (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <EmailIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {client.email}
                        </Typography>
                      </Box>
                    )}
                    
                    {client.phone && (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <PhoneIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {client.phone}
                        </Typography>
                      </Box>
                    )}
                    
                    {client.billing_address && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                        <LocationOnIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary', mt: 0.2 }} />
                        <Typography variant="body2" color="text.secondary" sx={{ 
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}>
                          {client.billing_address}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {client.notes && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                      <Typography variant="body2" color="text.secondary" sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        <strong>Notes:</strong> {client.notes}
                      </Typography>
                    </Box>
                  )}
                </CardContent>

                <Divider />

                <CardActions sx={{ justifyContent: 'flex-end', p: 2 }}>
                  <IconButton 
                    size="small" 
                    color="primary"
                    onClick={() => handleEdit(client)}
                    disabled={loading}
                    title="Edit Client"
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton 
                    size="small" 
                    color="error"
                    onClick={() => handleDeleteClick(client)}
                    disabled={loading}
                    title="Delete Client"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Add/Edit Client Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            {editingClient ? 'Edit Client' : 'Add New Client'}
          </Typography>
        </DialogTitle>
        
        <DialogContent>
          <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ pt: 1 }}>
            <Grid container spacing={3}>
              {/* Basic Information */}
              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight={600} color="primary.main" gutterBottom>
                  Basic Information
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Client Name *"
                      fullWidth
                      error={!!errors.name}
                      helperText={errors.name?.message}
                      disabled={loading}
                      size={isMobile ? "small" : "medium"}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Email Address *"
                      type="email"
                      fullWidth
                      error={!!errors.email}
                      helperText={errors.email?.message}
                      disabled={loading}
                      size={isMobile ? "small" : "medium"}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Phone Number"
                      fullWidth
                      error={!!errors.phone}
                      helperText={errors.phone?.message}
                      disabled={loading}
                      size={isMobile ? "small" : "medium"}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="company"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Company Name"
                      fullWidth
                      disabled={loading}
                      size={isMobile ? "small" : "medium"}
                    />
                  )}
                />
              </Grid>

              {/* Address Information */}
              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight={600} color="primary.main" gutterBottom sx={{ mt: 2 }}>
                  Address Information
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="billing_address"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Billing Address"
                      fullWidth
                      multiline
                      rows={3}
                      disabled={loading}
                      size={isMobile ? "small" : "medium"}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="actual_address"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Actual Address"
                      fullWidth
                      multiline
                      rows={3}
                      disabled={loading}
                      size={isMobile ? "small" : "medium"}
                      helperText="If different from billing address"
                    />
                  )}
                />
              </Grid>

              {/* Additional Information */}
              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight={600} color="primary.main" gutterBottom sx={{ mt: 2 }}>
                  Additional Information
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Notes"
                      fullWidth
                      multiline
                      rows={3}
                      disabled={loading}
                      size={isMobile ? "small" : "medium"}
                      helperText="Any additional notes about this client"
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 3, gap: 2 }}>
          <Button 
            onClick={handleCloseDialog}
            disabled={loading}
            size={isMobile ? "medium" : "large"}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit(onSubmit)}
            variant="contained"
            disabled={loading || !isValid}
            size={isMobile ? "medium" : "large"}
          >
            {loading ? (
              <CircularProgress size={20} />
            ) : (
              editingClient ? 'Update Client' : 'Add Client'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={600}>
            Import Preview ({importPreviewData.filter(c => c.isValid).length} valid clients)
          </Typography>
        </DialogTitle>
        
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Review the data below before importing. Invalid rows will be highlighted in red.
          </Alert>
          
          <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Row</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Company</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {importPreviewData.map((client, index) => (
                  <TableRow 
                    key={index}
                    sx={{ 
                      bgcolor: client.isValid ? 'transparent' : 'error.50',
                      '& td': { color: client.isValid ? 'text.primary' : 'error.main' }
                    }}
                  >
                    <TableCell>{client.rowIndex}</TableCell>
                    <TableCell>{client.name}</TableCell>
                    <TableCell>{client.email}</TableCell>
                    <TableCell>{client.phone}</TableCell>
                    <TableCell>{client.company}</TableCell>
                    <TableCell>
                      <Chip 
                        label={client.isValid ? 'Valid' : 'Invalid'}
                        color={client.isValid ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Import Results */}
          {importResults && (
            <Box sx={{ mt: 3 }}>
              <Alert severity={importResults.failed > 0 ? 'warning' : 'success'}>
                Import completed: {importResults.successful} successful, {importResults.failed} failed
              </Alert>
              
              {importResults.errors.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" color="error" gutterBottom>
                    Errors:
                  </Typography>
                  <Box sx={{ maxHeight: 150, overflow: 'auto' }}>
                    {importResults.errors.map((error, index) => (
                      <Typography key={index} variant="body2" color="error">
                        • {error}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 3, gap: 2 }}>
          <Button 
            onClick={() => {
              setImportDialogOpen(false);
              setImportPreviewData([]);
              setImportResults(null);
            }}
            disabled={importLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmImport}
            variant="contained"
            disabled={importLoading || importPreviewData.filter(c => c.isValid).length === 0}
          >
            {importLoading ? <CircularProgress size={20} /> : 'Import Clients'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Confirm Delete
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete client "{clientToDelete?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 2 }}>
          <Button 
            onClick={() => setDeleteDialogOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmDelete}
            variant="contained"
            color="error"
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : 'Delete Client'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
