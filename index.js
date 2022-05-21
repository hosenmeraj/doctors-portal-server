
const express = require('express')
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000

//midleware
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ngwpr.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

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

var emailSendOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}
const emailClient = nodemailer.createTransport(sgTransport(emailSendOptions));

function sendAppointmentEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking
    var email = {
        from: process.env.EMAIL_SENDER_ADDRESS,
        to: patient,
        subject: `Your Appointment for ${treatment} is on ${date} at ${slot} confrim`,
        text: `Your Appointment for ${treatment} is on ${date} at ${slot} confrim`,
        html: `
        <div>
        <h2>Hello ${patientName}</h2>
        <p>Your Appointed ${treatment} is confrim</p>
        <p>Looking forwared seeing you on ${date} at ${slot}</p>
        </div>
        `
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });

}
function sendPaymentConfirmationEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;

    var email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `We have received your payment for ${treatment} is on ${date} at ${slot} is Confirmed`,
        text: `Your payment for this Appointment ${treatment} is on ${date} at ${slot} is Confirmed`,
        html: `
        <div>
          <p> Hello ${patientName}, </p>
          <h3>Thank you for your payment . </h3>
          <h3>We have received your payment</h3>
          <p>Looking forward to seeing you on ${date} at ${slot}.</p>
          <h3>Our Address</h3>
          <p>Andor Killa Bandorban</p>
          <p>Bangladesh</p>
          <a href="https://web.programming-hero.com/">unsubscribe</a>
        </div>
      `
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });

}


async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db("doctors_portal").collection("services");
        const bookingCollection = client.db("doctors_portal").collection("bookings");
        const userCollection = client.db("doctors_portal").collection("users");
        const doctorCollection = client.db("doctors_portal").collection("doctors");
        const paymentCollection = client.db("doctors_portal").collection("payments");


        //varify doctor 
        const varifyAdmin = async (req, res, next) => {

            const requester = req.decoded.email
            const requestAccount = await userCollection.findOne({ email: requester })
            if (requestAccount.role === "admin") {
                next()
            }
            else {
                res.status(403).send({ message: "Forbiden" })
            }
        }

        app.get('/service', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query).project({ name: 1 })
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

        //manage doctor
        app.get('/doctor', varifyJWT, varifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray()
            res.send(doctors)
        })
        app.delete('/doctor/:email', varifyJWT, varifyAdmin, async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter)
            res.send(result)
        })

        //make admin
        app.put('/user/admin/:email', varifyJWT, varifyAdmin, async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const updateDoc = {
                $set: { role: "admin" },
            };
            const result = await userCollection.updateOne(filter, updateDoc)
            res.send(result)

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
        //payment booking
        app.get('/booking/:id', varifyJWT, async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const booking = await bookingCollection.findOne(query)
            res.send(booking)
        })
        //payment price update
        app.post('/create-payment-intent', async (req, res) => {
            const service = req.body
            const price = service.price
            const amount = price * 100
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            })
            res.send({ clientSecret: paymentIntent.client_secret })
        })
        //payment update
        app.patch('/booking/:id', varifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(updatedBooking);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking)
            console.log("email is sending");
            sendAppointmentEmail(booking)
            res.send({ success: true, result })
        })

        //insert doctor
        app.post('/doctor', varifyJWT, varifyAdmin, async (req, res) => {
            const doctor = req.body
            const result = await doctorCollection.insertOne(doctor)
            res.send(result)
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