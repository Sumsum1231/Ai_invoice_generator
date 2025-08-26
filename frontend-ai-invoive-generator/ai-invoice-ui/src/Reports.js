import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Paper,
  Chip,
  useMediaQuery,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Snackbar,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import GetAppIcon from '@mui/icons-material/GetApp';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const statusColors = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'error',
};

export default function Reports() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const safeNumber = (value, defaultValue = 0) => {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

  const formatCurrency = (value, defaultValue = 0) => {
    const num = safeNumber(value, defaultValue);
    return `₹${num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/reports/summary`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const result = await res.json();
      if (result.success && result.data) {
        setReportData(result.data);
      } else {
        throw new Error(result.error || 'Failed to load report data');
      }
    } catch (err) {
      console.error('Report fetch error:', err);
      setError(
        err.message.includes('fetch')
          ? 'Cannot connect to server. Make sure Flask is running on port 5000.'
          : err.message
      );
      setReportData({
        total_invoiced: 0,
        total_paid: 0,
        total_outstanding: 0,
        invoice_count: 0,
        client_count: 0,
        collection_rate: 0,
        average_invoice: 0,
        status_breakdown: { paid: 0, partial: 0, unpaid: 0 },
        top_clients: [],
        monthly_data: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const downloadPDFReport = useCallback(async () => {
    setPdfLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/reports/pdf`);
      if (!res.ok) throw new Error(`Failed to generate PDF: ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-report-${new Date()
        .toISOString()
        .split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download error:', err);
      setError(
        err.message.includes('fetch')
          ? 'Cannot connect to server. Make sure Flask is running on port 5000.'
          : err.message
      );
    } finally {
      setPdfLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 400,
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Loading report data...</Typography>
        </Box>
      </Box>
    );
  }

  const data = reportData || {};
  const totalInvoiced = safeNumber(data.total_invoiced);
  const totalPaid = safeNumber(data.total_paid);
  const totalOutstanding = safeNumber(data.total_outstanding);
  const invoiceCount = safeNumber(data.invoice_count);
  const clientCount = safeNumber(data.client_count);
  const collectionRate = safeNumber(data.collection_rate);
  const averageInvoice = safeNumber(data.average_invoice);
  const statusBreakdown = data.status_breakdown || {
    paid: 0,
    partial: 0,
    unpaid: 0,
  };
  const topClients = Array.isArray(data.top_clients) ? data.top_clients : [];
  const monthlyData = Array.isArray(data.monthly_data)
    ? data.monthly_data
    : [];

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto', p: { xs: 2, sm: 3 } }}>
      {error && (
        <Alert severity="warning" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 4,
        }}
      >
        <Typography
          variant={isMobile ? 'h5' : 'h4'}
          component="h1"
          fontWeight={600}
        >
          Reports & Analytics
        </Typography>
        <Button
          variant="contained"
          startIcon={
            pdfLoading ? <CircularProgress size={20} /> : <GetAppIcon />
          }
          onClick={downloadPDFReport}
          disabled={pdfLoading}
        >
          {pdfLoading ? 'Generating...' : 'Download PDF'}
        </Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <AttachMoneyIcon color="primary" sx={{ mr: 2, fontSize: 40 }} />
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Total Invoiced
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {formatCurrency(totalInvoiced)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <TrendingUpIcon color="success" sx={{ mr: 2, fontSize: 40 }} />
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Total Paid
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {formatCurrency(totalPaid)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <ReceiptIcon color="warning" sx={{ mr: 2, fontSize: 40 }} />
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Outstanding
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {formatCurrency(totalOutstanding)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <PeopleIcon color="info" sx={{ mr: 2, fontSize: 40 }} />
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Collection Rate
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {collectionRate.toFixed(1)}%
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Invoice Status Breakdown
            </Typography>
            <Box
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              {Object.entries(statusBreakdown).map(([status, count]) => (
                <Box
                  key={status}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Chip
                    label={
                      status.charAt(0).toUpperCase() + status.slice(1)
                    }
                    color={statusColors[status] || 'default'}
                    size="small"
                  />
                  <Typography variant="body1" fontWeight={600}>
                    {safeNumber(count)} invoices
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Key Metrics
            </Typography>
            <Box
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <Typography>Total Invoices:</Typography>
                <Typography fontWeight={600}>
                  {invoiceCount}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <Typography>Total Clients:</Typography>
                <Typography fontWeight={600}>
                  {clientCount}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <Typography>Average Invoice:</Typography>
                <Typography fontWeight={600}>
                  {formatCurrency(averageInvoice)}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {topClients.length > 0 && (
        <Paper sx={{ mb: 4 }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Top 5 Clients by Revenue
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Client Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell align="right">Revenue</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topClients.map((client, idx) => (
                    <TableRow key={client.id || idx}>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                        >
                          #{idx + 1} {client.name || 'Unknown'}
                        </Typography>
                      </TableCell>
                      <TableCell>{client.email || 'N/A'}</TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={600}>
                          {formatCurrency(client.revenue)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Paper>
      )}

      {monthlyData.length > 0 && (
        <Paper sx={{ p: 3, mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Monthly Revenue (Last 6 Months)
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Month</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {monthlyData.map((md, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      {md.month || 'Unknown Month'}
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={600}>
                        {formatCurrency(md.amount)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {invoiceCount === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography
            variant="h6"
            color="text.secondary"
            gutterBottom
          >
            No invoice data available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create some invoices to see detailed reports and analytics.
          </Typography>
        </Paper>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <Button
          variant="outlined"
          onClick={fetchReportData}
          disabled={loading}
        >
          {loading ? (
            <CircularProgress size={20} />
          ) : (
            'Refresh Data'
          )}
        </Button>
      </Box>
    </Box>
  );
}
