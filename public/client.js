const express = require('express');
const app = express();
const cors = require('cors');
app.use(cors());

app.use(express.json());

// মেমোরি বেসড রুম স্টোরেজ (প্র্যাকটিসের জন্য)
const rooms = new Set();

// রুম চেক করার API (GET)
app.get('/check-room', (req, res) => {
  const roomId = req.query.id;
  if (!roomId) {
    return res.status(400).send({ error: 'Room ID is required' });
  }

  if (rooms.has(roomId)) {
    res.status(200).send({ exists: true });
  } else {
    res.status(404).send({ exists: false });
  }
});

// নতুন রুম তৈরি (POST)
app.post('/create-room', (req, res) => {
  const roomId = req.body.id;
  if (!roomId) {
    return res.status(400).send({ success: false, message: 'Room ID is required' });
  }

  if (rooms.has(roomId)) {
    res.status(400).send({ success: false, message: 'Room already exists' });
  } else {
    rooms.add(roomId);
    res.status(201).send({ success: true, id: roomId });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
