const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const mongoose = require('mongoose'); // Import Mongoose

dotenv.config(); // Load environment variables

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Define a schema for the form submissions
const submissionSchema = new mongoose.Schema({
  name: String,
  number: String,
  email: String,
  subject: String,
  message: String,
  resume: String, // We'll store the file path here
  submittedAt: { type: Date, default: Date.now },
});
const Submission = mongoose.model('Submission', submissionSchema);

const app = express();

// Enable CORS and body parsing
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Ensure uploads folder exists
const uploadPath = 'uploads/';
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath);
}

// Set up file storage using multer
const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname); // Add timestamp to avoid conflicts
  },
});
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only .pdf, .doc, and .docx files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Set up Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address
    pass: process.env.EMAIL_PASS, // Your Gmail App Password
  },
});

// Form submission route with MongoDB integration
app.post('/api/submit-form', upload.single('resume'), async (req, res) => {
  const { name, number, email, subject, message } = req.body;
  const resume = req.file;

  if (!resume) {
    return res.status(400).json({ message: 'Resume file is required' });
  }

  console.log('Received Form:', { name, number, email, subject, message, resume });

  // Save the submission details to MongoDB
  try {
    const submission = new Submission({
      name,
      number,
      email,
      subject,
      message,
      resume: resume.path, // Save the path to the resume file
    });
    await submission.save();
    console.log('Submission saved to MongoDB.');
  } catch (err) {
    console.error('Error saving submission:', err);
    return res.status(500).json({ message: 'Error saving submission to database', error: err.message });
  }

  // Email options
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER, // Sending the email to yourself
    subject: `New Submission: ${subject}`,
    text: `Name: ${name}\nNumber: ${number}\nEmail: ${email}\nMessage: ${message}`,
    attachments: [{ filename: resume.originalname, path: resume.path }],
  };

  // Send the email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error.message);
      return res.status(500).json({ message: 'Error sending email', error: error.message });
    }
    console.log('Email sent:', info.response);
    res.json({ message: 'Form submitted, saved to DB, and email sent successfully!' });
  });
});

// Start the server
app.listen(5001, () => {
  console.log('Server running on http://localhost:5001');
});
