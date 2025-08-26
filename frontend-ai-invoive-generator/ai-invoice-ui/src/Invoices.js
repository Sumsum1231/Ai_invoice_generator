import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Button,
  FormControl,
  Grid,
  InputAdornment,
  InputLabel,
  Select,
  TextField,
  Typography,
  MenuItem,
  Paper,
  Snackbar,
  Alert,
  CircularProgress,
  Backdrop,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import PhotoIcon from "@mui/icons-material/Photo";
import DeleteIcon from "@mui/icons-material/Delete";
import { AnimatePresence, motion } from "framer-motion";
import InvoiceList from "./InvoiceList";

const currencySymbols = { INR: "₹", USD: "$", EUR: "€" };
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const schema = yup.object({
  from: yup.object({
    name: yup.string().required("Company name is required"),
    email: yup.string().email("Invalid email").required("Email is required"),
    phone: yup.string(),
    address: yup.string(),
  }),
  for: yup.object({
    id: yup
      .string()
      .required("Client is required")
      .test("nonEmpty", "Client is required", (v) => !!v),
  }),
  date: yup.string().required("Invoice date is required"),
  dueDate: yup.string().required("Due date is required"),
  currency: yup.string().required("Currency is required"),
  gst_rate: yup.number().min(0).max(100).required("GST rate is required"),
  items: yup
    .array()
    .of(
      yup.object({
        description: yup.string().required("Description is required"),
        quantity: yup.number().positive().required("Quantity is required"),
        unit_price: yup.number().min(0).required("Unit price is required"),
        tax: yup.number().min(0).max(100).required("Tax is required"),
      })
    )
    .min(1, "At least one item is required"),
});

