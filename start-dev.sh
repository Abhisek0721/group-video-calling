#!/bin/bash

# Navigate to the frontend directory and run npm dev
echo "Starting frontend..."
cd ./frontend || exit
npm run dev &

# Navigate to the backend directory and run npm dev
echo "Starting backend..."
cd ../backend || exit
npm run dev &

# Wait for both processes to complete
wait

echo "Both frontend and backend have been started."
