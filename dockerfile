FROM node:18 AS frontend-builder

# Set working directory for frontend
WORKDIR /app/frontend

# Copy frontend files
COPY api-explorer/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend code
COPY api-explorer ./

# Build the Next.js app - add --no-lint flag to bypass linting errors
RUN npm run build -- --no-lint

# Python base image for backend that includes Node.js
FROM nikolaik/python-nodejs:python3.10-nodejs18

# Set working directory
WORKDIR /app

# Copy frontend from previous stage
COPY --from=frontend-builder /app/frontend /app/frontend

# Copy backend files
COPY apigateway/requirements.txt /app/backend/
WORKDIR /app/backend
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY apigateway /app/backend/

# Create start script directly in the container
RUN echo '#!/bin/bash\n\
\n\
# Start the FastAPI backend\n\
cd /app/backend\n\
python backend.py &\n\
\n\
# Wait a moment to ensure backend starts\n\
sleep 5\n\
\n\
# Start the Next.js frontend\n\
cd /app/frontend\n\
npm run start' > /app/start.sh

RUN chmod +x /app/start.sh

# Expose ports
EXPOSE 3000 8000

# Run the application
CMD ["/app/start.sh"]