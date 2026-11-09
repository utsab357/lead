# Official Playwright container with all Linux OS dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (Chromium is already in the base image)
RUN npm install

# Copy application source
COPY . .

# Set production environment
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Build Next.js application
RUN npm run build:local

# Expose port (Render sets PORT env automatically)
EXPOSE 3000
ENV PORT=3000

# Start Next.js server
CMD ["npm", "start"]

