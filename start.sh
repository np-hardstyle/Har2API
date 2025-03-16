#!/bin/bash

# Start the FastAPI backend
cd /app/backend
python backend.py &

# Wait a moment to ensure backend starts
sleep 5

# Start the Next.js frontend
cd /app/frontend
npm run start