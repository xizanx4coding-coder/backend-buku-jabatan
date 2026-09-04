# Build Stage
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

# Production Stage
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY public/ ./public/
# Note: The Excel spreadsheet must be mounted or placed in this directory at runtime
EXPOSE 3005
CMD ["npm", "start"]
