# Use Node.js official image
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Expose port
EXPOSE 8000

# Command to run your backend server
CMD ["node", "dist/backend-server.js"]  # Adjust path if needed
