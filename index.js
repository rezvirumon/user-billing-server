const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ["http://localhost:5173", "https://billing-rumon.netlify.app"],
    credentials: true,
}));
app.use(express.json());

// MongoDB Connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jaknolq.mongodb.net/user-billing-rumon`;

mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// Customer Schema and Model
const customerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    area: { type: String, required: true },
    email: { type: String, required: true },
    bill: { type: Number, default: 0 },
    payments: [{ 
        amount: Number, 
        date: Date,
        receiver: String
    }],
    due: { type: Number, default: 0 },
    lastPayDate: { type: Date },
    paymentStatus: { type: String, default: 'Unpaid' },
    status: { type: String, default: 'Active' } // Add status field here
});

customerSchema.methods.calculatePaymentStatus = function () {
    const totalPayment = this.payments.reduce((total, payment) => total + payment.amount, 0);
    const due = this.bill - totalPayment;

    if (due === 0) {
        this.paymentStatus = 'Paid';
        this.due = 0;
    } else if (due < 0) {
        this.paymentStatus = 'Advanced';
        this.due = 0;
    } else {
        this.paymentStatus = 'Unpaid';
        this.due = due;
    }
};

const Customer = mongoose.model('Customer', customerSchema);

// Monthly Report Schema and Model
const monthlyReportSchema = new mongoose.Schema({
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    totalCollections: { type: Number, required: true },
    totalDues: { type: Number, required: true },
    totalAdvanced: { type: Number, required: true },
});

const MonthlyReport = mongoose.model('MonthlyReport', monthlyReportSchema);

// Routes
app.get('/', (req, res) => {
    res.send('Customer Service Running');
});

// Add a new customer
app.post('/customers', async (req, res) => {
    const { name, mobile, area, email, bill, status } = req.body;
    try {
        const newCustomer = new Customer({ name, mobile, area, email, bill, due: bill, status }); // Include status
        newCustomer.calculatePaymentStatus();
        await newCustomer.save();
        res.status(201).send(newCustomer);
    } catch (err) {
        console.error(err);
        res.status(400).send({ error: err.message });
    }
});


// Get all monthly reports
app.get('/monthly-reports', async (req, res) => {
    try {
        const reports = await MonthlyReport.find();
        res.status(200).json(reports);
    } catch (err) {
        console.error('Error fetching monthly reports:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get a specific monthly report by month and year
app.get('/monthly-reports/:year/:month', async (req, res) => {
    const { year, month } = req.params;
    try {
        const report = await MonthlyReport.findOne({ year, month });
        if (!report) {
            return res.status(404).json({ error: 'Monthly report not found' });
        }
        res.status(200).json(report);
    } catch (err) {
        console.error('Error fetching monthly report:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get the list of customers
app.get('/customers', async (req, res) => {
    try {
        const customers = await Customer.find();
        res.status(200).send(customers);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.message });
    }
});

// Fetch customer by ID
app.get('/customers/:id', async (req, res) => {
    const customerId = req.params.id;
    try {
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.status(200).json(customer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Delete a customer by ID
app.delete('/customers/:id', async (req, res) => {
    const customerId = req.params.id;
    try {
        const deletedCustomer = await Customer.findByIdAndDelete(customerId);
        if (!deletedCustomer) {
            return res.status(404).send('Customer not found');
        }
        res.status(200).send(deletedCustomer);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.message });
    }
});


// Update a customer's details by ID
app.put('/customers/:id', async (req, res) => {
    const customerId = req.params.id;
    const { name, mobile, area, email, bill, status } = req.body; // Include status in request body
    try {
        const updatedCustomer = await Customer.findByIdAndUpdate(customerId, { name, mobile, area, email, bill, status }, { new: true });
        if (!updatedCustomer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        updatedCustomer.calculatePaymentStatus();
        await updatedCustomer.save();
        res.status(200).json(updatedCustomer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});




// Update payment for a customer by ID
app.put('/billing/:id', async (req, res) => {
    const customerId = req.params.id;
    const { payment, receiver } = req.body;
    try {
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).send('Customer not found');
        }

        customer.payments.push({ 
            amount: payment, 
            date: new Date(),
            receiver 
        });
        customer.calculatePaymentStatus();
        customer.lastPayDate = new Date();

        await customer.save();
        res.status(200).send(customer);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.message });
    }
});

// Search customers by query
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).send('Query parameter is required');
    }

    try {
        const customers = await Customer.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { mobile: { $regex: query, $options: 'i' } },
                { area: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } }
            ]
        });
        res.status(200).send(customers);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.message });
    }
});

