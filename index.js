const dns = require('node:dns');
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const uri = process.env.MONGODB_URI;
const app = express()
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
const JWKS = createRemoteJWKSet(
      new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));
   
const verifyToken = async (req, res, next)=>{
const authHeader = req.headers.authorization
if(!authHeader){
  return res.status(401).json({message: "Unauthorized"})
}
const token = authHeader.split(" ")[1]
console.log(token)
if(!token){
  return res.status(401).json({message: "Unauthorized"})
}
 try {
  const { payload } = await jwtVerify(token, JWKS);

  req.user = payload;

  console.log("Verified User:", payload);

  next();
} catch (error) {
  console.log(error);

  return res.status(401).json({
    message: "Forbidden",
  });
}
};
async function run() {
  try {
    
    const Stripe = require("stripe");

const stripe = Stripe(
  process.env.STRIPE_SECRET_KEY
);
    const requestsCollection = client.db("blood-donation").collection("requests");
const usersCollection =
  client.db("blood-donation").collection("users");

const fundingCollection =
  client.db("blood-donation").collection("fundings");
    app.get("/api/my-donation-requests", async (req, res) => {
  try {
    console.log("QUERY:", req.query);
    const { email, status, page = 1, limit = 5 } = req.query;

    const query = {
      requesterEmail: email,
    };
console.log("Mongo Query:", query);
    if (status && status !== "all") {
      query.donationStatus = status;
    }

    const total = await requestsCollection.countDocuments(query);

    const requests = await requestsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .toArray();
console.log("Requests Found:", requests);
    res.send({
      requests,
      totalPages: Math.ceil(total / limit),
      total,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
app.post(
  "/api/create-payment-intent",verifyToken,
  async (req, res) => {
    try {
      const { amount } = req.body;

      const paymentIntent =
        await stripe.paymentIntents.create({
          amount: amount * 100, // taka → paisa/cents
          currency: "usd",
          payment_method_types: ["card"],
        });

      res.send({
        clientSecret:
          paymentIntent.client_secret,
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: error.message,
      });
    }
  }
);
app.patch("/api/donation-request/status/:id",verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await requestsCollection.updateOne(
      {
        _id: new ObjectId(id),
      },
      {
        $set: {
          donationStatus: status,
        },
      }
    );

    res.send({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
    app.get("/api/recent-donation-requests/:email",verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        const requests = await requestsCollection
          .find({ requesterEmail: email })
          .sort({ createdAt: -1 })
          .limit(3)
          .toArray();

        res.send(requests);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // single request
    app.get("/api/donation-request/:id",verifyToken, async (req, res) => {
      try {
        const result = await requestsCollection.findOne({
          _id: new ObjectId(req.params.id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });

    // update request
    app.patch("/api/donation-request/:id",verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        const updateDoc = {
          $set: req.body,
        };

        const result = await requestsCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });
    app.delete('/api/donation-request/:id',verifyToken, async(req,res)=>{
 const { id } = req.params;

 const result = await requestsCollection.deleteOne({
   _id: new ObjectId(id)
 });

 res.send(result);
});
app.post("/api/donation-requests",verifyToken, async (req, res) => {
  console.log("POST API HIT");
  console.log(req.body);
  try {
    const {
      requesterName,
      requesterEmail,
      recipientName,
      recipientDistrict,
      recipientUpazila,
      hospitalName,
      fullAddress,
      bloodGroup,
      donationDate,
      donationTime,
      requestMessage,
    } = req.body;

    const newRequest = {
      requesterName,
      requesterEmail,
      recipientName,
      recipientDistrict,
      recipientUpazila,
      hospitalName,
      fullAddress,
      bloodGroup,
      donationDate,
      donationTime,
      requestMessage,
      donationStatus: "pending",
      createdAt: new Date(),
    };

    const result = await requestsCollection.insertOne(newRequest);
console.log("Inserted ID:", result.insertedId);
    res.status(201).send({
      success: true,
      message: "Donation request created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
app.get("/api/admin-stats",verifyToken, async (req, res) => {
  try {
    const totalUsers =
      await usersCollection.countDocuments();

    const totalRequests =
      await requestsCollection.countDocuments();

    const fundingStats =
      await fundingCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalFunding: {
                $sum: "$amount",
              },
            },
          },
        ])
        .toArray();

    const totalFunding =
      fundingStats.length > 0
        ? fundingStats[0].totalFunding
        : 0;

    res.send({
      totalUsers,
      totalRequests,
      totalFunding,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
app.post("/api/users",verifyToken, async (req, res) => {
  const { name, email, image } = req.body;

  const userData = {
    name,
    email,
    image,
    role: "donor",
    status: "active",
    createdAt: new Date(),
  };

  const result = await usersCollection.insertOne(userData);

  res.send(result);
});
// Get All Users
app.get("/api/users",verifyToken, async (req, res) => {
  try {
    const { status } = req.query;

    let query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    const users = await usersCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(users);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

// Update User Status
app.patch("/api/users/status/:id",verifyToken, async (req, res) => {
  try {
    const { status } = req.body;

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: { status },
      }
    );

    res.send({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

// Update User Role
app.patch("/api/users/role/:id",verifyToken, async (req, res) => {
  try {
    const { role } = req.body;

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: { role },
      }
    );

    res.send({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// Get All Donation Requests (Admin)
app.get("/api/all-blood-donation-requests",verifyToken, async (req, res) => {
  try {
    const { status } = req.query;

    let query = {};

    if (status && status !== "all") {
      query.donationStatus = status;
    }

    const requests = await requestsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(requests);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
app.get("/api/all-blood-donation-requests",verifyToken, async (req, res) => {
  try {
    const { status } = req.query;

    let query = {};

    if (status && status !== "all") {
      query.donationStatus = status;
    }

    const requests = await requestsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(requests);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// Get User By Email
app.get("/api/user/:email",verifyToken, async (req, res) => {
  try {
    const email = req.params.email;

    const user = await usersCollection.findOne({
      email,
    });

    res.send(user);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

// Update Profile
app.patch("/api/user/:email",verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
console.log("EMAIL:", email);
    console.log("BODY:", req.body);
    const result = await usersCollection.updateOne(
      { email },
      {
        $set: {
          name: req.body.name,
          image: req.body.image,
          district: req.body.district,
          upazila: req.body.upazila,
          bloodGroup: req.body.bloodGroup,
        },
      }
    );
 console.log("RESULT:", result);
    res.send({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
app.get("/api/public-donation-requests", async (req, res) => {
  try {
    const requests = await requestsCollection
      .find({
        donationStatus: "pending",
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(requests);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
app.patch("/api/donation-request/donate/:id", async (req, res) => {
  try {
    const { donorName, donorEmail } = req.body;

    const result = await requestsCollection.updateOne(
      {
        _id: new ObjectId(req.params.id),
      },
      {
        $set: {
          donationStatus: "inprogress",
          donorName,
          donorEmail,
        },
      }
    );

    res.send({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
app.patch("/api/donate/:id",verifyToken, async (req, res) => {
  try {
    const { donorName, donorEmail } = req.body;

    const result = await requestsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          donorName,
          donorEmail,
          donationStatus: "inprogress",
        },
      }
    );

    res.send({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
app.get("/api/search-donors", async (req, res) => {
  try {
    const { bloodGroup, district, upazila } = req.query;

    const query = {
      role: "donor",
      status: "active",
    };

    if (bloodGroup) {
      query.bloodGroup = bloodGroup;
    }

    if (district) {
      query.district = district;
    }

    if (upazila) {
      query.upazila = upazila;
    }

    const donors = await usersCollection
      .find(query)
      .project({
        name: 1,
        email: 1,
        image: 1,
        bloodGroup: 1,
        district: 1,
        upazila: 1,
      })
      .toArray();

    res.send(donors);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
    // Send a ping to confirm a successful connection
   // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Server Running");
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
