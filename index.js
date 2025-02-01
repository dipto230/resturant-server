const express = require('express');

const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);




const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.x2qb8.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        await client.connect();

        const menuCollection = client.db("BistroDB").collection("menu");
        const userCollection = client.db("BistroDB").collection("users");
        const reviewCollection = client.db("BistroDB").collection("reviews");
        const cartCollection = client.db("BistroDB").collection("carts");
        const paymentCollection = client.db("BistroDB").collection("payments");

        // Generate JWT
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        // Middleware to verify JWT
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Forbidden access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
                if (error) {
                    return res.status(401).send({ message: 'Forbidden access' });
                }
                req.decoded = decoded;
                next();
            });
        };

        // Middleware to verify Admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            next();
        };

        // User routes
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.post('/menu',  verifyToken, verifyAdmin,async(req, res)=>{
          const item = req.body;
          const result =  await menuCollection.insertOne(item);
          res.send(result);

        });
        app.patch('/menu/:id', async(req, res)=>{
            const item = req.body;
            const id = req.params.id;
            const filter ={_id: new ObjectId(id) }
            const updatedDoc ={
                $set:{
                    name: item.name,
                    category: item.category,
                    price : item.price,
                    recipe : item.recipe,
                    image: item.image
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })
        app.get('/menu/:id', async(req, res)=>{
            const id = req.params.id;
            const query = {_id:new ObjectId(id) }
            const result = await menuCollection.findOne(query);
            res.send(result);

        })

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) }
          const result = await menuCollection.deleteOne(query);
          res.send(result);
        });

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Unauthorized access' });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            res.send({ admin: isAdmin });
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'User already exists', insertedId: null });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin',
                },
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        });

        // Menu routes
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result);
        });

        // Review routes
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        });

        // Cart routes
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.status(400).send({ message: 'Email query parameter is required' });
            }
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        });

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
        
            if (!price) {
                return res.status(400).send({ error: 'Price is required' });
            }
        
            const amount = parseInt(price * 100); // Convert price to cents
            console.log(amount, 'amount inside the intent');
        
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: 'usd',
                    payment_method_types: ['card'],
                });
        
                res.send({
                    clientSecret: paymentIntent.client_secret,
                });
            } catch (error) {
                console.error('Error creating payment intent:', error);
                res.status(500).send({ error: 'Failed to create payment intent' });
            }
        });
        app.get('/payments/:email',verifyToken, async(req, res)=>{
            const query = {email: req.params.email}
            if(req.params.email !== req.decoded.email){
                return res.status(403).send({message:'forbidden access '});
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/payments', async(req, res )=>{
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            console.log('payment info',payment);
            const query ={_id:{
               $in: payment.cartIds.map(id => new ObjectId(id))


            }};

            const deleteResult = await cartCollection.deleteMany(query);
            res.send({paymentResult, deleteResult});

        })

    app.get('/admin-stats', verifyToken, verifyAdmin, async(req, res)=>{
        const users = await userCollection.estimatedDocumentCount();
        const menuItems = await menuCollection.estimatedDocumentCount();
        const orders = await paymentCollection.estimatedDocumentCount();

        // const payments = await paymentCollection.find().toArray();
        // const revenue = payments.reduce((total , payment)=> total + payment.price, 0);
        const result = await paymentCollection.aggregate([
            {
                $group:{
                    _id:null,
                    totalRevenue:{
                        $sum:'$price'
                    }
                }
            }
        ]).toArray();
        const revenue = result.length >0 ? result[0].totalRevenue : 0;

        res.send({
            users,
            menuItems,
            orders,
            revenue
        })
    })
        

        await client.db("admin").command({ ping: 1 });
        console.log("Connected to MongoDB successfully!");
    } finally {
        // Keep the connection alive for production use.
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Bistro Boss server is running!');
});

app.listen(port, () => {
    console.log(`Bistro Boss server is running on port ${port}`);
});
