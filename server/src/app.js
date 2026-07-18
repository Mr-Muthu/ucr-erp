require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/users.routes');
const vehicleRoutes = require('./modules/vehicles/vehicles.routes');
const maintenanceRoutes = require('./modules/maintenance/maintenance.routes');
const customerRoutes = require('./modules/customers/customers.routes');
const driverRoutes = require('./modules/drivers/drivers.routes');
const bookingRoutes = require('./modules/bookings/bookings.routes');
const invoiceRoutes = require('./modules/invoices/invoices.routes');
const paymentRoutes = require('./modules/payments/payments.routes');
const expenseRoutes = require('./modules/expenses/expenses.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use(errorHandler);

module.exports = app;
