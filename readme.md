# 🚀 API Explorer

A full-stack application with a Next.js frontend and FastAPI backend for exploring APIs.

![API Explorer](https://raw.githubusercontent.com/np-hardstyle/Har2API/tree/docs/image.png)

## 📹 Demo 
Check out the demo video: [Watch on YouTube](https://youtu.be/WtsjXHG-nCQ)

## 📋 Overview

API Explorer is a containerized full-stack application that allows users to interact with APIs through an intuitive interface. The project consists of:

- **Frontend**: Next.js application with Tailwind CSS
- **Backend**: FastAPI service

## 🛠️ Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop) installed on your machine
- OpenAI API key (for backend functionality)

## 🚀 Getting Started

### Step 1: Clone the repository

```bash
git clone https://github.com/np-hardstyle/Har2API.git
cd Har2API
```

### Step 2: Add API Configuration

Create a `config.ini` file in the `apigateway` folder with your OpenAI API key:

```ini
[openai]
api_key=<your_openai_key>
```

### Step 3: Build and Run with Docker

Build the Docker image:

```bash
docker build -t api-explorer .
```

Alternatively (without cache)
```bash
docker build --no-cache -t api-explorer .
```

Run the container:

```bash
docker run -p 3000:3000 -p 8000:8000 api-explorer
```

### Step 4: Access the Application

Open your browser and navigate to:
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:8000](http://localhost:8000)

## 📂 Project Structure

```
/
├── api-explorer/           # Frontend Next.js application
│   ├── src/                # Source code
│   ├── public/             # Static assets
│   ├── package.json        # NPM dependencies
│   └── ...                 # Other Next.js files
│
├── apigateway/             # Backend FastAPI application
│   ├── backend.py          # Main backend code
│   ├── requirements.txt    # Python dependencies
│   ├── config.ini          # API configuration (you must create this)
│   └── ...                 # Other backend files
│
├── Dockerfile              # Docker configuration
├── start.sh               # Startup script for Docker
└── README.md              # This file
```

## 🐳 Docker Details

The application uses a multi-stage Docker build:
1. Builds the Next.js frontend
2. Creates a final image with both Python and Node.js 
3. Runs both services when the container starts

```bash
# To see running containers
docker ps

# To stop the container
docker stop <container_id>

# To restart with updated code
docker build -t api-explorer . && docker run -p 3000:3000 -p 8000:8000 api-explorer
```

## 🔧 Configuration

- Frontend port: 3000
- Backend port: 8000
- The frontend proxies API requests to the backend

## 💡 Development Notes

- For local development outside Docker, you'll need to run both the frontend and backend separately
- ESLint errors are bypassed in the Docker build process with `--no-lint` flag
- Remember to never commit your `config.ini` file containing API keys

## ❓ Troubleshooting

**Container doesn't start:**
- Check Docker logs: `docker logs <container_id>`
- Verify ports 3000 and 8000 aren't in use by other applications

**API connections fail:**
- Ensure your `config.ini` file is properly formatted
- Verify your OpenAI API key is valid

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
