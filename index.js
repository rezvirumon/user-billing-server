const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

require('dotenv').config();
const port = process.env.PORT || 5000;

const app = express();

app.use(cors({
    origin: [
        "http://localhost:5173",
    ],
    credentials: true,
}));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Customer Service Running');
});

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
    email: { type: String, required: true }
});

const Customer = mongoose.model('Customer', customerSchema);

// Add a new customer
app.post('/customers', async (req, res) => {
    const { name, mobile, area, email } = req.body;
    try {
        const newCustomer = new Customer({ name, mobile, area, email });
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

// Update a customer by ID
app.put('/customers/:id', async (req, res) => {
    const customerId = req.params.id;
    const { name, mobile, area, email } = req.body; // Get updated data from request body
    try {
        // Find the customer by ID and update its fields
        const updatedCustomer = await Customer.findByIdAndUpdate(customerId, { name, mobile, area, email }, { new: true });
        if (!updatedCustomer) {
            return res.status(404).send('Customer not found');
        }
        res.status(200).send(updatedCustomer);
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
            return res.status(404).send('Customer not found');
        }
        res.status(200).json(customer); // Return customer details as JSON
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});



// Handle 404 Error
app.use((req, res, next) => {
    res.status(404).send('404 Page Not Found');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