// New endpoint for fetching dashboard data
app.get('/dashboard', async (req, res) => {
    try {
        const totalCustomers = await Customer.countDocuments();

        const totalCollections = await Customer.aggregate([
            { $unwind: "$payments" },
            { $group: { _id: null, total: { $sum: "$payments.amount" } } }
        ]);

        const totalDues = await Customer.aggregate([
            { $match: { paymentStatus: "Unpaid" } },
            { $group: { _id: null, total: { $sum: "$due" } } }
        ]);

        const totalAdvanced = await Customer.aggregate([
            { $unwind: "$payments" },
            { $match: { $expr: { $gt: ["$payments.amount", "$bill"] } } },
            { $group: { _id: null, total: { $sum: { $subtract: ["$payments.amount", "$bill"] } } } }
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

        const todaysCollection = await Customer.aggregate([
            { $unwind: "$payments" },
            { $match: { "payments.date": { $gte: today, $lt: tomorrow } } },
            { $group: { _id: null, total: { $sum: "$payments.amount" } } }
        ]);

        const thisMonthsCollection = await Customer.aggregate([
            { $unwind: "$payments" },
            { $match: { "payments.date": { $gte: thisMonthStart, $lt: nextMonthStart } } },
            { $group: { _id: null, total: { $sum: "$payments.amount" } } }
        ]);

        const customerDistribution = await Customer.aggregate([
            { $group: { _id: "$area", count: { $sum: 1 } } },
            { $project: { _id: 0, area: "$_id", count: 1 } }
        ]);

        const topPayers = await Customer.aggregate([
            { $unwind: "$payments" },
            { $group: { _id: "$name", totalPaid: { $sum: "$payments.amount" } } },
            { $sort: { totalPaid: -1 } },
            { $limit: 5 }
        ]);

        // Monthly revenue data
        const monthlyRevenue = await Customer.aggregate([
            { $unwind: "$payments" },
            { $group: {
                _id: { $month: "$payments.date" },
                totalRevenue: { $sum: "$payments.amount" }
            }},
            { $sort: { "_id": 1 } }
        ]);

        res.status(200).json({
            totalCustomers,
            totalCollections: totalCollections.length > 0 ? totalCollections[0].total : 0,
            totalDues: totalDues.length > 0 ? totalDues[0].total : 0,
            totalAdvanced: totalAdvanced.length > 0 ? totalAdvanced[0].total : 0,
            todaysCollection: todaysCollection.length > 0 ? todaysCollection[0].total : 0,
            thisMonthsCollection: thisMonthsCollection.length > 0 ? thisMonthsCollection[0].total : 0,
            customerDistribution,
            topPayers,
            monthlyRevenue // Include monthly revenue in the response
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint for fetching chart data
app.get('/dashboard/chart-data', async (req, res) => {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // last 30 days
        startDate.setHours(0, 0, 0, 0);

        const chartData = await Customer.aggregate([
            { $unwind: "$payments" },
            { $match: { "payments.date": { $gte: startDate } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$payments.date" } },
                    total: { $sum: "$payments.amount" },
                    pay: { $sum: "$payments.amount" }, // Assuming 'amount' field exists
                    due: { $sum: { $subtract: ["$bill", { $sum: "$payments.amount" }] } } // Calculating due
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.status(200).json(chartData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Schedule to run on the first day of every month at 12:00 AM
cron.schedule('0 0 1 * *', async () => {
    try {
        // Clear all collections
        await Customer.deleteMany({});
        console.log('All collections cleared successfully.');
    } catch (err) {
        console.error('Error clearing collections:', err);
    }
});

// Endpoint to store monthly reports
app.post('/monthly-reports', async (req, res) => {
    try {
        // Perform calculations for monthly reports
        const totalCollections = await Customer.aggregate([
            { $unwind: "$payments" },
            { $group: { _id: null, total: { $sum: "$payments.amount" } } }
        ]);

        const totalDues = await Customer.aggregate([
            { $match: { paymentStatus: "Unpaid" } },
            { $group: { _id: null, total: { $sum: "$due" } } }
        ]);

        const totalAdvanced = await Customer.aggregate([
            { $unwind: "$payments" },
            { $match: { $expr: { $gt: ["$payments.amount", "$bill"] } } },
            { $group: { _id: null, total: { $sum: { $subtract: ["$payments.amount", "$bill"] } } } }
        ]);

        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1; // getMonth() is zero-based

        const monthlyReportInstance = new MonthlyReport({
            year,
            month,
            totalCollections: totalCollections.length > 0 ? totalCollections[0].total : 0,
            totalDues: totalDues.length > 0 ? totalDues[0].total : 0,
            totalAdvanced: totalAdvanced.length > 0 ? totalAdvanced[0].total : 0,
        });

        await monthlyReportInstance.save();
        res.status(201).send('Monthly report stored successfully.');
    } catch (err) {
        console.error('Error storing monthly report:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint to get distinct areas
app.get('/areas', async (req, res) => {
    try {
        const areas = await Customer.distinct('area');
        res.status(200).json(areas);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Handle 404 Error
app.use((req, res) => {
    res.status(404).send('404 Page Not Found');
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
