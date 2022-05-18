
const express = require('express')
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000

//midleware
app.use(cors())
app.use(express.json())


function varifyJWT(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).send({ message: "UnAuthorized Access" })
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SCREET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "Forbiden Access" })
        }
        req.decoded = decoded
        next()
    });

}
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ngwpr.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db("doctors_portal").collection("services");
        const bookingCollection = client.db("doctors_portal").collection("bookings");
        const userCollection = client.db("doctors_portal").collection("users");


        app.get('/service', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query)
            const services = await cursor.toArray()
            res.send(services)
        })

        /**
         * naming convention
         * -------------------
         * app.get('/booking')->get all booking collection or more than one filter
         * app.get('/booking:id')-> get a specific booking
         * app.post('/booking')->add a new booking
         * app.patch(/booking:id)->speacific a booking update
         * app.put(/user:id) -> upsert
         * app.delete("/booking:id")->speacfic delete a booking
         * 
         */
        //geting all user
        app.get('/user', varifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })
        //make protected specific admin
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === "admin"
            res.send({ admin: isAdmin })
        })

        //make admin
        app.put('/user/admin/:email', varifyJWT, async (req, res) => {
            const email = req.params.email
            const requester = req.decoded.email
            const requestAccount = await userCollection.findOne({ email: requester })
            if (requestAccount.role === "admin") {
                const filter = { email: email }
                const updateDoc = {
                    $set: { role: "admin" },
                };
                const result = await userCollection.updateOne(filter, updateDoc)
                res.send(result)
            }
            else {
                res.status(403).send({ message: "Forbiden" })
            }

        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SCREET, { expiresIn: '1h' })
            res.send({ result, token })
        })

        app.get('/booking', varifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }

        })
        //booking
        app.post('/booking', async (req, res) => {
            const booking = req.body
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking)
            res.send({ success: true, result })
        })

        app.get('/avilable', async (req, res) => {
            const date = req.query.date
            //step-1: get all service
            const services = await serviceCollection.find().toArray()
            //step-2: get the booking that day
            const query = { date: date }
            const bookings = await bookingCollection.find(query).toArray()
            //step-3:for each service,
            services.forEach(service => {
                //step-4:find booking for that service
                const serviceBooking = bookings.filter(book => book.treatment === service.name)
                //step-5: select slots for the service bookings
                const bookdSlots = serviceBooking.map(book => book.slot)
                //step-6: select those slot that are not in bookedSlots
                const avilable = service.slots.filter(slot => !bookdSlots.includes(slot))
                service.slots = avilable
            })


            res.send(services)
        })
    }
    finally {

    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Doctors Portal!')
})

app.listen(port, () => {
    console.log(`Doctors Portal app listening on port ${port}`)
})