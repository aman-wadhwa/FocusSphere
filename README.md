# FocusSphere - Virtual Study Room

A real-time collaborative study platform that matches users based on study goals and provides synchronized Pomodoro timers and chat functionality.

## Features

- 🔐 User authentication (Register/Login)
- 🤝 AI-powered study partner matching
- ⏱️ Synchronized Pomodoro timer
- 💬 Real-time chat during study sessions
- 📊 Comprehensive study statistics
- 📈 Daily, weekly, and monthly activity tracking
- 🎯 Study goals breakdown

## Prerequisites

- **Python 3.8+** (for backend)
- **Node.js 16+** and **npm** (for frontend)
- **Google Gemini API Key** (for AI matching)

## Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment (recommended):
```bash
# On Windows
python -m venv venv
venv\Scripts\activate

# On macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

3. Install Python dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the `backend` directory:
```bash
# Create .env file
touch .env  # On Windows: type nul > .env
```

5. Add your Gemini API key to the `.env` file:
```
GEMINI_API_KEY=your_gemini_api_key_here
```

   **How to get a Gemini API key:**
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Sign in with your Google account
   - Click "Create API Key"
   - Copy the key and paste it in your `.env` file

6. Initialize the database (runs automatically on first start, but you can also do it manually):
```bash
python -c "from app import app, db; app.app_context().push(); db.create_all()"
```

### 2. Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install Node.js dependencies:
```bash
npm install
```

## Running the Project

### Start the Backend Server

1. Open a terminal/command prompt
2. Navigate to the backend directory:
```bash
cd backend
```

3. Activate your virtual environment (if you created one):
```bash
# On Windows
venv\Scripts\activate

# On macOS/Linux
source venv/bin/activate
```

4. Run the Flask server:
```bash
python app.py
```

The backend server will start on `http://127.0.0.1:5000`

You should see:
```
Starting Flask-SocketIO server with gevent...
 * Running on http://127.0.0.1:5000
```

### Start the Frontend Server

1. Open a **new** terminal/command prompt (keep the backend running)
2. Navigate to the frontend directory:
```bash
cd frontend
```

3. Start the development server:
```bash
npm run dev
```

The frontend will start on `http://localhost:5173` (or another port if 5173 is busy)

You should see:
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Access the Application

1. Open your web browser
2. Navigate to `http://localhost:5173` (or the port shown in your terminal)
3. You should see the FocusSphere login/register page

## Usage

1. **Register a new account** or **login** with existing credentials
2. **Set your study goal** and click "Set Status to 'Searching'"
3. **Click "Find a Match!"** to find study partners
4. **Send an invitation** to a matched user
5. When they accept, you'll enter a **study session** with:
   - Synchronized Pomodoro timer
   - Real-time chat
6. **View your statistics** by clicking the "Statistics" tab

## Project Structure

```
virtual_study_room/
├── backend/
│   ├── app.py              # Flask backend server
│   ├── requirements.txt    # Python dependencies
│   ├── database.db         # SQLite database (created automatically)
│   └── .env                # Environment variables (create this)
│
└── frontend/
    ├── src/
    │   ├── App.jsx         # Main React component
    │   ├── PomodoroTimer.jsx
    │   ├── StudyStats.jsx  # Statistics component
    │   └── ...
    ├── package.json        # Node.js dependencies
    └── vite.config.js      # Vite configuration
```

## Troubleshooting

### Backend Issues

**Port 5000 already in use:**
- Change the port in `backend/app.py`: `socketio.run(app, debug=True, port=5001)`
- Update `API_URL` in `frontend/src/App.jsx` to match

**Database errors:**
- Delete `backend/database.db` and restart the server (this will recreate it)
- Make sure you have write permissions in the backend directory

**Gemini API errors:**
- Verify your API key is correct in the `.env` file
- Check that you have internet connection
- Ensure the API key has proper permissions

### Frontend Issues

**Port already in use:**
- Vite will automatically use the next available port
- Or specify a port: `npm run dev -- --port 3000`

**Module not found errors:**
- Run `npm install` again in the frontend directory
- Delete `node_modules` and `package-lock.json`, then run `npm install`

**Connection refused:**
- Make sure the backend server is running
- Check that the `API_URL` in `App.jsx` matches your backend URL

### Common Issues

**CORS errors:**
- The backend has CORS enabled, but if you see errors, check that both servers are running

**Socket.IO connection fails:**
- Ensure the backend is running before starting the frontend
- Check that both are using the same protocol (http/https)

## Development

### Backend Development
- The server runs in debug mode by default
- Database changes require restarting the server
- Check console for error messages

### Frontend Development
- Hot module replacement (HMR) is enabled
- Changes to React components will reload automatically
- Check browser console for errors

## Environment Variables

### Backend (.env file)
```
GEMINI_API_KEY=your_api_key_here
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/profile` - Get user profile

### Matching
- `PUT /api/users/me/status` - Update user status
- `POST /api/match/find` - Find study matches
- `POST /api/match/invite` - Send invitation

### Statistics
- `GET /api/stats` - Get user statistics
- `GET /api/sessions/history` - Get session history
- `POST /api/sessions/start` - Start session tracking
- `POST /api/sessions/end` - End session tracking

## Technologies Used

### Backend
- Flask - Web framework
- Flask-SocketIO - WebSocket support
- SQLAlchemy - ORM
- Google Gemini API - AI matching
- scikit-learn - Similarity calculations

### Frontend
- React - UI framework
- Vite - Build tool
- Socket.IO Client - Real-time communication
- Axios - HTTP client

## License

This project is for educational purposes.

## Support

If you encounter any issues, check:
1. Both servers are running
2. Environment variables are set correctly
3. Dependencies are installed
4. Ports are not blocked by firewall

