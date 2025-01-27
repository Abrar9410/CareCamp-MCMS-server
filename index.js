require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,
    optionalSuccessStatus: 200,
}));
app.use(express.json());
app.use(cookieParser());

// Verify Token
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' });
        }
        req.user = decoded;
    })
    next();
}




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2zcny.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const database = client.db("CareCamp_DB");
        const campCollection = database.collection("camps");
        const userCollection = database.collection("users");
        const registeredCampCollection = database.collection("registered-camps");
        const feedbackCollection = database.collection("feedbacks");

        // Verify Admin (after Verify Token)
        const verifyAdmin = async (req, res, next) => {
            const email = req.user.email;
            const query = { email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // generate jwt
        app.post('/jwt', async (req, res) => {
            const email = req.body;
            // create token
            const token = jwt.sign(email, process.env.SECRET_KEY, {
                expiresIn: '30d',
            });
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })

        // logout || clear cookie from browser
        app.get('/logout', async (req, res) => {
            res
                .clearCookie('token', {
                    maxAge: 0,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })

        // Users related API

        // GET API
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.user.email) {
                return res.status(403).send({message: 'forbidden access'})
            };

            const query = {email};
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user.role === 'admin';
            }
            res.send({admin});
        })

        // POST API
        app.post('/users', async (req, res) => {
            const user = req.body;
            const email = user?.email;
            const query = {email};
            const exists = await userCollection.findOne(query);
            if (exists) return res.send({message: "User already exists"});
            const result = await userCollection.insertOne({...user, role: "user"});
            res.send(result);
        })

        // PATCH API
        app.patch('/users/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.user.email) {
                return res.status(403).send({message: "forbidden access"});
            }
            const updatedUser = req.body;
            const filter = {email};
            if (updatedUser.photoURL) {
                const updatedDoc = {
                    $set: {
                        name: updatedUser.displayName,
                        image: updatedUser.photoURL
                    }
                };
                const result = await userCollection.updateOne(filter, updatedDoc);
                res.send(result);
            }
            else {
                const updatedDoc = {
                    $set: {
                        name: updatedUser.displayName
                    }
                };
                const result = await userCollection.updateOne(filter, updatedDoc);
                res.send(result);
            }
        })

        // Camps related APIs

        // GET APIs
        app.get('/camps', async (req, res) => {
            const limit = parseInt(req.query.limit);
            const search = req.query.search;
            const query = {
                $or: [
                    {title: {$regex: search, $options: 'i'}},
                    { location: {$regex: search, $options: 'i' }},
                    { date: {$regex: search }},
                ]
            };
            const cursor = campCollection.find(query);
            if (limit) {
                const result = await cursor.sort({ participants: -1 }).limit(limit).toArray();
                return res.send(result);
            }
            const result = await cursor.toArray() || [];
            res.send(result);
        })

        app.get('/camps/:campId', async (req, res) => {
            const campId = req.params.campId;
            const query = {_id: new ObjectId(campId)};
            const result = await campCollection.findOne(query);
            res.send(result);
        })

        // POST API
        app.post('/camps', verifyToken, verifyAdmin, async (req, res) => {
            const camp = req.body;
            const result = await campCollection.insertOne({...camp, participants: 0});
            res.send(result);
        })

        // PATCH API
        app.patch('/update-camp/:campId', verifyToken, verifyAdmin, async (req, res) => {
            const campId = req.params.campId;
            const updatedCamp = req.body;
            const filter = {_id: new ObjectId(campId)};
            if (updatedCamp.thumbnail) {
                const updatedDoc = {
                    $set: {
                        title: updatedCamp.title,
                        thumbnail: updatedCamp.thumbnail,
                        location: updatedCamp.location,
                        date: updatedCamp.date,
                        time: updatedCamp.time,
                        fee: updatedCamp.fee,
                        hpName: updatedCamp.hpName,
                        description: updatedCamp.description
                    }
                };
                const result = await campCollection.updateOne(filter, updatedDoc);
                return res.send(result);
            };
            const updatedDoc = {
                $set: {
                    title: updatedCamp.title,
                    location: updatedCamp.location,
                    date: updatedCamp.date,
                    time: updatedCamp.time,
                    fee: updatedCamp.fee,
                    hpName: updatedCamp.hpName,
                    description: updatedCamp.description,
                }
            };
            const result = await campCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        // DELETE API 
        app.delete('/delete-camp/:campId', verifyToken, verifyAdmin, async (req, res) => {
            const campId = req.params.campId;
            const query = {_id: new ObjectId(campId)};
            const result = await campCollection.deleteOne(query);
            res.send(result);
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('CareCamp Server is taking care');
})

app.listen(port, () => {
    console.log(`CareCamp Server is running on port: ${port}`);
})