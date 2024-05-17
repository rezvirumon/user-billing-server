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

// MongoDB Connection URI with the new database location
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jaknolq.mongodb.net/user-billing-rumon`;

mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

    const customerSchema = new mongoose.Schema({
        name: { type: String, required: true },
        mobile: { type: String, required: true },
        area: { type: String, required: true },
        email: { type: String, required: true },
        bill: { type: Number, default: 0 },
        payments: [{ amount: Number, date: Date }],
        due: { type: Number, default: 0 },
        lastPayDate: { type: Date }
    });

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
    const { name, mobile, area, email, bill } = req.body; // Get updated data from request body
    try {
        const updatedCustomer = await Customer.findByIdAndUpdate(customerId, { name, mobile, area, email, bill }, { new: true });
        if (!updatedCustomer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.status(200).json(updatedCustomer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Update payment for a customer by ID
app.put('/billing/:id', async (req, res) => {
    const customerId = req.params.id;
    const { payment } = req.body; // Get updated payment from request body
    try {
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).send('Customer not found');
        }

        customer.payments.push({ amount: payment, date: new Date() });
        customer.due = customer.bill - customer.payments.reduce((sum, p) => sum + p.amount, 0);
        customer.lastPayDate = new Date();

        await customer.save();
        res.status(200).send(customer);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
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
