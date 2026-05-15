import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from './db.js';
import { users, complaints } from './schema.js';
import { eq, and, desc } from 'drizzle-orm';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: 'https://aakashmont95-svg.github.io',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Nodemailer Config
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Gemini Config
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// --- Auth Routes ---

app.post('/api/auth/send-otp', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ message: 'Name and Email are required' });

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Check if user already exists and is verified
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email)
    });

    if (existingUser && existingUser.is_verified) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    if (existingUser) {
      // Update existing unverified user
      await db.update(users)
        .set({ name, otp, otp_expiry })
        .where(eq(users.id, existingUser.id));
    } else {
      // Create new unverified user
      await db.insert(users).values({
        name,
        email,
        password: '', // Placeholder
        otp,
        otp_expiry,
        is_verified: false
      });
    }

    // Send Email
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your Registration OTP',
      text: `Hello ${name}, your OTP for registration is: ${otp}. It expires in 10 minutes.`
    });

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error sending OTP' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) return res.status(400).json({ message: 'All fields are required' });

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email)
    });

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date() > user.otp_expiry) return res.status(400).json({ message: 'OTP expired' });

    await db.update(users)
      .set({
        password, // Plain text as requested
        is_verified: true,
        otp: null,
        otp_expiry: null
      })
      .where(eq(users.id, user.id));

    res.json({ message: 'Registration successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await db.query.users.findFirst({
      where: and(eq(users.email, email), eq(users.is_verified, true))
    });

    if (!user || user.password !== password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: false,
      secure: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({ name: user.name, email: user.email, role: user.role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Login error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: false,
    secure: true,
    sameSite: 'none'
  });
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json(req.user);
});

// --- AI Routes ---

app.post('/api/ai/question', authenticateToken, async (req, res) => {
  const { complaint_text } = req.body;
  if (!complaint_text) return res.status(400).json({ message: 'Complaint text is required' });

  try {
    const prompt = `Based on the following complaint, generate exactly one short, relevant follow-up question to get more details: "${complaint_text}"`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) throw new Error('Empty response from AI');

    res.json({ question: text.trim() });
  } catch (error) {
    console.error('Gemini Error:', error);
    res.status(500).json({
      message: 'Error generating AI question',
      error: error.message
    });
  }
});

// --- Complaints Routes ---

app.post('/api/complaints', authenticateToken, async (req, res) => {
  const { complaint_text, ai_question, ai_answer } = req.body;
  try {
    const [newComplaint] = await db.insert(complaints).values({
      userId: req.user.id,
      complaintText: complaint_text,
      aiQuestion: ai_question,
      userAnswer: ai_answer
    }).returning();

    res.json(newComplaint);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error saving complaint' });
  }
});

app.get('/api/complaints/my', authenticateToken, async (req, res) => {
  try {
    const userComplaints = await db.query.complaints.findMany({
      where: eq(complaints.userId, req.user.id),
      orderBy: [desc(complaints.created_at)]
    });
    res.json(userComplaints);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching complaints' });
  }
});

app.get('/api/admin/complaints', authenticateToken, isAdmin, async (req, res) => {
  try {
    const allComplaints = await db.query.complaints.findMany({
      with: {
        user: true
      },
      orderBy: [desc(complaints.created_at)]
    });

    // Flatten result to match frontend expectation
    const result = allComplaints.map(c => ({
      ...c,
      userName: c.user.name,
      userEmail: c.user.email
    }));

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching all complaints' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