export default function Invoices() {
  const theme = useTheme();
  const isMobile = window.innerWidth < 600;

  // State
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [companyLogo, setCompanyLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isValid },
  } = useForm({
    defaultValues: {
      from: { name: "", email: "", phone: "", address: "" },
      for: { id: "" },
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      currency: "INR",
      gst_rate: 18,
      items: [{ description: "", quantity: 1, unit_price: 0, tax: 0 }],
    },
    resolver: yupResolver(schema),
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchCurrency = watch("currency");
  const watchClientId = watch("for.id");

  const safeNumber = (v, def = 0) => {
    const n = Number(v);
    return isNaN(n) ? def : n;
  };
  const formatCurrency = (v, c) =>
    `${currencySymbols[c] || c} ${safeNumber(v).toFixed(2)}`;

  const unpaidInvoices = useMemo(
    () => invoices.filter((i) => i.status !== "paid"),
    [invoices]
  );

  const apiCall = useCallback(async (ep, opts = {}) => {
    const res = await fetch(`${API_BASE_URL}${ep}`, {
      headers: { "Content-Type": "application/json", ...opts.headers },
      ...opts,
    });
    if (!res.ok) {
      let msg = "API error";
      try {
        const j = await res.json();
        msg = j.error || msg;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  }, []);

  // Fetch initial data
  useEffect(() => {
    (async () => {
      setDataLoading(true);
      try {
        const cl = await apiCall("/clients");
        setClients(Array.isArray(cl) ? cl : []);
        const inv = await apiCall("/invoices");
        setInvoices(Array.isArray(inv) ? inv : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setDataLoading(false);
      }
    })();
  }, [apiCall]);

  useEffect(() => {
    if (!watchClientId) return setSelectedClient(null);
    const c = clients.find((c) => String(c.id) === String(watchClientId));
    setSelectedClient(c || null);
  }, [watchClientId, clients]);

  const onSubmit = useCallback(
    async (data) => {
      setLoading(true);
      try {
        if (companyLogo) data.from.logo = companyLogo;
        data.for.id = String(data.for.id);
        const ep = editingId ? `/invoices/${editingId}` : "/invoices";
        const m = editingId ? "PUT" : "POST";
        await apiCall(ep, { method: m, body: JSON.stringify(data) });
        setSuccess(editingId ? "Invoice updated" : "Invoice created");
        reset();
        setEditingId(null);
        setCompanyLogo(null);
        setLogoPreview(null);
        const inv = await apiCall("/invoices");
        setInvoices(Array.isArray(inv) ? inv : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [apiCall, editingId, companyLogo, reset]
  );

  const editInvoice = useCallback(
    (id) => {
      const inv = invoices.find((i) => i.id === id);
      if (!inv) return setError("Invoice not found");
      reset({
        from: inv.from || { name: "", email: "", phone: "", address: "" },
        for: { id: String(inv.for?.id || "") },
        date: inv.date || new Date().toISOString().slice(0, 10),
        dueDate:
          inv.dueDate ||
          new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        currency: inv.currency || "INR",
        gst_rate: inv.gst_rate || 18,
        items:
          Array.isArray(inv.items) && inv.items.length
            ? inv.items
            : [{ description: "", quantity: 1, unit_price: 0, tax: 0 }],
      });
      if (inv.from?.logo) {
        setCompanyLogo(inv.from.logo);
        setLogoPreview(`${API_BASE_URL}${inv.from.logo.url}`);
      }
      setEditingId(id);
      window.scrollTo(0, 0);
    },
    [invoices, reset]
  );

  const deleteInvoice = useCallback(
    async (id) => {
      if (!window.confirm("Delete this invoice?")) return;
      setLoading(true);
      try {
        await apiCall(`/invoices/${id}`, { method: "DELETE" });
        setSuccess("Invoice deleted");
        if (editingId === id) {
          reset();
          setEditingId(null);
          setCompanyLogo(null);
          setLogoPreview(null);
        }
        const inv = await apiCall("/invoices");
        setInvoices(Array.isArray(inv) ? inv : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [apiCall, editingId, reset]
  );

  const submitPayment = useCallback(
    async () => {
      if (!selectedInvoiceId) return setError("Select invoice");
      const amt = parseFloat(paymentAmount);
      if (isNaN(amt) || amt <= 0) return setError("Enter valid amount");
      setLoading(true);
      try {
        await apiCall(`/invoices/${selectedInvoiceId}/pay`, {
          method: "POST",
          body: JSON.stringify({ amount: amt }),
        });
        setSuccess("Payment recorded");
        setPaymentAmount("");
        setSelectedInvoiceId("");
        const inv = await apiCall("/invoices");
        setInvoices(Array.isArray(inv) ? inv : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [paymentAmount, selectedInvoiceId]
  );

  const handleLogoUpload = useCallback(
    async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (
        ![
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/gif",
          "image/svg+xml",
        ].includes(f.type)
      ) {
        return setError("Invalid file type");
      }
      if (f.size > 5e6) {
        return setError("File too large");
      }
      setLogoUploading(true);
      try {
        const fd = new FormData();
        fd.append("logo", f);
        const res = await fetch(`${API_BASE_URL}/logos/upload`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Upload failed");
        }
        const j = await res.json();
        setCompanyLogo(j.logo);
        setLogoPreview(`${API_BASE_URL}${j.logo.url}`);
        setSuccess("Logo uploaded");
      } catch (e) {
        setError(e.message);
      } finally {
        setLogoUploading(false);
        e.target.value = "";
      }
    },
    []
  );

  const handleLogoRemove = useCallback(
    async () => {
      if (!companyLogo) return;
      try {
        await fetch(`${API_BASE_URL}/logos/${companyLogo.filename}`, {
          method: "DELETE",
        });
        setCompanyLogo(null);
        setLogoPreview(null);
        setSuccess("Logo removed");
      } catch (e) {
        setError(e.message);
      }
    },
    [companyLogo]
  );

  if (dataLoading)
    return (
      <Backdrop open sx={{ zIndex: theme.zIndex.modal + 1 }}>
        <CircularProgress />
      </Backdrop>
    );

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", p: 2 }}>
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError("")}
      >
        <Alert severity="error">{error}</Alert>
      </Snackbar>
      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={() => setSuccess("")}
      >
        <Alert severity="success">{success}</Alert>
      </Snackbar>
      <Paper sx={{ mb: 4, p: 3 }}>
        <Typography variant="h5" gutterBottom>
          {editingId ? "Edit Invoice" : "Create Invoice"}
        </Typography>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Client selection */}
          <FormControl fullWidth required sx={{ mb: 2 }}>
            <InputLabel>Client</InputLabel>
            <Controller
              name="for.id"
              control={control}
              render={({ field }) => (
                <Select {...field} disabled={loading || !clients.length}>
                  <MenuItem value="">
                    <em>Select client</em>
                  </MenuItem>
                  {clients.map((c) => (
                    <MenuItem key={c.id} value={String(c.id)}>
                      {c.name} ({c.email})
                    </MenuItem>
                  ))}
                </Select>
              )}
            />
            {errors.for?.id && (
              <Typography color="error" variant="caption">
                {errors.for.id.message}
              </Typography>
            )}
          </FormControl>
          {/* From Info */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6}>
              <Controller
                name="from.name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Company Name"
                    fullWidth
                    required
                    error={!!errors.from?.name}
                    helperText={errors.from?.name?.message}
                    disabled={loading}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="from.email"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Company Email"
                    fullWidth
                    required
                    error={!!errors.from?.email}
                    helperText={errors.from?.email?.message}
                    disabled={loading}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Controller
                name="from.address"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Address"
                    fullWidth
                    multiline
                    rows={2}
                    disabled={loading}
                  />
                )}
              />
            </Grid>
          </Grid>
          {/* Logo */}
          <Box
            sx={{ mb: 2, p: 2, border: "1px dashed #ccc", textAlign: "center" }}
          >
            {logoPreview ? (
              <>
                <img
                  src={logoPreview}
                  alt="Logo"
                  style={{ maxHeight: 80, marginBottom: 8 }}
                />
                <Box>
                  <Button
                    onClick={handleLogoRemove}
                    color="error"
                    startIcon={<DeleteIcon />}
                  >
                    Remove
                  </Button>
                </Box>
              </>
            ) : (
              <Button
                variant="outlined"
                component="label"
                startIcon={<CloudUploadIcon />}
                disabled={loading || logoUploading}
              >
                {logoUploading ? "Uploading..." : "Upload Logo"}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={handleLogoUpload}
                />
              </Button>
            )}
          </Box>
          {/* Dates & Tax */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6} sm={3}>
              <Controller
                name="date"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    type="date"
                    label="Invoice Date"
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                    error={!!errors.date}
                    helperText={errors.date?.message}
                    disabled={loading}
                  />
                )}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Controller
                name="dueDate"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    type="date"
                    label="Due Date"
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                    error={!!errors.dueDate}
                    helperText={errors.dueDate?.message}
                    disabled={loading}
                  />
                )}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <Select {...field} fullWidth label="Currency" disabled={loading}>
                    <MenuItem value="INR">₹ INR</MenuItem>
                    <MenuItem value="USD">$ USD</MenuItem>
                    <MenuItem value="EUR">€ EUR</MenuItem>
                  </Select>
                )}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Controller
                name="gst_rate"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    type="number"
                    label="GST Rate (%)"
                    fullWidth
                    required
                    error={!!errors.gst_rate}
                    helperText={errors.gst_rate?.message}
                    disabled={loading}
                  />
                )}
              />
            </Grid>
          </Grid>
          {/* Items */}
          <AnimatePresence>
            {fields.map((f, i) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Paper sx={{ mb: 2, p: 2 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={6}>
                      <Controller
                        name={`items.${i}.description`}
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            label="Description"
                            fullWidth
                            required
                            error={!!errors.items?.[i]?.description}
                            helperText={errors.items?.[i]?.description?.message}
                            disabled={loading}
                          />
                        )}
                      />
                    </Grid>
                    <Grid item xs={2}>
                      <Controller
                        name={`items.${i}.quantity`}
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            type="number"
                            label="Qty"
                            fullWidth
                            required
                            error={!!errors.items?.[i]?.quantity}
                            helperText={errors.items?.[i]?.quantity?.message}
                            disabled={loading}
                          />
                        )}
                      />
                    </Grid>
                    <Grid item xs={2}>
                      <Controller
                        name={`items.${i}.unit_price`}
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            type="number"
                            label="Price"
                            fullWidth
                            required
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  {currencySymbols[watchCurrency]}
                                </InputAdornment>
                              ),
                            }}
                            error={!!errors.items?.[i]?.unit_price}
                            helperText={errors.items?.[i]?.unit_price?.message}
                            disabled={loading}
                          />
                        )}
                      />
                    </Grid>
                    <Grid item xs={2}>
                      <Controller
                        name={`items.${i}.tax`}
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            type="number"
                            label="Tax (%)"
                            fullWidth
                            required
                            error={!!errors.items?.[i]?.tax}
                            helperText={errors.items?.[i]?.tax?.message}
                            disabled={loading}
                          />
                        )}
                      />
                    </Grid>
                    {fields.length > 1 && (
                      <Grid item xs={12} sm={2}>
                        <Button
                          color="error"
                          onClick={() => remove(i)}
                          disabled={loading}
                        >
                          Remove
                        </Button>
                      </Grid>
                    )}
                  </Grid>
                </Paper>
              </motion.div>
            ))}
          </AnimatePresence>
          <Button
            startIcon={<AddCircleOutlineIcon />}
            onClick={() => append({ description: "", quantity: 1, unit_price: 0, tax: 0 })}
            disabled={loading}
          >
            Add Item
          </Button>
          <Box sx={{ mt: 2, display: "flex", justifyContent: "center", gap: 2 }}>
            {editingId && (
              <Button
                color="inherit"
                onClick={() => {
                  reset();
                  setEditingId(null);
                  setCompanyLogo(null);
                  setLogoPreview(null);
                  setSuccess("Edit cancelled");
                }}
              >
                Cancel Edit
              </Button>
            )}
            <Button
              type="submit"
              variant="contained"
              disabled={!isValid || loading}
            >
              {editingId ? "Update" : "Create"} Invoice
            </Button>
          </Box>
        </form>
      </Paper>

      {/* Invoice List */}
      <Box sx={{ mb: 4 }}>
        <InvoiceList
          invoices={invoices}
          clients={clients}
          onEdit={editInvoice}
          onDelete={deleteInvoice}
          loading={loading}
          formatCurrency={formatCurrency}
        />
      </Box>

      {/* PAYMENT SECTION */}
      <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3 }}>
        <Box sx={{ mb: 2, pb: 1, borderBottom: 2, borderColor: "secondary.main" }}>
          <Typography variant="h6" color="secondary.main">
            Record Payment
          </Typography>
        </Box>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} md={5}>
            <FormControl fullWidth>
              <InputLabel>Select Invoice</InputLabel>
              <Select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                disabled={loading || !unpaidInvoices.length}
              >
                <MenuItem value="">
                  <em>Select...</em>
                </MenuItem>
                {unpaidInvoices.map((inv) => (
                  <MenuItem key={inv.id} value={inv.id}>
                    {inv.invoice_number} — Due: {formatCurrency(inv.total - inv.amount_paid, inv.currency)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Payment Amount"
              type="number"
              fullWidth
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    {currencySymbols[invoices.find((i) => i.id === selectedInvoiceId)?.currency] || "₹"}
                  </InputAdornment>
                ),
              }}
              disabled={loading || !selectedInvoiceId}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <Button
              variant="contained"
              fullWidth
              onClick={submitPayment}
              disabled={loading || !selectedInvoiceId || !paymentAmount || Number(paymentAmount) <= 0}
            >
              Record Payment
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
