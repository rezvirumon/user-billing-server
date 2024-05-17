const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ["http://localhost:5173"],
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

// Customer Schema
const customerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    area: { type: String, required: true },
    email: { type: String, required: true },
    bill: { type: Number, default: 0 },
    payments: [{ amount: Number, date: Date }],
    due: { type: Number, default: 0 },
    lastPayDate: { type: Date },
    paymentStatus: { type: String, default: 'Unpaid' }
});

// Method to calculate payment status
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

// Routes
app.get('/', (req, res) => {
    res.send('Customer Service Running');
});

// Add a new customer
app.post('/customers', async (req, res) => {
    const { name, mobile, area, email, bill } = req.body;
    try {
        const newCustomer = new Customer({ name, mobile, area, email, bill, due: bill });
        newCustomer.calculatePaymentStatus();
        await newCustomer.save();
        res.status(201).send(newCustomer);
    } catch (err) {
        console.error(err);
        res.status(400).send(err.message);
    }
});

// Get the list of customers
app.get('/customers', async (req, res) => {
    try {
        const customers = await Customer.find();
        res.status(200).send(customers);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
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
        res.status(500).send(err.message);
    }
});

// Update a customer's details by ID
app.put('/customers/:id', async (req, res) => {
    const customerId = req.params.id;
    const { name, mobile, area, email, bill } = req.body;
    try {
        const updatedCustomer = await Customer.findByIdAndUpdate(customerId, { name, mobile, area, email, bill }, { new: true });
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
    const { payment } = req.body;
    try {
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).send('Customer not found');
        }

        customer.payments.push({ amount: payment, date: new Date() });
        customer.calculatePaymentStatus();
        customer.lastPayDate = new Date();

        await customer.save();
        res.status(200).send(customer);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
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
        res.status(500).send(err.message);
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

        res.status(200).json({
            totalCustomers: totalCustomers,
            totalCollections: totalCollections.length > 0 ? totalCollections[0].total : 0,
            totalDues: totalDues.length > 0 ? totalDues[0].total : 0,
            totalAdvanced: totalAdvanced.length > 0 ? totalAdvanced[0].total : 0,
            todaysCollection: todaysCollection.length > 0 ? todaysCollection[0].total : 0,
            thisMonthsCollection: thisMonthsCollection.length > 0 ? thisMonthsCollection[0].total : 0
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

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
