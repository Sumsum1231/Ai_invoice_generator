import React, { useState, useCallback } from 'react';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { Box, Chip, Button, useMediaQuery, CircularProgress, IconButton, Alert } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import GetAppIcon from '@mui/icons-material/GetApp';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

const statusColors = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'error',
};

const InvoiceList = ({ 
  invoices = [], 
  clients = [], 
  onEdit, 
  onDelete, 
  loading: parentLoading = false,
  formatCurrency 
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [pdfLoading, setPdfLoading] = useState({});
  const [error, setError] = useState('');

  // Enhanced PDF download function with comprehensive error handling
  const downloadPDF = useCallback(async (invoiceId) => {
    setPdfLoading(prev => ({ ...prev, [invoiceId]: true }));
    
    try {
      console.log(`🔥 Requesting PDF for Invoice ID: ${invoiceId}`);
      
      // Check if Flask server is reachable first
      try {
        const healthCheck = await fetch('http://localhost:5000/health', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!healthCheck.ok) {
          throw new Error('Flask server is not responding');
        }
        
        const healthData = await healthCheck.json();
        console.log('✅ Flask server is running:', healthData.status);
        
      } catch (healthError) {
        console.error('❌ Health check failed:', healthError);
        throw new Error('Flask PDF server is not running. Please start it on port 5000.');
      }
      
      // Make PDF request
      const response = await fetch(`http://localhost:5000/invoices/${invoiceId}/pdf`, {
        method: 'GET',
        headers: {
          'Accept': 'application/pdf,text/html,application/json',
        },
      });

      console.log(`📋 PDF Response Status: ${response.status}`);

      if (!response.ok) {
        let errorMessage = 'Failed to generate PDF';
        
        const contentType = response.headers.get('Content-Type');
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
            console.error('❌ PDF Error Details:', errorData);
          } catch (parseError) {
            console.error('❌ Could not parse error response:', parseError);
            errorMessage = `Server error: ${response.status} - ${response.statusText}`;
          }
        } else {
          errorMessage = `Server error: ${response.status} - ${response.statusText}`;
        }
        
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      console.log(`📄 PDF Blob size: ${blob.size} bytes, type: ${blob.type}`);
      
      if (blob.size === 0) {
        throw new Error('Received empty file from server');
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `invoice-${invoiceId}.pdf`;
      
      if (contentDisposition) {
        console.log('📁 Content-Disposition:', contentDisposition);
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      if (blob.type.includes('html')) {
        filename = filename.replace('.pdf', '.html');
        console.log('📄 Downloading HTML fallback');
      } else if (blob.type.includes('pdf')) {
        console.log('📄 Downloading PDF file');
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
      console.log('✅ File downloaded successfully:', filename);
      
      setError('');
      
    } catch (error) {
      console.error('❌ PDF download error:', error);
      
      let userMessage = error.message;
      
      if (error.message.includes('fetch')) {
        userMessage = 'Cannot connect to PDF service. Make sure Flask server is running on port 5000.';
      } else if (error.message.includes('JSON server')) {
        userMessage = 'Cannot connect to database. Make sure JSON server is running on port 3000.';
      }
      
      setError(`PDF Error: ${userMessage}`);
    } finally {
      setPdfLoading(prev => ({ ...prev, [invoiceId]: false }));
    }
  }, []);

  // Safe data processing with enhanced validation
  const rows = React.useMemo(() => {
    if (!Array.isArray(invoices)) {
      console.warn('Invoices is not an array:', invoices);
      return [];
    }
    
    return invoices.map(inv => {
      try {
        if (!inv || typeof inv !== 'object') {
          throw new Error('Invalid invoice object');
        }

        const client = Array.isArray(clients) ? clients.find(c => c.id === inv.for?.id) : null;
        
        return {
          id: inv.id || Date.now(),
          invoiceNumber: inv.invoice_number || `#${inv.id || 'Unknown'}`,
          clientName: client ? client.name : (inv.for?.id ? `ID: ${inv.for.id}` : 'Unknown Client'),
          date: inv.date || '',
          dueDate: inv.dueDate || '',
          status: inv.status || 'unpaid',
          amountPaid: Number(inv.amount_paid) || 0,
          total: Number(inv.total) || 0,
          currency: inv.currency || 'INR',
        };
      } catch (e) {
        console.error('Error processing invoice:', inv, e);
        return {
          id: inv?.id || Date.now() + Math.random(),
          invoiceNumber: 'Error Processing',
          clientName: 'Error',
          date: '',
          dueDate: '',
          status: 'error',
          amountPaid: 0,
          total: 0,
          currency: 'INR',
        };
      }
    }).filter(row => row.id);
  }, [invoices, clients]);

  const defaultFormatCurrency = useCallback((value, currency) => {
    try {
      if (isNaN(value) || value === null || value === undefined) {
        return `${currency} 0.00`;
      }
      
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(value);
    } catch (intlError) {
      const symbols = { INR: '₹', USD: '$', EUR: '€' };
      return `${symbols[currency] || currency} ${Number(value || 0).toFixed(2)}`;
    }
  }, []);

  const currencyFormatter = formatCurrency || defaultFormatCurrency;

  // Fixed column generation - removed any button props
  const getColumns = useCallback(() => {
    const baseColumns = [
      { 
        field: 'invoiceNumber', 
        headerName: 'Invoice #', 
        width: isMobile ? 100 : 140,
        flex: isMobile ? 1 : 0
      },
      { 
        field: 'clientName', 
        headerName: 'Client', 
        width: isMobile ? 120 : 180,
        flex: isMobile ? 1 : 0
      },
    ];

    if (!isMobile) {
      baseColumns.push(
        { 
          field: 'date', 
          headerName: 'Date', 
          width: 120, 
          type: 'date',
          valueGetter: (value, row) => {
            try {
              return row.date ? new Date(row.date) : null;
            } catch (e) {
              console.warn('Invalid date format:', row.date);
              return null;
            }
          }
        },
        { 
          field: 'dueDate', 
          headerName: 'Due Date', 
          width: 120, 
          type: 'date',
          valueGetter: (value, row) => {
            try {
              return row.dueDate ? new Date(row.dueDate) : null;
            } catch (e) {
              console.warn('Invalid due date format:', row.dueDate);
              return null;
            }
          }
        }
      );
    }

    baseColumns.push({
      field: 'status',
      headerName: 'Status',
      width: isMobile ? 100 : 130,
      flex: isMobile ? 1 : 0,
      renderCell: (params) => (
        <Chip
          label={String(params.value || 'unknown').toUpperCase()}
          color={statusColors[String(params.value || 'unpaid').toLowerCase()] || 'default'}
          size="small"
        />
      ),
    });

    if (!isMobile) {
      baseColumns.push({
        field: 'amountPaid',
        headerName: 'Paid',
        width: 130,
        valueFormatter: (value, row) => currencyFormatter(value, row.currency),
      });
    }

    baseColumns.push({
      field: 'total',
      headerName: 'Total',
      width: isMobile ? 100 : 130,
      flex: isMobile ? 1 : 0,
      valueFormatter: (value, row) => currencyFormatter(value, row.currency),
    });

    // ✅ FIXED: Actions column - removed any button props and fixed event handlers
    baseColumns.push({
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      width: isMobile ? 140 : 240,
      flex: isMobile ? 1 : 0,
      renderCell: (params) => {
        const { row } = params;
        
        return (
          <Box sx={{ 
            display: 'flex', 
            gap: { xs: 0.5, sm: 1 },
            alignItems: 'center',
            height: '100%',
            py: 0.5
          }}>
            {isMobile ? (
              // Mobile: Icon buttons - FIXED
              <>
                <IconButton 
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onEdit) onEdit(row.id);
                  }}
                  color="primary"
                  title="Edit Invoice"
                  disabled={parentLoading}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton 
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onDelete) onDelete(row.id);
                  }}
                  color="error"
                  title="Delete Invoice"
                  disabled={parentLoading}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
                <IconButton 
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    downloadPDF(row.id);
                  }}
                  disabled={pdfLoading[row.id] || parentLoading}
                  color="success"
                  title="Download PDF"
                >
                  {pdfLoading[row.id] ? (
                    <CircularProgress size={16} />
                  ) : (
                    <GetAppIcon fontSize="small" />
                  )}
                </IconButton>
              </>
            ) : (
              // Desktop: Text buttons - FIXED
              <>
                <Button 
                  size="small" 
                  variant="text"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onEdit) onEdit(row.id);
                  }}
                  disabled={parentLoading}
                  sx={{ 
                    minWidth: 'auto', 
                    p: 0.5,
                    fontSize: '0.75rem'
                  }}
                >
                  Edit
                </Button>
                <Button 
                  size="small" 
                  variant="text"
                  color="error"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onDelete) onDelete(row.id);
                  }}
                  disabled={parentLoading}
                  sx={{ 
                    minWidth: 'auto', 
                    p: 0.5,
                    fontSize: '0.75rem'
                  }}
                >
                  Delete
                </Button>
                <Button 
                  size="small" 
                  variant="text"
                  color="success"
                  onClick={(event) => {
                    event.stopPropagation();
                    downloadPDF(row.id);
                  }}
                  disabled={pdfLoading[row.id] || parentLoading}
                  startIcon={pdfLoading[row.id] ? <CircularProgress size={12} /> : <GetAppIcon />}
                  sx={{ 
                    minWidth: 'auto', 
                    p: 0.5,
                    fontSize: '0.75rem'
                  }}
                >
                  {pdfLoading[row.id] ? 'Loading...' : 'PDF'}
                </Button>
              </>
            )}
          </Box>
        );
      },
    });

    return baseColumns;
  }, [isMobile, onEdit, onDelete, downloadPDF, pdfLoading, currencyFormatter, parentLoading]);

  if (error) {
    return (
      <Box>
        <Alert 
          severity="error" 
          onClose={() => setError('')}
          sx={{ mb: 2 }}
          action={
            <Button 
              color="inherit" 
              size="small" 
              onClick={() => setError('')}
            >
              Dismiss
            </Button>
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      height: { xs: 400, sm: 500, md: 600 }, 
      width: '100%',
      '& .MuiDataGrid-root': {
        fontSize: { xs: '0.75rem', sm: '0.875rem' }
      }
    }}>
      <DataGrid
        rows={rows}
        columns={getColumns()}
        initialState={{
          pagination: {
            paginationModel: { pageSize: isMobile ? 5 : 10 },
          },
        }}
        pageSizeOptions={isMobile ? [5, 10] : [5, 10, 20]}
        slots={{ 
          toolbar: isMobile ? null : GridToolbar 
        }}
        disableSelectionOnClick
        autoHeight={false}
        getRowId={(row) => row.id}
        density={isMobile ? 'compact' : 'standard'}
        loading={parentLoading || (!rows.length && invoices.length === 0)}
        sx={{
          '& .MuiDataGrid-cell': {
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            py: { xs: 0.5, sm: 1 }
          },
          '& .MuiDataGrid-columnHeader': {
            fontSize: { xs: '0.8rem', sm: '0.9rem' }
          },
          '& .MuiDataGrid-row:hover': {
            backgroundColor: theme.palette.action.hover,
          }
        }}
        localeText={{
          noRowsLabel: invoices.length === 0 ? 'No invoices to display' : 'Loading invoices...',
        }}
      />
    </Box>
  );
};

export default InvoiceList;
