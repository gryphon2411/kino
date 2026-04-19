'use strict'

// Import required modules
require('dotenv').config()
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const zxcvbn = require('zxcvbn');
const nodemailer = require('nodemailer');
const speakeasy = require('speakeasy');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_PATH);

// Define User schema
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
    minLength: 8,
    maxLength: 64,
  },
  email: {
    type: String,
    required: true,
    match: [/^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/, 'Please fill a valid email address'],
  },
  mfa: {
    secret: {
      type: String,
      required: true
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    // TODO: add enabledDate: Date, default: null here
    // and add new Date().toISOString() to jwt sign
    // in /secured, if mfa enabled, verify that enabledDate < new Date(jwt date) 
  },
});

// Pre-save hook to hash password
UserSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, Number(process.env.SALT_ROUNDS));
  }
  next();
});

// Method to check password validity
UserSchema.methods.isValidPassword = function(password) {
  return bcrypt.compare(password, this.password);
};

// Create User model
const User = mongoose.model('User', UserSchema);

// Create a emailTransporter object using the default SMTP transport
// let emailTransporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.EMAIL_USERNAME,
//     pass: process.env.EMAIL_PASSWORD,
//   },
// });

let emailTransporter;

// Generate SMTP service account from ethereal.email
nodemailer.createTestAccount((err, account) => {
  if (err) {
      console.error('Failed to create a testing account. ' + err.message);
      return process.exit(1);
  }

  console.log('Credentials obtained:', account);

  // Create a SMTP transporter object
  emailTransporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: {
          user: account.user,
          pass: account.pass
      }
  });
});

// Initialize Express app
const app = express();
app.use(express.json());
app.use(morgan(process.env.MORGAN_MODE));

// Register route
app.post('/auth/api/v1/register', async (req, res) => {
  const passwordStrength = zxcvbn(req.body.password);
  if (passwordStrength.score < 3) {
    return res.status(400).json({
      message: 'Password is too weak',
      suggestions: passwordStrength.feedback.suggestions,
    });
  }
  
  const user = new User(req.body);
  user.mfa.secret = speakeasy.generateSecret().base32;

  try {
    await user.save();
    res.sendStatus(201); 
  } catch (error) {
    res.status(400).send(error.message)
  }
});

// Login route
app.post('/auth/api/v1/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await user.isValidPassword(req.body.password))) {
    return res.sendStatus(401);
  }

  if (user.mfa.enabled == false) {
    const token = jwt.sign({ _id: user._id }, process.env.SECRET_KEY);
    res.send({ token });
  } else {
    const token = speakeasy.totp({ secret: user.mfa.secret, encoding: 'base32' });

    let info = await emailTransporter.sendMail({
      from: process.env.EMAIL_USERNAME,
      to: `${user.username} <${user.email}>`,
      subject: 'Kino Login Code',
      text: `Your Code: ${token}`,
      html: `
        <div style="text-align: center;">
          <p>
            <h1>Your Code: <span style="letter-spacing: 6px;">${token}</span></h1>
            <h1>🤫</h1>
            <h3>Your code expires in about 30 seconds</h3>
          </p>
        </div>
        `,
    });

    console.log("Mail sent:", info); 
    
    res.send({ message: 'Code sent to email' });
  }
});

app.post('/auth/api/v1/mfa/verify', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return res.sendStatus(401);
  }

  const isVerified = speakeasy.totp.verify({
    secret: user.mfa.secret,
    encoding: 'base32',
    token: req.body.code,
    window: 1
  });

  if (isVerified == false) {
    return res.sendStatus(401);
  }

  const token = jwt.sign({ _id: user._id }, process.env.SECRET_KEY);
  res.send({ token });
});

app.put('/auth/api/v1/mfa/enable', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await user.isValidPassword(req.body.password))) {
    return res.sendStatus(401);
  }

  user.mfa.enabled = true;

  try {
    await user.save();
    res.status(200).send({ message: 'Multifactor Authentication (MFA) enabled' });
  } catch (error) {
    res.status(400).send(error.message)
  }
});

// Secured route
app.get('/auth/api/v1/secured', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.sendStatus(401);
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.SECRET_KEY);
    const user = await User.findById(payload._id);
    if (!user) {
      return res.sendStatus(401);
    }
    res.status(200).send('You have accessed a secured route!');
  } catch (err) {
    return res.sendStatus(401);
  }
});

// Start server
app.listen(3000, () => console.log('Server started on port 3000'));